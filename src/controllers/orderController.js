const { Order, OrderItem, CartItem, Product, User, Category, Brand } = require('../models/relationships');
const { successResponse, errorResponse } = require('../utils/response');
const paymentService = require('../services/paymentService');
const { bot } = require('../config/telegram');

class OrderController {
    async checkout(req, res) {
        try {
            const userId = req.user.id;
            const { shipping_address, contact_phone } = req.body;

            if (!shipping_address || !contact_phone) {
                return errorResponse(res, 'Shipping address and contact phone are required', 400);
            }

            // 1. Fetch Cart Items
            const cartItems = await CartItem.findAll({
                where: { user_id: userId },
                include: [{ model: Product, as: 'product' }]
            });

            if (cartItems.length === 0) {
                return errorResponse(res, 'Cannot checkout: Your cart is empty', 400);
            }

            // 2. Validate stock and calculate total amount
            let totalAmount = 0;
            for (const item of cartItems) {
                if (!item.product) {
                    return errorResponse(res, 'Product in cart no longer exists', 404);
                }
                if (item.product.stock_quantity < item.quantity) {
                    return errorResponse(res, `Insufficient stock for product: ${item.product.name}. Available: ${item.product.stock_quantity}`, 400);
                }
                totalAmount += parseFloat(item.product.price) * item.quantity;
            }

            // 3. Create Order in transaction/sequence
            const order = await Order.create({
                user_id: userId,
                total_amount: totalAmount,
                status: 'pending',
                shipping_address,
                contact_phone
            });

            // 4. Create Order Items and decrease product stock
            for (const item of cartItems) {
                await OrderItem.create({
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.product.price // save historical price
                });

                // Deduct stock
                await Product.decrement('stock_quantity', {
                    by: item.quantity,
                    where: { id: item.product_id }
                });
            }

            // 5. Clear Cart
            await CartItem.destroy({
                where: { user_id: userId }
            });

            // 6. Generate Payment Session
            const paymentDetails = await paymentService.createCheckoutSession(order, req);

            return successResponse(res, 'Order placed successfully. Please proceed to payment.', {
                order,
                payment: paymentDetails
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getOrders(req, res) {
        try {
            const userId = req.user.id;
            const orders = await Order.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }]
                    }
                ],
                order: [['created_at', 'DESC']]
            });

            return successResponse(res, 'Orders retrieved successfully', orders);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getOrderById(req, res) {
        try {
            const { id } = req.params;
            const order = await Order.findOne({
                where: { id },
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }]
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

            return successResponse(res, 'Order retrieved successfully', order);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getAdminOrders(req, res) {
        try {
            const orders = await Order.findAll({
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }]
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone']
                    }
                ],
                order: [['created_at', 'DESC']]
            });

            return successResponse(res, 'Admin orders retrieved successfully', orders);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async updateOrderStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, shipping_address, contact_phone } = req.body;

            const order = await Order.findByPk(id, {
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }]
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone', 'telegram_chat_id']
                    }
                ]
            });

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            if (status) {
                const validStatuses = ['pending', 'paid', 'failed', 'shipped', 'completed', 'cancelled'];
                if (!validStatuses.includes(status)) {
                    return errorResponse(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
                }

                // Restock items if order status transitions to cancelled from active
                if (status === 'cancelled' && order.status !== 'cancelled') {
                    for (const item of order.items) {
                        await Product.increment('stock_quantity', {
                            by: item.quantity,
                            where: { id: item.product_id }
                        });
                    }
                }

                order.status = status;
            }

            if (shipping_address) order.shipping_address = shipping_address;
            if (contact_phone) order.contact_phone = contact_phone;

            await order.save();

            // Send notification via Telegram if user connected
            if (order.user && order.user.telegram_chat_id && status) {
                try {
                    const text = `🛍️ *Angkor Shopping Mall - Order Update!*

━━━━━━━━━━━━━━
🆔 *Order ID:* \`${order.id}\`
📦 *New Status:* *${status.toUpperCase()}*
💰 *Total Amount:* $${order.total_amount}
━━━━━━━━━━━━━━

Thank you for shopping with us!`;
                    await bot.sendMessage(order.user.telegram_chat_id, text, { parse_mode: 'Markdown' });
                } catch (tgErr) {
                    console.error("Failed to send telegram notification:", tgErr.message);
                }
            }

            return successResponse(res, 'Order status updated successfully', order);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async deleteOrder(req, res) {
        try {
            const { id } = req.params;
            const order = await Order.findByPk(id);
            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }
            await order.destroy();
            return successResponse(res, 'Order deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async createAdminOrder(req, res) {
        try {
            const { user_id, shipping_address, contact_phone, items, status = 'pending' } = req.body;
            if (!user_id || !shipping_address || !contact_phone || !items || !items.length) {
                return errorResponse(res, 'Missing required fields: user_id, shipping_address, contact_phone, items', 400);
            }

            let totalAmount = 0;
            for (const item of items) {
                const product = await Product.findByPk(item.product_id);
                if (!product) {
                    return errorResponse(res, `Product not found ID: ${item.product_id}`, 404);
                }
                totalAmount += parseFloat(product.price) * item.quantity;
            }

            const order = await Order.create({
                user_id,
                total_amount: totalAmount,
                status,
                shipping_address,
                contact_phone
            });

            for (const item of items) {
                const product = await Product.findByPk(item.product_id);
                await OrderItem.create({
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: product.price
                });
                await Product.decrement('stock_quantity', {
                    by: item.quantity,
                    where: { id: item.product_id }
                });
            }

            const updatedOrder = await Order.findByPk(order.id, {
                include: [
                    { model: OrderItem, as: 'items', include: [{ model: Product, as: 'product' }] },
                    { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }
                ]
            });

            return successResponse(res, 'Order created successfully', updatedOrder);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async payOrder(req, res) {
        try {
            const { id } = req.params;
            const { payment_intent } = req.body;

            const order = await Order.findByPk(id);
            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            if (order.status === 'paid') {
                return successResponse(res, 'Order is already paid', order);
            }

            // Update order status
            order.status = 'paid';
            if (payment_intent) {
                order.payment_intent_id = payment_intent;
            }
            await order.save();

            // Fetch User details to check for Telegram Link
            const user = await User.findByPk(order.user_id);
            if (user && user.telegram_chat_id) {
                try {
                    // Send Order Confirmation to Telegram
                    const text = `🛍️ *Angkor Shopping Mall - Order Paid!*

━━━━━━━━━━━━━━
✅ *Order Status:* Paid
🆔 *Order ID:* \`${order.id}\`
💰 *Total Amount:* $${order.total_amount}
📍 *Shipping Address:* ${order.shipping_address}
━━━━━━━━━━━━━━

Thank you for shopping with us! We will notify you once your order is shipped.`;

                    await bot.sendMessage(user.telegram_chat_id, text, { parse_mode: 'Markdown' });
                } catch (tgError) {
                    console.error("Failed to send payment notification telegram message:", tgError.message);
                }
            }

            return successResponse(res, 'Payment successful and order updated', order);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getCheckoutInfo(req, res) {
        try {
            const { id } = req.params;
            const order = await Order.findOne({
                where: { id },
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product' }]
                    }
                ]
            });

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            return successResponse(res, 'Checkout details retrieved successfully', {
                id: order.id,
                total_amount: order.total_amount,
                status: order.status,
                shipping_address: order.shipping_address,
                contact_phone: order.contact_phone,
                items: order.items.map(item => ({
                    name: item.product?.name,
                    quantity: item.quantity,
                    price: item.price
                }))
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new OrderController();
