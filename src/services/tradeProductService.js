const { Op } = require('sequelize');
const { 
    TradeProduct, 
    TradeProductImage, 
    TradeOffer, 
    User, 
    Category, 
    Brand 
} = require('../models/relationships');
const { uploadFile, deleteFile } = require('../utils/uploadToSupabase');

class TradeProductService {

    async create(userId, data, primaryFile = null, galleryFiles = []) {
        let primaryImage = null;

        if (primaryFile) {
            primaryImage = await uploadFile(primaryFile, 'trade-products');
        }

        const tradeProduct = await TradeProduct.create({
            user_id: userId,
            title: data.title,
            description: data.description,
            category_id: data.category_id || null,
            brand_id: data.brand_id || null,
            condition: data.condition || 'good',
            estimated_value: data.estimated_value ? parseFloat(data.estimated_value) : 0.00,
            trading_preference: data.trading_preference || null,
            target_category_id: data.target_category_id || null,
            accept_cash_difference: data.accept_cash_difference !== undefined ? (data.accept_cash_difference === true || data.accept_cash_difference === 'true') : true,
            location: data.location || null,
            phone_number: data.phone_number || null,
            status: data.status || 'available',
            image_url: primaryImage?.url || data.image_url || null,
            image_path: primaryImage?.path || data.image_path || null,
            created_by: userId
        });

        // If primary image exists, record in TradeProductImage table
        if (tradeProduct.image_url) {
            await TradeProductImage.create({
                trade_product_id: tradeProduct.id,
                image_url: tradeProduct.image_url,
                image_path: tradeProduct.image_path,
                is_primary: true
            });
        }

        // Upload any extra gallery files
        if (galleryFiles && galleryFiles.length > 0) {
            for (const file of galleryFiles) {
                try {
                    const uploaded = await uploadFile(file, 'trade-products');
                    await TradeProductImage.create({
                        trade_product_id: tradeProduct.id,
                        image_url: uploaded.url,
                        image_path: uploaded.path,
                        is_primary: false
                    });
                } catch (e) {
                    console.error('[TradeProductService] Gallery file upload failed:', e.message);
                }
            }
        }

        // Handle string array or JSON array of image URLs
        if (data.images && Array.isArray(data.images)) {
            for (const img of data.images) {
                const imgUrl = typeof img === 'string' ? img : img.image_url;
                if (imgUrl && imgUrl !== tradeProduct.image_url) {
                    await TradeProductImage.create({
                        trade_product_id: tradeProduct.id,
                        image_url: imgUrl,
                        image_path: img.image_path || null,
                        is_primary: false
                    });
                }
            }
        }

        return this.findById(tradeProduct.id);
    }

