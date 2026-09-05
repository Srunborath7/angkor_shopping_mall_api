const { Order, OrderItem, CartItem, Product, ProductVariant, ProductImage, User, Category, Brand, FlashSale, TradeProduct } = require('../models/relationships');
const { successResponse, errorResponse } = require('../utils/response');
const paymentService = require('../services/paymentService');
const { bot } = require('../config/telegram');
const { trackInteractionBulk } = require('../utils/trackInteraction');
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const isValidUUID = (str) => {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

const generateNextOrderNumber = async () => {
    try {
        const [results] = await sequelize.query(`
            SELECT order_number FROM orders 
            WHERE order_number ~ '^OR-[0-9]+$' 
            ORDER BY CAST(SUBSTRING(order_number FROM 4) AS INTEGER) DESC 
            LIMIT 1;
        `);
        let nextNumber = 1;
        if (results && results.length > 0 && results[0].order_number) {
            const currentNum = parseInt(results[0].order_number.replace('OR-', ''), 10);
            if (!isNaN(currentNum)) nextNumber = currentNum + 1;
        } else {
            const count = await Order.count();
            nextNumber = (count || 0) + 1;
        }
        return `OR-${String(nextNumber).padStart(5, '0')}`;
    } catch (e) {
        console.error('Error generating order number:', e.message);
        try {
            const count = await Order.count();
            return `OR-${String((count || 0) + 1).padStart(5, '0')}`;
        } catch {
            return `OR-${String(Date.now()).slice(-5)}`;
        }
    }
};

const buildOrderSearchCondition = (idOrKey) => {
    if (!idOrKey) return null;
    const cleanKey = String(idOrKey || "").replace(/^#/, "").trim();
    if (isValidUUID(cleanKey)) {
        return { id: cleanKey };
    }
    return {
        [Op.or]: [
            { order_number: cleanKey },
            { order_number: `OR-${cleanKey.replace(/^OR-?/i, '').padStart(5, '0')}` },
            { khqr_md5: cleanKey },
            { payment_intent_id: `ABA-${cleanKey}` },
            { payment_intent_id: cleanKey },
            { transaction_hash: cleanKey },
            { transaction_hash: `ABA-${cleanKey}` }
        ]
    };
};

const tradeInIncludes = () => ({
    model: TradeProduct,
    as: 'tradeInProduct',
    attributes: ['id', 'title', 'condition', 'estimated_value', 'image_url', 'status'],
    required: false
});

// Helper to populate order items in a decoupled query to prevent Postgres out of shared memory
async function populateOrdersItems(orders) {
    if (!orders || orders.length === 0) return [];
    const isArray = Array.isArray(orders);
    const orderList = isArray ? orders : [orders];
    const orderIds = orderList.map(o => o.id);

    const items = await OrderItem.findAll({
        where: { order_id: { [Op.in]: orderIds } },
        include: [
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
                ],
                required: false
            },
            {
                model: ProductVariant,
                as: 'variant',
                attributes: ['id', 'sku', 'price', 'stock_quantity', 'attributes'],
                required: false
            }
        ]
    });

    const itemsMap = new Map();
    for (const it of items) {
        if (!itemsMap.has(it.order_id)) {
            itemsMap.set(it.order_id, []);
        }
        itemsMap.get(it.order_id).push(it);
    }

    const populated = orderList.map(o => {
        const plain = o.toJSON ? o.toJSON() : { ...o };
        plain.items = itemsMap.get(plain.id) || [];
        return plain;
    });

    return isArray ? populated : populated[0];
}

