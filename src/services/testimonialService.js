const Testimonial = require('../models/testimonialModel');
const { Op } = require('sequelize');

class TestimonialService {
    async create(data) {
        const rating = Math.min(5, Math.max(1, parseInt(data.rating, 10) || 5));
        const colors = ['green', 'blue', 'purple', 'amber'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        return await Testimonial.create({
            user_id: data.user_id || null,
            author_name: data.author_name || 'Verified Customer',
            location: data.location || 'Phnom Penh',
            rating,
            message: data.message,
            avatar_color: data.avatar_color || randomColor,
            is_verified: data.is_verified !== undefined ? data.is_verified : true,
            is_published: data.is_published !== undefined ? data.is_published : false,
            order_index: data.order_index || 0
        });
    }

    async getPublished() {
        return await Testimonial.findAll({
            where: { is_published: true },
            order: [
                ['order_index', 'ASC'],
                ['created_at', 'DESC']
            ],
            limit: 20
        });
    }

    async getAll(filters = {}) {
        const where = {};
        if (filters.status === 'published') {
            where.is_published = true;
        } else if (filters.status === 'pending') {
            where.is_published = false;
        }

        if (filters.search) {
            where[Op.or] = [
                { author_name: { [Op.iLike]: `%${filters.search}%` } },
                { message: { [Op.iLike]: `%${filters.search}%` } },
                { location: { [Op.iLike]: `%${filters.search}%` } }
            ];
        }

        return await Testimonial.findAll({
            where,
            order: [
                ['is_published', 'DESC'],
                ['created_at', 'DESC']
            ]
        });
    }

    async togglePublish(id) {
        const item = await Testimonial.findByPk(id);
        if (!item) {
            throw new Error('Testimonial not found');
        }
        await item.update({ is_published: !item.is_published });
        return item;
    }

    async update(id, data) {
        const item = await Testimonial.findByPk(id);
        if (!item) {
            throw new Error('Testimonial not found');
        }
        await item.update(data);
        return item;
    }

    async delete(id) {
        const item = await Testimonial.findByPk(id);
        if (!item) {
            throw new Error('Testimonial not found');
        }
        await item.destroy();
        return { message: 'Testimonial deleted successfully' };
    }
}

module.exports = new TestimonialService();
