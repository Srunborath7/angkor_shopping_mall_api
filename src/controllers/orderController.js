const { Order, OrderItem, CartItem, Product, ProductVariant, ProductImage, User, Category, Brand, FlashSale, TradeProduct } = require('../models/relationships');
const { successResponse, errorResponse } = require('../utils/response');
const paymentService = require('../services/paymentService');
const { bot } = require('../config/telegram');
const { trackInteractionBulk } = require('../utils/trackInteraction');
const { Op } = require('sequelize');

const isValidUUID = (str) => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

const buildOrderSearchCondition = (idOrKey) => {
    if (!idOrKey) return null;
    const cleanKey = String(idOrKey).trim();
    if (isValidUUID(cleanKey)) {
        return { id: cleanKey };
    }
    return {
        [Op.or]: [
            { khqr_md5: cleanKey },
            { payment_intent_id: `ABA-${cleanKey}` },
            { payment_intent_id: cleanKey },
            { transaction_hash: cleanKey },
            { transaction_hash: `ABA-${cleanKey}` }
        ]
    };
};

// Helper to build the standard OrderItem includes (product + variant + images)
const orderItemIncludes = () => [
    {
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'price', 'stock_quantity'],
        include: [
            {
                model: ProductImage,
                as: 'images',
                attributes: ['id', 'image_url', 'is_primary'],
                required: false
            }
        ]
    },
    {
        model: ProductVariant,
        as: 'variant',
        required: false,
        attributes: ['id', 'sku', 'price', 'stock_quantity', 'attributes']
    }
];

const tradeInIncludes = () => ({
    model: TradeProduct,
    as: 'tradeInProduct',
    attributes: ['id', 'title', 'condition', 'estimated_value', 'image_url', 'status'],
    required: false
});

