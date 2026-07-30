const productReviewService = require("../services/productReviewService");
const { successResponse, errorResponse } = require("../utils/response");

class ProductReviewController {
    async create(req, res) {
        try {
            const { productId } = req.params;
            const { rating, comment, images } = req.body;
            const userId = req.user.id;

            let parsedImages = images;
            if (typeof images === "string") {
                try {
                    parsedImages = JSON.parse(images);
                } catch (e) {
                    parsedImages = [];
                }
            }

            const review = await productReviewService.create(productId, userId, {
                rating,
                comment,
                images: parsedImages || []
            });

            return successResponse(res, "Review submitted successfully", review, 201);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const { productId } = req.params;
            const reviews = await productReviewService.findAll(productId);
            return successResponse(res, "Reviews retrieved successfully", reviews);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { rating, comment, images } = req.body;
            const userId = req.user.id;

            let parsedImages = images;
            if (typeof images === "string") {
                try {
                    parsedImages = JSON.parse(images);
                } catch (e) {
                    parsedImages = undefined;
                }
            }

            const review = await productReviewService.update(id, userId, {
                rating,
                comment,
                images: parsedImages
            });

            return successResponse(res, "Review updated successfully", review);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const roles = req.user.roles || [];
            const isAdmin = roles.some(role => role.name === "Admin");

            const result = await productReviewService.destroy(id, userId, isAdmin);

            return successResponse(res, result.message);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new ProductReviewController();
