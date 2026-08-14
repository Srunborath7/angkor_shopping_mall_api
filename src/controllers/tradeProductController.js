const tradeProductService = require('../services/tradeProductService');
const { successResponse, errorResponse } = require('../utils/response');

class TradeProductController {

    async getEligibleOrderedItems(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const items = await tradeProductService.getEligibleOrderedItems(userId);
            return successResponse(
                res,
                'Eligible purchased items for trading retrieved successfully',
                items
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async create(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            let primaryFile = null;
            let galleryFiles = [];

            if (req.files) {
                if (req.files.image && req.files.image.length > 0) {
                    primaryFile = req.files.image[0];
                }
                if (req.files.gallery && req.files.gallery.length > 0) {
                    galleryFiles = req.files.gallery;
                }
            } else if (req.file) {
                primaryFile = req.file;
            }

            let images = req.body.images;
            if (typeof images === 'string') {
                try {
                    images = JSON.parse(images);
                } catch (e) {
                    images = undefined;
                }
            }

            const data = {
                title: req.body.title,
                description: req.body.description,
                category_id: req.body.category_id,
                brand_id: req.body.brand_id,
                condition: req.body.condition,
                estimated_value: req.body.estimated_value,
                trading_preference: req.body.trading_preference,
                target_category_id: req.body.target_category_id,
                accept_cash_difference: req.body.accept_cash_difference,
                location: req.body.location,
                phone_number: req.body.phone_number || req.user.phone,
                status: req.body.status,
                order_id: req.body.order_id,
                order_item_id: req.body.order_item_id,
                original_product_id: req.body.original_product_id,
                image_url: req.body.image_url,
                image_path: req.body.image_path,
                images
            };

            const tradeProduct = await tradeProductService.create(userId, data, primaryFile, galleryFiles);

            return successResponse(
                res,
                'Trade product listing created successfully',
                tradeProduct,
                201
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const result = await tradeProductService.findAll(req.query);
            return successResponse(
                res,
                'Trade products retrieved successfully',
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findMyListings(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }
            const result = await tradeProductService.findMyListings(userId, req.query);
            return successResponse(
                res,
                'My trade products retrieved successfully',
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {
            const tradeProduct = await tradeProductService.findById(req.params.id);
            return successResponse(
                res,
                'Trade product details retrieved successfully',
                tradeProduct
            );
        } catch (error) {
            const status = error.message === 'Trade product not found' ? 404 : 400;
            return errorResponse(res, error.message, status);
        }
    }

    async update(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const updated = await tradeProductService.update(
                req.params.id,
                userId,
                req.body,
                req.file || null
            );

            return successResponse(
                res,
                'Trade product listing updated successfully',
                updated
            );
        } catch (error) {
            const status = error.message === 'Trade product not found' ? 404 :
                error.message.includes('Unauthorized') ? 403 : 400;
            return errorResponse(res, error.message, status);
        }
    }

    async delete(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const isAdmin = req.user?.roles?.some(r => r.name === 'admin' || r === 'admin') || false;
            const result = await tradeProductService.delete(req.params.id, userId, isAdmin);

            return successResponse(res, result.message);
        } catch (error) {
            const status = error.message === 'Trade product not found' ? 404 :
                error.message.includes('Unauthorized') ? 403 : 400;
            return errorResponse(res, error.message, status);
        }
    }
}

module.exports = new TradeProductController();
