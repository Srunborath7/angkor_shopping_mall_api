const { 
    TradeOffer, 
    TradeProduct, 
    TradeProductImage, 
    User, 
    Category, 
    Brand 
} = require('../models/relationships');

class TradeOfferService {

    async createOffer(senderId, data) {
        const { trade_product_id, offered_product_id, offered_item_title, offered_item_description, offered_cash_difference, message, contact_info } = data;

        if (!trade_product_id) {
            throw new Error('trade_product_id is required');
        }

        const targetProduct = await TradeProduct.findByPk(trade_product_id);
        if (!targetProduct) {
            throw new Error('Trade product listing not found');
        }

        if (targetProduct.user_id === senderId) {
            throw new Error('You cannot make a trade offer on your own listing');
        }

        if (targetProduct.status === 'traded' || targetProduct.status === 'cancelled') {
            throw new Error(`Cannot make an offer on a ${targetProduct.status} listing`);
        }

        // If an existing trade product is offered, verify ownership
        if (offered_product_id) {
            const offeredProduct = await TradeProduct.findByPk(offered_product_id);
            if (!offeredProduct) {
                throw new Error('Offered trade product not found');
            }
            if (offeredProduct.user_id !== senderId) {
                throw new Error('You can only offer trade items that you own');
            }
            if (offeredProduct.status === 'traded' || offeredProduct.status === 'cancelled') {
                throw new Error(`Your offered item is already ${offeredProduct.status}`);
            }
        }

        // Check if there is already a pending offer from this sender on this product
        const existingPending = await TradeOffer.findOne({
            where: {
                trade_product_id,
                sender_id: senderId,
                status: 'pending'
            }
        });

        if (existingPending) {
            throw new Error('You already have a pending offer on this item. Please wait for the seller or update your offer.');
        }

        const offer = await TradeOffer.create({
            trade_product_id,
            sender_id: senderId,
            receiver_id: targetProduct.user_id,
            offered_product_id: offered_product_id || null,
            offered_item_title: offered_item_title || null,
            offered_item_description: offered_item_description || null,
            offered_cash_difference: offered_cash_difference !== undefined ? parseFloat(offered_cash_difference) : 0.00,
            message: message || null,
            contact_info: contact_info || null,
            status: 'pending'
        });

        return this.getOfferById(offer.id, senderId);
    }

    async getReceivedOffers(userId, query = {}) {
        const { status, page = 1, limit = 10 } = query;
        const where = { receiver_id: userId };

        if (status && status !== 'all') {
            where.status = status;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;

        const { count, rows } = await TradeOffer.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: TradeProduct,
                    as: 'tradeProduct',
                    attributes: ['id', 'title', 'condition', 'estimated_value', 'status', 'image_url']
                },
                {
                    model: TradeProduct,
                    as: 'offeredProduct',
                    attributes: ['id', 'title', 'condition', 'estimated_value', 'status', 'image_url']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: limitNum,
            offset
        });

        return {
            totalItems: count,
            totalPages: Math.ceil(count / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            offers: rows
        };
    }

    async getSentOffers(userId, query = {}) {
        const { status, page = 1, limit = 10 } = query;
        const where = { sender_id: userId };

        if (status && status !== 'all') {
            where.status = status;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;

        const { count, rows } = await TradeOffer.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'receiver',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: TradeProduct,
                    as: 'tradeProduct',
                    attributes: ['id', 'title', 'condition', 'estimated_value', 'status', 'image_url']
                },
                {
                    model: TradeProduct,
                    as: 'offeredProduct',
                    attributes: ['id', 'title', 'condition', 'estimated_value', 'status', 'image_url']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: limitNum,
            offset
        });

        return {
            totalItems: count,
            totalPages: Math.ceil(count / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            offers: rows
        };
    }

    async getOfferById(id, userId) {
        const offer = await TradeOffer.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: User,
                    as: 'receiver',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: TradeProduct,
                    as: 'tradeProduct',
                    include: [
                        {
                            model: TradeProductImage,
                            as: 'images',
                            attributes: ['id', 'image_url', 'is_primary']
                        }
                    ]
                },
                {
                    model: TradeProduct,
                    as: 'offeredProduct',
                    include: [
                        {
                            model: TradeProductImage,
                            as: 'images',
                            attributes: ['id', 'image_url', 'is_primary']
                        }
                    ]
                }
            ]
        });

        if (!offer) {
            throw new Error('Trade offer not found');
        }

        if (userId && offer.sender_id !== userId && offer.receiver_id !== userId) {
            throw new Error('Unauthorized to view this trade offer');
        }

        return offer;
    }

    async updateOfferStatus(id, userId, status, status_note = null) {
        const validStatuses = ['accepted', 'rejected', 'cancelled', 'completed'];
        if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        const offer = await TradeOffer.findByPk(id, {
            include: [{ model: TradeProduct, as: 'tradeProduct' }]
        });

        if (!offer) {
            throw new Error('Trade offer not found');
        }

        const isReceiver = offer.receiver_id === userId;
        const isSender = offer.sender_id === userId;

        if (!isReceiver && !isSender) {
            throw new Error('Unauthorized to modify this offer');
        }

        if (status === 'accepted') {
            if (!isReceiver) {
                throw new Error('Only the item owner can accept this trade offer');
            }
            if (offer.status !== 'pending') {
                throw new Error(`Cannot accept an offer that is currently ${offer.status}`);
            }

            await offer.update({
                status: 'accepted',
                status_note: status_note || offer.status_note
            });

            // Mark trade product as in negotiation
            if (offer.tradeProduct) {
                await offer.tradeProduct.update({ status: 'in_negotiation' });
            }
        } else if (status === 'rejected') {
            if (!isReceiver) {
                throw new Error('Only the item owner can reject this trade offer');
            }
            if (offer.status !== 'pending') {
                throw new Error(`Cannot reject an offer that is currently ${offer.status}`);
            }

            await offer.update({
                status: 'rejected',
                status_note: status_note || offer.status_note
            });
        } else if (status === 'cancelled') {
            if (!isSender) {
                throw new Error('Only the offer sender can cancel their offer');
            }
            if (offer.status !== 'pending' && offer.status !== 'accepted') {
                throw new Error(`Cannot cancel an offer that is already ${offer.status}`);
            }

            await offer.update({
                status: 'cancelled',
                status_note: status_note || offer.status_note
            });

            // If product was in negotiation, check if there are other accepted offers
            if (offer.tradeProduct && offer.tradeProduct.status === 'in_negotiation') {
                const otherAccepted = await TradeOffer.findOne({
                    where: {
                        trade_product_id: offer.trade_product_id,
                        status: 'accepted'
                    }
                });
                if (!otherAccepted) {
                    await offer.tradeProduct.update({ status: 'available' });
                }
            }
        } else if (status === 'completed') {
            if (offer.status !== 'accepted') {
                throw new Error('Only accepted offers can be marked as completed');
            }

            await offer.update({
                status: 'completed',
                status_note: status_note || offer.status_note
            });

            // Mark main product as traded
            if (offer.tradeProduct) {
                await offer.tradeProduct.update({ status: 'traded' });
            }

            // If an offered trade product was used, mark it as traded too
            if (offer.offered_product_id) {
                const offeredProd = await TradeProduct.findByPk(offer.offered_product_id);
                if (offeredProd) {
                    await offeredProd.update({ status: 'traded' });
                }
            }
        }

        return this.getOfferById(id, userId);
    }
}

module.exports = new TradeOfferService();
