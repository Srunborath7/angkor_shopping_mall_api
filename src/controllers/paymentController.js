const crypto = require('crypto');
const { Order, OrderItem, Product, ProductVariant, User, TradeProduct } = require('../models/relationships');
const abaPaywayService = require('../services/abaPaywayService');
const { successResponse, errorResponse } = require('../utils/response');
const { bot } = require('../config/telegram');
const { trackInteractionBulk } = require('../utils/trackInteraction');
const { Op } = require('sequelize');

// Helper to check for standard UUIDv4 format
const isValidUUID = (str) => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

class PaymentController {
    /**
     * Generate ABA PayWay Dynamic QR code / Payment payload
     */
    async generateABAQR(req, res) {
        try {
            const { order_id, orderId, currency = 'USD', amount: customAmount } = req.body;
            const targetOrderId = order_id || orderId;

            let finalAmount = customAmount;
            let order = null;

            if (targetOrderId) {
                const isUUID = isValidUUID(targetOrderId);
                const searchCriteria = isUUID ? { id: targetOrderId } : { payment_intent_id: targetOrderId };

                order = await Order.findOne({
                    where: searchCriteria,
                    include: [
                        {
                            model: OrderItem,
                            as: 'items',
                            include: [
                                { model: Product, as: 'product' },
                                { model: ProductVariant, as: 'variant' }
                            ]
                        },
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'name', 'email', 'phone']
                        }
                    ]
                });

                if (!order && isUUID) {
                    return errorResponse(res, 'Order not found', 404);
                }

                if (order && order.status === 'paid') {
                    return errorResponse(res, 'This order has already been paid', 400);
                }

                if (order) {
                    finalAmount = parseFloat(order.total_amount);
                }
            }

