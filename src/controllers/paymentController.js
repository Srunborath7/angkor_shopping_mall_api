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

                try {
                    order = await Order.findOne({ where: searchCriteria });
                } catch (orderFindErr) {
                    console.warn('Order find warning:', orderFindErr.message);
                }

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

            // Extract customer info safely
            let firstName = 'Valued';
            let lastName = 'Customer';
            let email = 'customer@angkor.com';
            let phone = (order?.contact_phone && String(order.contact_phone).trim()) || '0974242291';

            if (order && order.user_id) {
                try {
                    const user = await User.findByPk(order.user_id, {
                        attributes: ['id', 'name', 'email', 'phone']
                    });
                    if (user) {
                        const nameParts = (user.name || 'Customer').split(' ');
                        firstName = nameParts[0] || 'Valued';
                        lastName = nameParts.slice(1).join(' ') || 'Customer';
                        if (user.email) email = user.email;
                        if (user.phone && !phone) phone = user.phone;
                    }
                } catch (userErr) {
                    console.warn('User lookup warning:', userErr.message);
                }
            }

            const paywayResult = await abaPaywayService.generateAbaQR({
                orderId: order?.id || Date.now(),
                amount: payableAmount,
                currency: isKHR ? 'KHR' : 'USD',
                firstName,
                lastName,
                email,
                phone,
                items: []
            });

            if (order) {
                try {
                    await order.update({
                        khqr_string: paywayResult.qrString,
                        khqr_md5: paywayResult.md5,
                        khqr_expires_at: paywayResult.expiresAt,
                        currency: paywayResult.currency,
                        payment_method: 'ABA_PAYWAY',
                        payment_intent_id: `ABA-${paywayResult.tranId}`
                    });
                } catch (updateErr) {
                    console.warn('Order payment intent update warning:', updateErr.message);
                }
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
            const cleanKey = queryKey.replace(/^ABA-/i, '').trim();
            const orConditions = [
                { khqr_md5: queryKey },
                { khqr_md5: cleanKey },
                { payment_intent_id: `ABA-${cleanKey}` },
                { payment_intent_id: `ABA-${queryKey}` },
                { payment_intent_id: queryKey },
                { payment_intent_id: cleanKey },
                { transaction_hash: queryKey },
                { transaction_hash: cleanKey },
                { transaction_hash: `ABA-${cleanKey}` }
            ];

            if (isValidUUID(queryKey)) {
                orConditions.push({ id: queryKey });
            }

            let order = null;
            try {
                order = await Order.findOne({
                    where: { [Op.or]: orConditions }
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
                    try {
                        await order.update({
                            status: 'paid',
                            paid_at: new Date(),
                            transaction_hash: `ABA-${txnHash}`,
                            payment_intent_id: `ABA-${txnHash}`,
                            payment_method: 'ABA_PAYWAY'
                        });

                        // Lightweight inventory stock update
                        const orderItems = await OrderItem.findAll({ where: { order_id: order.id } });
                        for (const item of orderItems) {
                            try {
                                if (item.variant_id) {
                                    const variant = await ProductVariant.findByPk(item.variant_id);
                                    if (variant) {
                                        const newStock = Math.max(0, variant.stock_quantity - item.quantity);
                                        await variant.update({ stock_quantity: newStock });
                                    }
                                } else if (item.product_id) {
                                    const product = await Product.findByPk(item.product_id);
                                    if (product) {
                                        const newStock = Math.max(0, product.stock_quantity - item.quantity);
                                        await product.update({ stock_quantity: newStock });
                                    }
                                }
                            } catch (stockErr) {
                                console.warn('Stock update warning for item:', item.id, stockErr.message);
                            }
                        }
                    } catch (orderUpdateErr) {
                        console.warn('Order status update warning:', orderUpdateErr.message);
                    }

                    // Send Telegram notification
                    try {
                        const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;
                        if (bot && chatId) {
                            const orderDisplay = typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : order.id;
                            bot.sendMessage(
                                chatId,
                                `🎉 *ABA PayWay Payment Received!*\n\n` +
                                `📦 *Order:* \`#ORD-${orderDisplay}\`\n` +
                                `💵 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                                `💳 *Method:* ABA PayWay / KHQR\n` +
                                `🏷️ *ABA Tran ID:* \`${txnHash}\``,
                                { parse_mode: 'Markdown' }
                            ).catch(e => console.warn('Telegram send warning:', e.message));
                        }
                    } catch (tgErr) {
                        console.warn('Telegram notification err:', tgErr.message);
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

            const mockTxnHash = `ABA-SIM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            let order = null;
            if (whereCondition) {
                try {
                    order = await Order.findOne({ where: whereCondition });
                } catch (simOrderErr) {
                    console.warn('Simulation order query warning:', simOrderErr.message);
                }
            }

            if (order) {
                try {
                    await order.update({
                        status: 'paid',
                        paid_at: new Date(),
                        transaction_hash: mockTxnHash,
                        payment_intent_id: order.payment_intent_id || (targetKey ? (targetKey.startsWith('ABA-') ? targetKey : `ABA-${targetKey}`) : mockTxnHash),
                        payment_method: 'ABA_PAYWAY'
                    });

                    const orderItems = await OrderItem.findAll({ where: { order_id: order.id } });
                    for (const item of orderItems) {
                        try {
                            if (item.variant_id) {
                                const variant = await ProductVariant.findByPk(item.variant_id);
                                if (variant) {
                                    const newStock = Math.max(0, variant.stock_quantity - item.quantity);
                                    await variant.update({ stock_quantity: newStock });
                                }
                            } else if (item.product_id) {
                                const product = await Product.findByPk(item.product_id);
                                if (product) {
                                    const newStock = Math.max(0, product.stock_quantity - item.quantity);
                                    await product.update({ stock_quantity: newStock });
                                }
                            }
                        } catch (stockErr) {
                            console.warn('Stock update warning on simulation:', stockErr.message);
                        }
                    }
                } catch (updateErr) {
                    console.warn('Simulation order update warning:', updateErr.message);
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
                            `💵 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                            `💳 *Method:* ABA PayWay (Simulated)\n` +
                            `🏷️ *Txn Hash:* \`${mockTxnHash}\``,
                            { parse_mode: 'Markdown' }
                        ).catch(() => {});
                    }
                } catch (e) {}
            }

            return successResponse(res, 'Simulated ABA PayWay payment confirmed successfully', {
                isPaid: true,
                status: 'paid',
                orderId: order ? order.id : (targetId || targetKey),
                transactionHash: mockTxnHash
            });
        } catch (error) {
            console.error('Error simulating ABA payment:', error);
            return errorResponse(res, error.message || 'Simulation failed', 500);
        }
    }

    /**
     * Handle ABA PayWay callback / pushback notification
     */
    /**
     * Get live list of transactions from ABA PayWay Sandbox/Live gateway
     */
    async getAbaTransactions(req, res) {
        try {
            const { from_date, to_date, status } = req.query;
            const result = await abaPaywayService.getTransactionList({ from_date, to_date, status });
            return successResponse(res, 'ABA PayWay transactions fetched successfully', result);
        } catch (error) {
            console.error('Error fetching ABA transactions:', error);
            return errorResponse(res, error.message || 'Failed to fetch transactions', 500);
        }
    }

    async handleAbaCallback(req, res) {
        try {
            const callbackData = req.body;
            const receivedSignature = req.headers['x-payway-hmac-sha512'] || req.headers['X-PAYWAY-HMAC-SHA512'] || '';

            const secretKey = process.env.ABA_PAYWAY_API_KEY || '';
            if (secretKey && receivedSignature) {
                const sortedKeys = Object.keys(callbackData).sort();
                const rawString = sortedKeys.map(key => {
                    const value = callbackData[key];
                    if (Array.isArray(value) || (value && typeof value === 'object')) {
                        return JSON.stringify(value);
                    }
                    return String(value ?? '');
                }).join('');

                const expectedSignature = crypto
                    .createHmac('sha512', secretKey)
                    .update(rawString)
                    .digest('base64');

                const signatureValid = crypto.timingSafeEqual(
                    Buffer.from(receivedSignature),
                    Buffer.from(expectedSignature)
                );

                if (!signatureValid) {
                    console.warn('ABA callback signature verification failed');
                    return errorResponse(res, 'Invalid callback signature', 401);
                }
            }

            const tranId = callbackData.tran_id;
            const status = callbackData.status;
            const apv = callbackData.apv;

            if (status === '0' || status === 0) {
                let order = null;
                if (tranId) {
                    order = await Order.findOne({
                        where: { payment_intent_id: `ABA-${tranId}` }
                    });
                }

                if (order && order.status !== 'paid') {
                    await order.update({
                        status: 'paid',
                        paid_at: new Date(),
                        transaction_hash: `ABA-${tranId}`,
                        payment_intent_id: `ABA-${tranId}`,
                        payment_method: 'ABA_PAYWAY'
                    });
                }

                return successResponse(res, 'Payment callback processed successfully', {
                    isPaid: true,
                    status: 'paid',
                    tranId,
                    apv
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