class OrderController {
    async checkout(req, res) {
        try {
            const userId = req.user.id;
            const { shipping_address, contact_phone, trade_in_product_id } = req.body;

            if (!shipping_address || !contact_phone) {
                return errorResponse(res, 'Shipping address and contact phone are required', 400);
            }

            // 1. Fetch Cart Items (include variant so we can snapshot attributes + price)
            const cartItems = await CartItem.findAll({
                where: { user_id: userId },
                include: [
                    { 
                        model: Product, 
                        as: 'product',
                        include: [
                            { model: FlashSale, as: 'flashSales', required: false, where: { status: 'active' } }
                        ]
                    },
                    { model: ProductVariant, as: 'variant', required: false }
                ]
            });

            if (cartItems.length === 0) {
                return errorResponse(res, 'Cannot checkout: Your cart is empty', 400);
            }

            // 2. Validate stock and calculate total amount
            let subtotalAmount = 0;
            for (const item of cartItems) {
                if (!item.product) {
                    return errorResponse(res, 'Product in cart no longer exists', 404);
                }

                const effectiveStock = item.variant
                    ? item.variant.stock_quantity
                    : item.product.stock_quantity;

                if (effectiveStock < item.quantity) {
                    return errorResponse(res, `Insufficient stock for product: ${item.product.name}. Available: ${effectiveStock}`, 400);
                }

                // Use flash sale price if flash sale item, else variant price if available, otherwise original product price
                let effectivePrice = item.variant?.price
                    ? parseFloat(item.variant.price)
                    : parseFloat(item.product.price);

                const isFlashItem = item.attributes && (item.attributes.is_flash_sale || item.attributes.flash_price);
                if (isFlashItem) {
                    if (item.attributes.flash_price) {
                        effectivePrice = parseFloat(item.attributes.flash_price);
                    } else if (item.product?.flashSales && item.product.flashSales.length > 0) {
                        effectivePrice = parseFloat(item.product.flashSales[0].price);
                    }
                }

                subtotalAmount += effectivePrice * item.quantity;
            }

            // 2.5 Handle optional Trade-In Product
            let tradeInProduct = null;
            let tradeInDiscount = 0.00;
            let finalPayableAmount = subtotalAmount;

            if (trade_in_product_id) {
                tradeInProduct = await TradeProduct.findByPk(trade_in_product_id);
                if (!tradeInProduct) {
                    return errorResponse(res, 'Trade-in product not found', 404);
                }
                if (tradeInProduct.user_id !== userId) {
                    return errorResponse(res, 'You can only use your own trade product for trade-in', 403);
                }
                if (tradeInProduct.status !== 'available') {
                    return errorResponse(res, `Trade-in product is ${tradeInProduct.status} and cannot be used for trade-in`, 400);
                }

                const estimatedVal = parseFloat(tradeInProduct.estimated_value || 0);
                tradeInDiscount = Math.min(subtotalAmount, estimatedVal);
                finalPayableAmount = Math.max(0, subtotalAmount - tradeInDiscount);

                // Reserve trade-in product
                tradeInProduct.status = 'in_negotiation';
                await tradeInProduct.save();
            }

            // 3. Create Order
            const order = await Order.create({
                user_id: userId,
                subtotal_amount: subtotalAmount,
                trade_in_discount: tradeInDiscount,
                trade_in_product_id: tradeInProduct ? tradeInProduct.id : null,
                total_amount: finalPayableAmount,
                status: 'pending',
                shipping_address,
                contact_phone
            });

            // 4. Create Order Items with variant_id + attributes snapshot, decrease stock
            for (const item of cartItems) {
                let effectivePrice = item.variant?.price
                    ? parseFloat(item.variant.price)
                    : parseFloat(item.product.price);

                const isFlashItem = item.attributes && (item.attributes.is_flash_sale || item.attributes.flash_price);
                if (isFlashItem) {
                    if (item.attributes.flash_price) {
                        effectivePrice = parseFloat(item.attributes.flash_price);
                    } else if (item.product?.flashSales && item.product.flashSales.length > 0) {
                        effectivePrice = parseFloat(item.product.flashSales[0].price);
                    }
                }

                const attributesSnapshot = item.attributes && Object.keys(item.attributes).length > 0
                    ? item.attributes
                    : (item.variant?.attributes || {});

                await OrderItem.create({
                    order_id: order.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id || null,
                    quantity: item.quantity,
                    price: effectivePrice,
                    attributes: attributesSnapshot
                });

                // Deduct stock from variant if applicable, otherwise from product
                if (item.variant_id) {
                    await ProductVariant.decrement('stock_quantity', {
                        by: item.quantity,
                        where: { id: item.variant_id }
                    });
                } else {
                    await Product.decrement('stock_quantity', {
                        by: item.quantity,
                        where: { id: item.product_id }
                    });
                }
            }

            // 5. Clear Cart
            await CartItem.destroy({
                where: { user_id: userId }
            });

            // 6. Track order interactions for ML (fire-and-forget)
            const orderedProductIds = cartItems.map((item) => item.product_id).filter(Boolean);
            trackInteractionBulk(userId, orderedProductIds, 'order');

            // 7. Generate Payment Session
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
                        include: orderItemIncludes()
                    },
                    tradeInIncludes()
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
            const searchCondition = buildOrderSearchCondition(id);
            if (!searchCondition) {
                return errorResponse(res, 'Order not found', 404);
            }
            const order = await Order.findOne({
                where: searchCondition,
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: orderItemIncludes()
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone']
                    },
                    tradeInIncludes()
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
                        include: orderItemIncludes()
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone']
                    },
                    tradeInIncludes()
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
                        include: orderItemIncludes()
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone', 'telegram_chat_id']
                    },
                    tradeInIncludes()
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
                        if (item.variant_id) {
                            await ProductVariant.increment('stock_quantity', {
                                by: item.quantity,
                                where: { id: item.variant_id }
                            });
                        } else {
                            await Product.increment('stock_quantity', {
                                by: item.quantity,
                                where: { id: item.product_id }
                            });
                        }
                    }

                    // Release trade-in product back to available if order cancelled
                    if (order.trade_in_product_id) {
                        await TradeProduct.update(
                            { status: 'available' },
                            { where: { id: order.trade_in_product_id } }
                        );
                    }
                }

                // If paid or completed, mark trade-in product as traded
                if ((status === 'paid' || status === 'completed') && order.trade_in_product_id) {
                    await TradeProduct.update(
                        { status: 'traded' },
                        { where: { id: order.trade_in_product_id } }
                    );
                }

                order.status = status;
            }

            if (shipping_address) order.shipping_address = shipping_address;
            if (contact_phone) order.contact_phone = contact_phone;

            await order.save();

            // Send notification via Telegram if user connected
            if (order.user && order.user.telegram_chat_id && status) {
                try {
                    const text = `🛍️ *Angkor Shopping Mall - Order Update!*\n\n━━━━━━━━━━━━━━\n🆔 *Order ID:* \`${order.id}\`\n📦 *New Status:* *${status.toUpperCase()}*\n💰 *Total Amount:* $${order.total_amount}\n━━━━━━━━━━━━━━\n\nThank you for shopping with us!`;
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
            // Release trade-in item if any
            if (order.trade_in_product_id) {
                await TradeProduct.update(
                    { status: 'available' },
                    { where: { id: order.trade_in_product_id } }
                );
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
                if (item.variant_id) {
                    const variant = await ProductVariant.findByPk(item.variant_id);
                    if (!variant) {
                        return errorResponse(res, `Variant not found ID: ${item.variant_id}`, 404);
                    }
                    totalAmount += parseFloat(variant.price || 0) * item.quantity;
                } else {
                    const product = await Product.findByPk(item.product_id);
                    if (!product) {
                        return errorResponse(res, `Product not found ID: ${item.product_id}`, 404);
                    }
                    totalAmount += parseFloat(product.price) * item.quantity;
                }
            }

            const order = await Order.create({
                user_id,
                subtotal_amount: totalAmount,
                trade_in_discount: 0.00,
                total_amount: totalAmount,
                status,
                shipping_address,
                contact_phone
            });

            for (const item of items) {
                let effectivePrice = 0;
                let attributesSnapshot = item.attributes || {};

                if (item.variant_id) {
                    const variant = await ProductVariant.findByPk(item.variant_id);
                    effectivePrice = parseFloat(variant.price || 0);
                    attributesSnapshot = item.attributes || variant.attributes || {};
                    await ProductVariant.decrement('stock_quantity', {
                        by: item.quantity,
                        where: { id: item.variant_id }
                    });
                } else {
                    const product = await Product.findByPk(item.product_id);
                    effectivePrice = parseFloat(product.price);
                    await Product.decrement('stock_quantity', {
                        by: item.quantity,
                        where: { id: item.product_id }
                    });
                }

                await OrderItem.create({
                    order_id: order.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id || null,
                    quantity: item.quantity,
                    price: effectivePrice,
                    attributes: attributesSnapshot
                });
            }

            const updatedOrder = await Order.findByPk(order.id, {
                include: [
                    { model: OrderItem, as: 'items', include: orderItemIncludes() },
                    { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
                    tradeInIncludes()
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

            // If trade-in product was used, mark it as traded
            if (order.trade_in_product_id) {
                await TradeProduct.update(
                    { status: 'traded' },
                    { where: { id: order.trade_in_product_id } }
                );
            }

            // Fetch User details to check for Telegram Link
            const user = await User.findByPk(order.user_id);
            if (user && user.telegram_chat_id) {
                try {
                    const text = `🛍️ *Angkor Shopping Mall - Order Paid!*\n\n━━━━━━━━━━━━━━\n✅ *Order Status:* Paid\n🆔 *Order ID:* \`${order.id}\`\n💰 *Total Amount:* $${order.total_amount}\n📍 *Shipping Address:* ${order.shipping_address}\n━━━━━━━━━━━━━━\n\nThank you for shopping with us! We will notify you once your order is shipped.`;
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
            const searchCondition = buildOrderSearchCondition(id);
            if (!searchCondition) {
                return errorResponse(res, 'Order not found', 404);
            }
            const order = await Order.findOne({
                where: searchCondition,
                include: [
                    {
                        model: OrderItem,
                        as: 'items',
                        include: orderItemIncludes()
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
                    variant_sku: item.variant?.sku || null,
                    attributes: item.attributes || item.variant?.attributes || {},
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