            if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
                return errorResponse(res, 'Invalid payment amount', 400);
            }

            const isKHR = String(currency).toUpperCase() === 'KHR';
            let payableAmount = finalAmount;
            if (isKHR) {
                payableAmount = Math.round(finalAmount * 4100);
            }

            // Extract customer info
            const customerName = order?.user?.name || 'Customer';
            const nameParts = customerName.split(' ');
            const firstName = nameParts[0] || 'Valued';
            const lastName = nameParts.slice(1).join(' ') || 'Customer';
            const email = order?.user?.email || '';
            const phone = order?.contact_phone || order?.user?.phone || '';

            // Extract item list
            const items = order?.items?.map(it => ({
                name: it.product?.name || 'Product',
                quantity: it.quantity,
                price: parseFloat(it.price)
            })) || [];

            const paywayResult = await abaPaywayService.generateAbaQR({
                orderId: order?.id || Date.now(),
                amount: payableAmount,
                currency: isKHR ? 'KHR' : 'USD',
                firstName,
                lastName,
                email,
                phone,
                items
            });

            if (order) {
                await order.update({
                    khqr_string: paywayResult.qrString,
                    khqr_md5: paywayResult.md5,
                    khqr_expires_at: paywayResult.expiresAt,
                    currency: paywayResult.currency,
                    payment_method: 'ABA_PAYWAY',
                    payment_intent_id: `ABA-${paywayResult.tranId}`
                });
            }

            const responseData = {
                orderId: order?.id,
                ...paywayResult
            };

            return successResponse(res, 'ABA PayWay QR generated successfully', responseData);
        } catch (error) {
            console.error('Error generating ABA PayWay QR:', error);
            return errorResponse(res, error.message || 'Failed to generate ABA PayWay QR', 500);
        }
    }

    /**
     * Check real-time payment status by tran_id or MD5
     */
    async checkABAStatus(req, res) {
        try {
            const { tran_id, md5 } = req.params;
            const queryKey = String(tran_id || md5 || '').trim();

            if (!queryKey) {
                return errorResponse(res, 'Transaction ID or MD5 parameter is required', 400);
            }

            // Build safe PostgreSQL search conditions
            const orConditions = [
                { khqr_md5: queryKey },
                { payment_intent_id: `ABA-${queryKey}` },
                { payment_intent_id: queryKey },
                { transaction_hash: queryKey },
                { transaction_hash: `ABA-${queryKey}` }
            ];

            // Only add UUID search if queryKey matches UUID format to prevent Postgres syntax error
            if (isValidUUID(queryKey)) {
                orConditions.push({ id: queryKey });
            }

            let order = null;
            try {
                order = await Order.findOne({
                    where: { [Op.or]: orConditions },
                    include: [
                        {
                            model: OrderItem,
                            as: 'items',
                            include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                        },
                        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
                    ]
                });
            } catch (dbErr) {
                console.warn('DB Order query warning on checkABAStatus:', dbErr.message);
            }

            if (order && order.status === 'paid') {
                return successResponse(res, 'Payment already verified', {
                    isPaid: true,
                    status: 'paid',
                    orderId: order.id,
                    paidAt: order.paid_at,
                    transactionHash: order.transaction_hash
                });
            }

            // Verify with ABA PayWay backend
            const abaCheck = await abaPaywayService.checkTransactionStatus(queryKey);

            if (abaCheck && abaCheck.isPaid) {
                const txn = abaCheck.transaction || {};
                const txnHash = txn.tran_id || queryKey;

                if (order) {
                    await order.update({
                        status: 'paid',
                        paid_at: new Date(),
                        transaction_hash: `ABA-${txnHash}`,
                        payment_intent_id: `ABA-${txnHash}`,
                        payment_method: 'ABA_PAYWAY'
                    });

                    // Update product inventory
                    if (order.items && order.items.length > 0) {
                        for (const item of order.items) {
                            try {
                                if (item.product_variant_id && item.variant) {
                                    const newStock = Math.max(0, item.variant.stock_quantity - item.quantity);
                                    await item.variant.update({ stock_quantity: newStock });
                                } else if (item.product) {
                                    const newStock = Math.max(0, item.product.stock_quantity - item.quantity);
                                    await item.product.update({ stock_quantity: newStock });
                                }
                            } catch (stockErr) {
                                console.warn('Stock update warning for item:', item.id, stockErr);
                            }
                        }
                    }

                    // Send Telegram notification
                    try {
                        const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;
                        if (bot && chatId) {
                            const orderDisplay = typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : order.id;
                            bot.sendMessage(
                                chatId,
                                `✨ *ABA PayWay Payment Received!*\n\n` +
                                `📦 *Order:* \`#ORD-${orderDisplay}\`\n` +
                                `💰 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                                `👤 *Customer:* ${order.user?.name || 'Customer'} (${order.contact_phone || 'N/A'})\n` +
                                `🏦 *Method:* ABA PayWay / KHQR\n` +
                                `🔑 *ABA Tran ID:* \`${txnHash}\``,
                                { parse_mode: 'Markdown' }
                            ).catch(e => console.warn('Telegram send warning:', e.message));
                        }
                    } catch (tgErr) {
                        console.warn('Telegram notification err:', tgErr);
                    }
                }

                return successResponse(res, 'Payment successfully verified via ABA PayWay', {
                    isPaid: true,
                    status: 'paid',
                    orderId: order?.id,
                    transaction: txn
                });
            }

            return successResponse(res, 'Payment pending', {
                isPaid: false,
                status: order ? order.status : 'pending',
                orderId: order?.id,
                message: 'Awaiting ABA PayWay payment confirmation'
            });
        } catch (error) {
            console.error('Error checking ABA status:', error);
            return errorResponse(res, error.message || 'Failed to verify ABA PayWay status', 500);
        }
    }

    /**
     * Instant Payment Simulation for test / development
     */
    async simulatePayment(req, res) {
        try {
            const { md5, tran_id, tranId, order_id, orderId } = req.body;
            const targetId = order_id || orderId;
            const targetKey = String(tran_id || tranId || md5 || '').trim();

            let whereCondition = null;

            if (targetId && isValidUUID(targetId)) {
                whereCondition = { id: targetId };
            } else if (targetKey) {
                const orConds = [
                    { khqr_md5: targetKey },
                    { payment_intent_id: `ABA-${targetKey}` },
                    { payment_intent_id: targetKey },
                    { transaction_hash: targetKey },
                    { transaction_hash: `ABA-${targetKey}` }
                ];
                if (isValidUUID(targetKey)) {
                    orConds.push({ id: targetKey });
                }
                whereCondition = { [Op.or]: orConds };
            }

            if (!whereCondition) {
                return errorResponse(res, 'Either a valid order_id, tran_id, or md5 is required to simulate payment', 400);
            }

            const order = await Order.findOne({
                where: whereCondition,
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                    },
                    { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
                ]
            });

            if (!order) {
                return errorResponse(res, 'Order not found for simulation', 404);
            }

            const mockTxnHash = `ABA-SIM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            await order.update({
                status: 'paid',
                paid_at: new Date(),
                transaction_hash: mockTxnHash,
                payment_intent_id: mockTxnHash,
                payment_method: 'ABA_PAYWAY'
            });

            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    try {
                        if (item.product_variant_id && item.variant) {
                            const newStock = Math.max(0, item.variant.stock_quantity - item.quantity);
                            await item.variant.update({ stock_quantity: newStock });
                        } else if (item.product) {
                            const newStock = Math.max(0, item.product.stock_quantity - item.quantity);
                            await item.product.update({ stock_quantity: newStock });
                        }
                    } catch (stockErr) {
                        console.warn('Stock update warning on simulation:', stockErr);
                    }
                }
            }

            // Telegram notification on simulation
            try {
                const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;
                if (bot && chatId) {
                    const orderDisplay = typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : order.id;
                    bot.sendMessage(
                        chatId,
                        `⚡ *[TEST SIMULATION] ABA PayWay Confirmed!*\n\n` +
                        `📦 *Order:* \`#ORD-${orderDisplay}\`\n` +
                        `💰 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                        `🏦 *Method:* ABA PayWay (Simulated)\n` +
                        `🔑 *Txn Hash:* \`${mockTxnHash}\``,
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }
            } catch (e) {}

            return successResponse(res, 'Simulated ABA PayWay payment confirmed successfully', {
                isPaid: true,
                status: 'paid',
                orderId: order.id,
                transactionHash: mockTxnHash
            });
        } catch (error) {
            console.error('Error simulating ABA payment:', error);
            return errorResponse(res, error.message || 'Simulation failed', 500);
        }
    }

    /**
     * Handle ABA PayWay callback / pushback notification
     * Verifies HMAC-SHA512 signature and updates order status
     */
    async handleAbaCallback(req, res) {
        try {
            const callbackData = req.body;
            const receivedSignature = req.headers['x-payway-hmac-sha512'] || req.headers['X-PAYWAY-HMAC-SHA512'] || '';

            // Verify callback signature
            const secretKey = process.env.ABA_PAYWAY_API_KEY || '';
            if (!secretKey) {
                console.warn('ABA callback received but ABA_PAYWAY_API_KEY is not configured');
                return successResponse(res, 'Callback received (signature verification skipped - no API key configured)', {
                    status: 'acknowledged'
                });
            }

            // Sort fields by key and concatenate values
            const sortedKeys = Object.keys(callbackData).sort();
            const rawString = sortedKeys.map(key => {
                const value = callbackData[key];
                if (Array.isArray(value)) {
                    return JSON.stringify(value);
                }
                if (value && typeof value === 'object') {
                    return JSON.stringify(value);
                }
                return String(value ?? '');
            }).join('');

            // Generate expected signature
            const expectedSignature = crypto
                .createHmac('sha512', secretKey)
                .update(rawString)
                .digest('base64');

            // Constant-time comparison
            const signatureValid = crypto.timingSafeEqual(
                Buffer.from(receivedSignature),
                Buffer.from(expectedSignature)
            );

            if (!signatureValid) {
                console.warn('ABA callback signature verification failed');
                return errorResponse(res, 'Invalid callback signature', 401);
            }

            // Parse return_params to extract our custom data
            let returnParams = {};
            if (callbackData.return_params) {
                try {
                    returnParams = JSON.parse(callbackData.return_params);
                } catch (e) {
                    console.warn('Failed to parse ABA return_params:', e.message);
                }
            }

            const tranId = callbackData.tran_id;
            const status = callbackData.status;
            const apv = callbackData.apv;
            const orderId = returnParams.order_id;

            console.log(`ABA callback received: tran_id=${tranId}, status=${status}, order_id=${orderId}`);

            // status "0" means success in ABA PayWay
            if (status === '0' || status === 0) {
                // Find order by tran_id or order_id
                let order = null;
                if (tranId) {
                    order = await Order.findOne({
                        where: { payment_intent_id: `ABA-${tranId}` }
                    });
                }
                if (!order && orderId) {
                    order = await Order.findByPk(orderId);
                }

                if (order && order.status !== 'paid') {
                    await order.update({
                        status: 'paid',
                        paid_at: new Date(),
                        transaction_hash: `ABA-${tranId}`,
                        payment_intent_id: `ABA-${tranId}`,
                        payment_method: 'ABA_PAYWAY'
                    });

                    // Update inventory
                    if (order.items && order.items.length > 0) {
                        for (const item of order.items) {
                            try {
                                if (item.product_variant_id && item.variant) {
                                    const newStock = Math.max(0, item.variant.stock_quantity - item.quantity);
                                    await item.variant.update({ stock_quantity: newStock });
                                } else if (item.product) {
                                    const newStock = Math.max(0, item.product.stock_quantity - item.quantity);
                                    await item.product.update({ stock_quantity: newStock });
                                }
                            } catch (stockErr) {
                                console.warn('Stock update warning for item:', item.id, stockErr);
                            }
                        }
                    }

                    // Send Telegram notification
                    try {
                        const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;
                        if (bot && chatId) {
                            const orderDisplay = typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : order.id;
                            bot.sendMessage(
                                chatId,
                                `✨ *ABA PayWay Payment Received!*\n\n` +
                                `📦 *Order:* \`#ORD-${orderDisplay}\`\n` +
                                `💰 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                                `👤 *Customer:* ${order.user?.name || 'Customer'} (${order.contact_phone || 'N/A'})\n` +
                                `🏦 *Method:* ABA PayWay / KHQR\n` +
                                `🔑 *ABA Tran ID:* \`${tranId}\``,
                                { parse_mode: 'Markdown' }
                            ).catch(e => console.warn('Telegram send warning:', e.message));
                        }
                    } catch (tgErr) {
                        console.warn('Telegram notification err:', tgErr);
                    }
                }

                return successResponse(res, 'Payment callback processed successfully', {
                    isPaid: true,
                    status: 'paid',
                    tranId,
                    apv,
                    orderId
                });
            }

            return successResponse(res, 'Callback received - payment pending', {
                isPaid: false,
                status: callbackData.status,
                tranId
            });
        } catch (error) {
            console.error('Error handling ABA callback:', error);
            return errorResponse(res, error.message || 'Callback processing failed', 500);
        }
    }
}

const controller = new PaymentController();
// Provide backward compatible method aliases
controller.generateKHQR = controller.generateABAQR.bind(controller);
controller.checkKHQRStatus = controller.checkABAStatus.bind(controller);

module.exports = controller;
