const { ProductReview, User } = require("../models/relationships");

class ProductReviewService {
    async create(productId, userId, data) {
        const rating = parseInt(data.rating);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            throw new Error("Rating must be an integer between 1 and 5");
        }

        const review = await ProductReview.create({
            product_id: productId,
            user_id: userId,
            rating,
            comment: data.comment,
            images: data.images || []
        });

        return await ProductReview.findByPk(review.id, {
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "name"]
                }
            ]
        });
    }

    async findAll(productId) {
        return await ProductReview.findAll({
            where: { product_id: productId },
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "name"]
                }
            ],
            order: [["created_at", "DESC"]]
        });
    }

    async update(id, userId, data) {
        const review = await ProductReview.findByPk(id);
        if (!review) {
            throw new Error("Review not found");
        }

        if (review.user_id !== userId) {
            throw new Error("Unauthorized to update this review");
        }

        const updateData = {};
        if (data.rating !== undefined) {
            const rating = parseInt(data.rating);
            if (isNaN(rating) || rating < 1 || rating > 5) {
                throw new Error("Rating must be an integer between 1 and 5");
            }
            updateData.rating = rating;
        }

        if (data.comment !== undefined) {
            updateData.comment = data.comment;
        }

        if (data.images !== undefined) {
            updateData.images = data.images;
        }

        await review.update(updateData);

        return await ProductReview.findByPk(review.id, {
            include: [
                {
                    model: User,
                    as: "user",
                    attributes: ["id", "name"]
                }
            ]
        });
    }

    async destroy(id, userId, isAdmin) {
        const review = await ProductReview.findByPk(id);
        if (!review) {
            throw new Error("Review not found");
        }

        if (review.user_id !== userId && !isAdmin) {
            throw new Error("Unauthorized to delete this review");
        }

        await review.destroy();
        return { message: "Review deleted successfully" };
    }
}

module.exports = new ProductReviewService();
