const { Order, OrderItem, Product, ProductVariant, User, TradeProduct } = require('../models/relationships');
const abaPaywayService = require('../services/abaPaywayService');
const { successResponse, errorResponse } = require('../utils/response');
const { bot } = require('../config/telegram');
const { trackInteractionBulk } = require('../utils/trackInteraction');
const { Op } = require('sequelize');

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
                order = await Order.findByPk(targetOrderId, {
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

                if (!order) {
                    return errorResponse(res, 'Order not found', 404);
                }

                if (order.status === 'paid') {
                    return errorResponse(res, 'This order has already been paid', 400);
                }

                finalAmount = parseFloat(order.total_amount);
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
            const queryKey = tran_id || md5;

            if (!queryKey) {
                return errorResponse(res, 'Transaction ID or MD5 parameter is required', 400);
            }

            // Find order by matching MD5 or matching payment_intent_id / tranId
            const order = await Order.findOne({
                where: {
                    [Op.or]: [
                        { khqr_md5: queryKey },
                        { payment_intent_id: `ABA-${queryKey}` },
                        { payment_intent_id: queryKey },
                        { id: queryKey }
                    ]
                },
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                    },
                    { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
                ]
            });

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

            if (abaCheck.isPaid) {
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
                            bot.sendMessage(
                                chatId,
                                `✨ *ABA PayWay Payment Received!*\n\n` +
                                `📦 *Order:* \`#ORD-${order.id.slice(0, 8).toUpperCase()}\`\n` +
                                `💰 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                                `👤 *Customer:* ${order.user?.name || 'Customer'} (${order.contact_phone})\n` +
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
            const targetKey = tran_id || tranId || md5;

            let whereCondition = {};
            if (targetId) {
                whereCondition.id = targetId;
            } else if (targetKey) {
                whereCondition = {
                    [Op.or]: [
                        { khqr_md5: targetKey },
                        { payment_intent_id: `ABA-${targetKey}` },
                        { payment_intent_id: targetKey }
                    ]
                };
            }

            if (Object.keys(whereCondition).length === 0) {
                return errorResponse(res, 'Either tran_id, md5, or order_id is required to simulate payment', 400);
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
                return errorResponse(res, 'Order not found', 404);
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
                    bot.sendMessage(
                        chatId,
                        `⚡ *[TEST SIMULATION] ABA PayWay Confirmed!*\n\n` +
                        `📦 *Order:* \`#ORD-${order.id.slice(0, 8).toUpperCase()}\`\n` +
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
}

const controller = new PaymentController();
// Provide backward compatible method aliases
controller.generateKHQR = controller.generateABAQR.bind(controller);
controller.checkKHQRStatus = controller.checkABAStatus.bind(controller);

module.exports = controller;