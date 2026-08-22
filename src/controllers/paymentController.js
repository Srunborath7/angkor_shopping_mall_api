const { Order, OrderItem, Product, ProductVariant, User, TradeProduct } = require('../models/relationships');
const bakongKhqrService = require('../services/bakongKhqrService');
const { successResponse, errorResponse } = require('../utils/response');
const { bot } = require('../config/telegram');
const { trackInteractionBulk } = require('../utils/trackInteraction');

class PaymentController {
    async generateKHQR(req, res) {
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

            const khqrResult = bakongKhqrService.generateOrderKHQR({
                orderId: order?.id || Date.now(),
                amount: payableAmount,
                currency: isKHR ? 'KHR' : 'USD',
                billNumber: order ? `ORD-${order.id.slice(0, 8).toUpperCase()}` : `MALL-${Date.now()}`
            });

            if (order) {
                await order.update({
                    khqr_string: khqrResult.qrString,
                    khqr_md5: khqrResult.md5,
                    khqr_expires_at: khqrResult.expiresAt,
                    currency: khqrResult.currency,
                    payment_method: 'KHQR'
                });
            }

            const responseData = {
                orderId: order?.id,
                ...khqrResult
            };

            return successResponse(res, 'Bakong KHQR generated successfully', responseData);
        } catch (error) {
            console.error('Error generating KHQR:', error);
            return errorResponse(res, error.message || 'Failed to generate Bakong KHQR', 500);
        }
    }

    async checkKHQRStatus(req, res) {
        try {
            const { md5 } = req.params;
            if (!md5) {
                return errorResponse(res, 'MD5 hash parameter is required', 400);
            }

            const order = await Order.findOne({
                where: { khqr_md5: md5 },
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

            const bakongCheck = await bakongKhqrService.checkTransactionStatus(md5);

            if (bakongCheck.isPaid) {
                const txn = bakongCheck.transaction || {};
                const txnHash = txn.hash || txn.md5 || md5;

                if (order) {
                    await order.update({
                        status: 'paid',
                        paid_at: new Date(),
                        transaction_hash: txnHash,
                        payment_intent_id: `BAKONG-${txnHash.substring(0, 16)}`
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
                                console.warn('Stock update warning for item:', item.id, stockErr);
                            }
                        }
                    }

                    try {
                        const chatId = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;
                        if (bot && chatId) {
                            bot.sendMessage(
                                chatId,
                                `🎉 *KHQR Payment Received!*\n\n` +
                                `📦 *Order:* \`#ORD-${order.id.slice(0, 8).toUpperCase()}\`\n` +
                                `💰 *Amount:* $${parseFloat(order.total_amount).toFixed(2)}\n` +
                                `👤 *Customer:* ${order.user?.name || 'Customer'} (${order.contact_phone})\n` +
                                `🏦 *Method:* Bakong KHQR\n` +
                                `🔗 *Txn Hash:* \`${txnHash}\``,
                                { parse_mode: 'Markdown' }
                            ).catch(e => console.warn('Telegram send warning:', e.message));
                        }
                    } catch (tgErr) {
                        console.warn('Telegram notification err:', tgErr);
                    }
                }

                return successResponse(res, 'Payment successfully verified via Bakong KHQR', {
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
                message: 'Awaiting payment confirmation'
            });
        } catch (error) {
            console.error('Error checking KHQR status:', error);
            return errorResponse(res, error.message || 'Failed to verify KHQR status', 500);
        }
    }

    async simulatePayment(req, res) {
        try {
            const { md5, order_id, orderId } = req.body;
            const targetId = order_id || orderId;

            let whereCondition = {};
            if (md5) whereCondition.khqr_md5 = md5;
            if (targetId) whereCondition.id = targetId;

            if (Object.keys(whereCondition).length === 0) {
                return errorResponse(res, 'Either md5 or order_id is required to simulate payment', 400);
            }

            const order = await Order.findOne({
                where: whereCondition,
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                    }
                ]
            });

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            const mockTxnHash = `BKNG-SIM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

            await order.update({
                status: 'paid',
                paid_at: new Date(),
                transaction_hash: mockTxnHash,
                payment_intent_id: mockTxnHash,
                payment_method: 'KHQR'
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

            return successResponse(res, 'Simulated KHQR payment confirmed successfully', {
                isPaid: true,
                status: 'paid',
                orderId: order.id,
                transactionHash: mockTxnHash
            });
        } catch (error) {
            console.error('Error simulating KHQR payment:', error);
            return errorResponse(res, error.message || 'Simulation failed', 500);
        }
    }
}

module.exports = new PaymentController();
