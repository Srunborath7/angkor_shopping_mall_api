const tradeOfferService = require('../services/tradeOfferService');
const { successResponse, errorResponse } = require('../utils/response');

class TradeOfferController {

    async createOfferForProduct(req, res) {
        try {
            const senderId = req.user?.id;
            if (!senderId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const data = {
                ...req.body,
                trade_product_id: req.params.id || req.body.trade_product_id
            };

            const offer = await tradeOfferService.createOffer(senderId, data);

            return successResponse(
                res,
                'Trade offer submitted successfully',
                offer,
                201
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getReceivedOffers(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const result = await tradeOfferService.getReceivedOffers(userId, req.query);
            return successResponse(
                res,
                'Received trade offers retrieved successfully',
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getSentOffers(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const result = await tradeOfferService.getSentOffers(userId, req.query);
            return successResponse(
                res,
                'Sent trade offers retrieved successfully',
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getOfferById(req, res) {
        try {
            const userId = req.user?.id;
            const offer = await tradeOfferService.getOfferById(req.params.id, userId);
            return successResponse(
                res,
                'Trade offer retrieved successfully',
                offer
            );
        } catch (error) {
            const status = error.message === 'Trade offer not found' ? 404 :
                error.message.includes('Unauthorized') ? 403 : 400;
            return errorResponse(res, error.message, status);
        }
    }

    async updateOfferStatus(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const { status, status_note } = req.body;
            if (!status) {
                return errorResponse(res, 'status is required');
            }

            const updatedOffer = await tradeOfferService.updateOfferStatus(
                req.params.id,
                userId,
                status,
                status_note
            );

            return successResponse(
                res,
                `Trade offer ${status} successfully`,
                updatedOffer
            );
        } catch (error) {
            const status = error.message === 'Trade offer not found' ? 404 :
                error.message.includes('Unauthorized') ? 403 : 400;
            return errorResponse(res, error.message, status);
        }
    }
}

module.exports = new TradeOfferController();
