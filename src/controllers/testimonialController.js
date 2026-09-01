const testimonialService = require('../services/testimonialService');
const { successResponse, errorResponse } = require('../utils/response');

class TestimonialController {
    async create(req, res) {
        try {
            const { author_name, location, rating, message } = req.body;
            if (!message || !message.trim()) {
                return errorResponse(res, 'Feedback message is required', 400);
            }

            const item = await testimonialService.create({
                user_id: req.user?.id || null,
                author_name: author_name || req.user?.name || 'Customer',
                location: location || 'Phnom Penh',
                rating: rating || 5,
                message: message.trim(),
                is_published: false // requires admin approval before showing on homepage
            });

            return successResponse(
                res,
                'Thank you! Your review has been submitted for verification and will appear on the website once approved.',
                item,
                201
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getPublished(req, res) {
        try {
            const list = await testimonialService.getPublished();
            return successResponse(res, 'Published testimonials fetched successfully', list);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getAll(req, res) {
        try {
            const { status, search } = req.query;
            const list = await testimonialService.getAll({ status, search });
            return successResponse(res, 'All testimonials fetched successfully', list);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async togglePublish(req, res) {
        try {
            const item = await testimonialService.togglePublish(req.params.id);
            return successResponse(
                res,
                `Testimonial is now ${item.is_published ? 'published on website' : 'hidden from website'}`,
                item
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {
            const item = await testimonialService.update(req.params.id, req.body);
            return successResponse(res, 'Testimonial updated successfully', item);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {
            const result = await testimonialService.delete(req.params.id);
            return successResponse(res, result.message);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new TestimonialController();