    async findAll(query = {}) {
        const {
            search,
            category_id,
            brand_id,
            condition,
            status,
            min_value,
            max_value,
            location,
            sort = 'created_at_desc',
            page = 1,
            limit = 12
        } = query;

        const where = {};

        // Status filter: default to 'available' unless explicitly given
        if (status && status !== 'all') {
            where.status = status;
        } else if (!status) {
            where.status = 'available';
        }

        if (category_id) {
            where.category_id = category_id;
        }

        if (brand_id) {
            where.brand_id = brand_id;
        }

        if (condition) {
            where.condition = condition;
        }

        if (location) {
            where.location = { [Op.iLike || Op.like]: `%${location}%` };
        }

        if (min_value !== undefined && min_value !== '' || max_value !== undefined && max_value !== '') {
            where.estimated_value = {};
            if (min_value !== undefined && min_value !== '') {
                where.estimated_value[Op.gte] = parseFloat(min_value);
            }
            if (max_value !== undefined && max_value !== '') {
                where.estimated_value[Op.lte] = parseFloat(max_value);
            }
        }

        if (search) {
            const isPostgres = TradeProduct.sequelize.getDialect() === 'postgres';
            const likeOp = isPostgres ? Op.iLike : Op.like;
            where[Op.or] = [
                { title: { [likeOp]: `%${search}%` } },
                { description: { [likeOp]: `%${search}%` } },
                { trading_preference: { [likeOp]: `%${search}%` } },
                { location: { [likeOp]: `%${search}%` } }
            ];
        }

        let order = [['created_at', 'DESC']];
        if (sort === 'price_asc' || sort === 'value_asc') {
            order = [['estimated_value', 'ASC']];
        } else if (sort === 'price_desc' || sort === 'value_desc') {
            order = [['estimated_value', 'DESC']];
        } else if (sort === 'created_at_asc') {
            order = [['created_at', 'ASC']];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
        const offset = (pageNum - 1) * limitNum;

        const { count, rows } = await TradeProduct.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: Category,
                    as: 'targetCategory',
                    attributes: ['id', 'name']
                },
                {
                    model: Brand,
                    as: 'brand',
                    attributes: ['id', 'name']
                },
                {
                    model: TradeProductImage,
                    as: 'images',
                    attributes: ['id', 'image_url', 'is_primary']
                }
            ],
            order,
            limit: limitNum,
            offset,
            distinct: true
        });

        return {
            totalItems: count,
            totalPages: Math.ceil(count / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            tradeProducts: rows
        };
    }

    async findById(id) {
        const tradeProduct = await TradeProduct.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'name', 'email', 'phone']
                },
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: Category,
                    as: 'targetCategory',
                    attributes: ['id', 'name']
                },
                {
                    model: Brand,
                    as: 'brand',
                    attributes: ['id', 'name']
                },
                {
                    model: TradeProductImage,
                    as: 'images',
                    attributes: ['id', 'image_url', 'image_path', 'is_primary']
                },
                {
                    model: TradeOffer,
                    as: 'offers',
                    attributes: ['id', 'sender_id', 'status', 'created_at'],
                    include: [
                        {
                            model: User,
                            as: 'sender',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ]
        });

        if (!tradeProduct) {
            throw new Error('Trade product not found');
        }

        return tradeProduct;
    }

    async findMyListings(userId, query = {}) {
        const { status, page = 1, limit = 10 } = query;
        const where = { user_id: userId };

        if (status && status !== 'all') {
            where.status = status;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
        const offset = (pageNum - 1) * limitNum;

        const { count, rows } = await TradeProduct.findAndCountAll({
            where,
            include: [
                {
                    model: Category,
                    as: 'category',
                    attributes: ['id', 'name']
                },
                {
                    model: Brand,
                    as: 'brand',
                    attributes: ['id', 'name']
                },
                {
                    model: TradeProductImage,
                    as: 'images',
                    attributes: ['id', 'image_url', 'is_primary']
                },
                {
                    model: TradeOffer,
                    as: 'offers',
                    attributes: ['id', 'status']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: limitNum,
            offset,
            distinct: true
        });

        return {
            totalItems: count,
            totalPages: Math.ceil(count / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            tradeProducts: rows
        };
    }

    async update(id, userId, data, primaryFile = null) {
        const tradeProduct = await TradeProduct.findByPk(id);
        if (!tradeProduct) {
            throw new Error('Trade product not found');
        }

        if (tradeProduct.user_id !== userId) {
            throw new Error('Unauthorized to update this trade listing');
        }

        let imageUrl = tradeProduct.image_url;
        let imagePath = tradeProduct.image_path;

        if (primaryFile) {
            if (tradeProduct.image_path) {
                try {
                    await deleteFile(tradeProduct.image_path);
                } catch (e) {
                    console.error('Failed to delete old primary image:', e.message);
                }
            }
            const uploaded = await uploadFile(primaryFile, 'trade-products');
            imageUrl = uploaded.url;
            imagePath = uploaded.path;

            // Update primary image record
            const primaryImg = await TradeProductImage.findOne({
                where: { trade_product_id: id, is_primary: true }
            });
            if (primaryImg) {
                await primaryImg.update({ image_url: imageUrl, image_path: imagePath });
            } else {
                await TradeProductImage.create({
                    trade_product_id: id,
                    image_url: imageUrl,
                    image_path: imagePath,
                    is_primary: true
                });
            }
        } else if (data.image_url !== undefined) {
            imageUrl = data.image_url;
            imagePath = data.image_path || null;
        }

        await tradeProduct.update({
            title: data.title !== undefined ? data.title : tradeProduct.title,
            description: data.description !== undefined ? data.description : tradeProduct.description,
            category_id: data.category_id !== undefined ? data.category_id : tradeProduct.category_id,
            brand_id: data.brand_id !== undefined ? data.brand_id : tradeProduct.brand_id,
            condition: data.condition !== undefined ? data.condition : tradeProduct.condition,
            estimated_value: data.estimated_value !== undefined ? parseFloat(data.estimated_value) : tradeProduct.estimated_value,
            trading_preference: data.trading_preference !== undefined ? data.trading_preference : tradeProduct.trading_preference,
            target_category_id: data.target_category_id !== undefined ? data.target_category_id : tradeProduct.target_category_id,
            accept_cash_difference: data.accept_cash_difference !== undefined ? (data.accept_cash_difference === true || data.accept_cash_difference === 'true') : tradeProduct.accept_cash_difference,
            location: data.location !== undefined ? data.location : tradeProduct.location,
            phone_number: data.phone_number !== undefined ? data.phone_number : tradeProduct.phone_number,
            status: data.status !== undefined ? data.status : tradeProduct.status,
            image_url: imageUrl,
            image_path: imagePath,
            updated_by: userId
        });

        return this.findById(id);
    }

    async delete(id, userId, isAdmin = false) {
        const tradeProduct = await TradeProduct.findByPk(id);
        if (!tradeProduct) {
            throw new Error('Trade product not found');
        }

        if (tradeProduct.user_id !== userId && !isAdmin) {
            throw new Error('Unauthorized to delete this trade listing');
        }

        // Clean up gallery and primary images
        const galleryImages = await TradeProductImage.findAll({
            where: { trade_product_id: id }
        });

        for (const img of galleryImages) {
            if (img.image_path) {
                try {
                    await deleteFile(img.image_path);
                } catch (e) {
                    console.error('[TradeProductService] Error deleting image:', e.message);
                }
            }
        }

        await TradeProductImage.destroy({ where: { trade_product_id: id } });
        await TradeOffer.destroy({ where: { trade_product_id: id } });
        await tradeProduct.destroy();

        return { message: 'Trade product deleted successfully' };
    }
}

module.exports = new TradeProductService();
