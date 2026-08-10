const { CartItem, Product, ProductVariant, Category, Brand } = require('../models/relationships');
const { successResponse, errorResponse } = require('../utils/response');

class CartController {
    async getCart(req, res) {
        try {
            const userId = req.user.id;
            const items = await CartItem.findAll({
                where: { user_id: userId },
                include: [
                    {
                        model: Product,
                        as: 'product',
                        include: [
                            { model: Category, as: 'category' },
                            { model: Brand, as: 'brand' }
                        ]
                    },
                    {
                        model: ProductVariant,
                        as: 'variant',
                        required: false
                    }
                ],
                order: [['created_at', 'ASC']]
            });

            // Calculate totals — use variant price if available
            let subtotal = 0;
            const formattedItems = items.map(item => {
                const effectivePrice = item.variant?.price
                    ? parseFloat(item.variant.price)
                    : parseFloat(item.product?.price || 0);
                const itemTotal = effectivePrice * item.quantity;
                subtotal += itemTotal;
                return {
                    id: item.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    quantity: item.quantity,
                    attributes: item.attributes || {},
                    product: item.product,
                    variant: item.variant,
                    total_price: itemTotal.toFixed(2)
                };
            });

            return successResponse(res, 'Cart retrieved successfully', {
                items: formattedItems,
                subtotal: subtotal.toFixed(2)
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async addToCart(req, res) {
        try {
            const userId = req.user.id;
            const { product_id, variant_id = null, quantity = 1, attributes = {} } = req.body;

            if (!product_id) {
                return errorResponse(res, 'Product ID is required', 400);
            }

            const product = await Product.findByPk(product_id);
            if (!product) {
                return errorResponse(res, 'Product not found', 404);
            }

            // If variant_id provided, validate it exists
            if (variant_id) {
                const variant = await ProductVariant.findByPk(variant_id);
                if (!variant) {
                    return errorResponse(res, 'Product variant not found', 404);
                }
            }

            // Check if same product+variant is already in user's cart
            let cartItem = await CartItem.findOne({
                where: {
                    user_id: userId,
                    product_id,
                    variant_id: variant_id || null
                }
            });

            if (cartItem) {
                cartItem.quantity += parseInt(quantity);
                // Update attributes snapshot if changed
                if (attributes && Object.keys(attributes).length > 0) {
                    cartItem.attributes = attributes;
                }
                await cartItem.save();
            } else {
                cartItem = await CartItem.create({
                    user_id: userId,
                    product_id,
                    variant_id: variant_id || null,
                    quantity: parseInt(quantity),
                    attributes: attributes || {}
                });
            }

            return successResponse(res, 'Product added to cart successfully', cartItem);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async updateCartItem(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { quantity } = req.body;

            if (quantity === undefined || parseInt(quantity) <= 0) {
                return errorResponse(res, 'Valid quantity greater than 0 is required', 400);
            }

            const cartItem = await CartItem.findOne({
                where: { id: id, user_id: userId }
            });

            if (!cartItem) {
                return errorResponse(res, 'Cart item not found', 404);
            }

            cartItem.quantity = parseInt(quantity);
            await cartItem.save();

            return successResponse(res, 'Cart item updated successfully', cartItem);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async removeFromCart(req, res) {
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const deleted = await CartItem.destroy({
                where: { id: id, user_id: userId }
            });

            if (!deleted) {
                return errorResponse(res, 'Cart item not found', 404);
            }

            return successResponse(res, 'Item removed from cart successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async clearCart(req, res) {
        try {
            const userId = req.user.id;
            await CartItem.destroy({
                where: { user_id: userId }
            });

            return successResponse(res, 'Cart cleared successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new CartController();