class OrderController {
    async checkout(req, res) {
        try {
            const userId = req.user.id;
            const { shipping_address, contact_phone, trade_in_product_id } = req.body;

            if (!shipping_address || !contact_phone) {
                return errorResponse(res, 'Shipping address and contact phone are required', 400);
            }

            // 1. Fetch Cart Items
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

            let checkoutItems = [...cartItems];
            if (checkoutItems.length === 0 && Array.isArray(req.body.items) && req.body.items.length > 0) {
                checkoutItems = await Promise.all(req.body.items.map(async (raw) => {
                    const prodId = raw.product_id || raw.id;
                    const prod = await Product.findByPk(prodId, {
                        include: [{ model: FlashSale, as: 'flashSales', required: false, where: { status: 'active' } }]
                    });
                    let variant = null;
                    if (raw.variant_id) {
                        variant = await ProductVariant.findByPk(raw.variant_id);
                    }
                    return {
                        product_id: prodId,
                        variant_id: raw.variant_id || null,
                        quantity: parseInt(raw.quantity || 1, 10),
                        product: prod,
                        variant: variant,
                        attributes: raw.attributes || {}
                    };
                }));
            }

            if (checkoutItems.length === 0) {
                return errorResponse(res, 'Cannot checkout: Your cart is empty', 400);
            }

            // 2. Validate stock and calculate total amount
            let subtotalAmount = 0;
            for (const item of checkoutItems) {
                if (!item.product) {
                    return errorResponse(res, 'Product in cart no longer exists', 404);
                }

                const effectiveStock = item.variant
                    ? item.variant.stock_quantity
                    : item.product.stock_quantity;

                if (effectiveStock < item.quantity) {
                    return errorResponse(res, `Insufficient stock for product: ${item.product.name}. Available: ${effectiveStock}`, 400);
                }

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

                tradeInProduct.status = 'in_negotiation';
                await tradeInProduct.save();
            }

            // 3. Create Order
            const generatedOrderNum = req.body.order_number && String(req.body.order_number).startsWith('OR-')
                ? req.body.order_number
                : await generateNextOrderNumber();

            const order = await Order.create({
                user_id: userId,
                order_number: generatedOrderNum,
                subtotal_amount: subtotalAmount,
                trade_in_discount: tradeInDiscount,
                trade_in_product_id: tradeInProduct ? tradeInProduct.id : null,
                total_amount: finalPayableAmount,
                status: 'pending',
                shipping_address,
                contact_phone
            });

            // 4. Create Order Items
            for (const item of checkoutItems) {
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

            // 6. Track order interactions
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
                include: [tradeInIncludes()],
                order: [['created_at', 'DESC']]
            });

            const populated = await populateOrdersItems(orders);
            return successResponse(res, 'Orders retrieved successfully', populated);
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

            const populated = await populateOrdersItems(order);
            return successResponse(res, 'Order retrieved successfully', populated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getAdminOrders(req, res) {
        try {
            const orders = await Order.findAll({
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'name', 'email', 'phone'],
                        required: false
                    },
                    tradeInIncludes()
                ],
                order: [['created_at', 'DESC']]
            });

            const populated = await populateOrdersItems(orders);
            return successResponse(res, 'Admin orders retrieved successfully', populated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async updateOrderStatus(req, res) {
        try {
            const cleanId = String(req.params.id || "").replace(/^#/, "").trim();
            const { status, shipping_address, contact_phone } = req.body;

            let order = null;
            if (isValidUUID(cleanId)) {
                order = await Order.findByPk(cleanId, {
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'name', 'email', 'phone', 'telegram_chat_id']
                        },
                        tradeInIncludes()
                    ]
                });
            }
            if (!order) {
                const searchCondition = buildOrderSearchCondition(cleanId);
                if (searchCondition) {
                    order = await Order.findOne({
                        where: searchCondition,
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['id', 'name', 'email', 'phone', 'telegram_chat_id']
                            },
                            tradeInIncludes()
                        ]
                    });
                }
            }

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            const updateData = {};
            if (status) updateData.status = status;
            if (shipping_address) updateData.shipping_address = shipping_address;
            if (contact_phone) updateData.contact_phone = contact_phone;

            await order.update(updateData);

            if (status && order.user && order.user.telegram_chat_id) {
                try {
                    const message = `📦 *Order Update*

Your Order #${order.id.slice(0, 8)} status has changed to: *${status.toUpperCase()}*.`;
                    await bot.sendMessage(order.user.telegram_chat_id, message, { parse_mode: 'Markdown' });
                } catch (tgErr) {
                    console.error('Telegram notification error:', tgErr.message);
                }
            }

            const populated = await populateOrdersItems(order);
            return successResponse(res, 'Order updated successfully', populated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async deleteOrder(req, res) {
        try {
            const { id } = req.params;
            let order = null;
            if (isValidUUID(id)) {
                order = await Order.findByPk(id);
            }
            if (!order) {
                const searchCondition = buildOrderSearchCondition(id);
                if (searchCondition) {
                    order = await Order.findOne({ where: searchCondition });
                }
            }

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            await order.destroy();
            return successResponse(res, 'Order deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async payOrder(req, res) {
        try {
            const { id } = req.params;
            let order = null;
            if (isValidUUID(id)) {
                order = await Order.findByPk(id);
            }
            if (!order) {
                const searchCondition = buildOrderSearchCondition(id);
                if (searchCondition) {
                    order = await Order.findOne({ where: searchCondition });
                }
            }

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            if (!order) {
                return errorResponse(res, 'Order not found', 404);
            }

            await order.update({ status: 'paid' });
            return successResponse(res, 'Order paid successfully', order);
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

            const populated = await populateOrdersItems(order);
            return successResponse(res, 'Order checkout info retrieved successfully', populated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async createAdminOrder(req, res) {
        try {
            const { user_id, items = [], shipping_address, contact_phone, status = 'paid' } = req.body;

            if (!items.length) {
                return errorResponse(res, 'Items are required', 400);
            }

            let subtotal = 0;
            for (const it of items) {
                subtotal += (parseFloat(it.price) || 0) * (parseInt(it.quantity) || 1);
            }

            const adminOrderNum = await generateNextOrderNumber();
            const order = await Order.create({
                user_id: user_id || req.user?.id,
                order_number: adminOrderNum,
                subtotal_amount: subtotal,
                total_amount: subtotal,
                status,
                shipping_address: shipping_address || 'Walk-in / In-store purchase',
                contact_phone: contact_phone || '0000000000'
            });

            for (const it of items) {
                await OrderItem.create({
                    order_id: order.id,
                    product_id: it.product_id,
                    variant_id: it.variant_id || null,
                    quantity: it.quantity || 1,
                    price: it.price,
                    attributes: it.attributes || {}
                });
            }

            const populated = await populateOrdersItems(order);
            return successResponse(res, 'Order created successfully', populated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new OrderController();
