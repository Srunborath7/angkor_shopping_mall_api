const FlashSale = require('../models/flashSaleModel');
const { Product, ProductImage, Category } = require('../models/relationships');

class FlashSaleService {

    /**
     * Build the product include block used in every query.
     */
    _productInclude() {
        return [
            {
                model: Product,
                as: 'product',
                required: false,
                attributes: ['id', 'name', 'price'],
                include: [
                    {
                        model: ProductImage,
                        as: 'images',
                        required: false,
                        attributes: ['image_url', 'is_primary'],
                        limit: 1,
                        order: [['is_primary', 'DESC']],
                    },
                    {
                        model: Category,
                        as: 'category',
                        required: false,
                        attributes: ['name'],
                    }
                ]
            }
        ];
    }

    /**
     * Resolve the best image URL from a product record.
     */
    _resolveProductImage(product) {
        if (!product) return null;
        const primary = (product.images || []).find(i => i.is_primary);
        const first   = (product.images || [])[0];
        return primary?.image_url || first?.image_url || product.image_url || null;
    }

    /**
     * Enrich a raw flash sale plain object with live product data.
     */
    _enrich(sale) {
        const data = sale.toJSON ? sale.toJSON() : { ...sale };
        const prod = data.product;
        if (prod) {
            data.image    = this._resolveProductImage(prod) || data.image;
            data.name     = data.name     || prod.name;
            data.category = typeof prod.category === 'object'
                ? (prod.category?.name ?? data.category)
                : (prod.category || data.category);
        }
        return data;
    }

    /**
     * Create a flash sale.
     * If product_id is supplied the product's data is auto-populated into
     * the flash sale record (image, name, category, price) — any explicit
     * overrides in the request body take precedence.
     */
    async create(data) {
        let enrichedData = { ...data };

        if (data.product_id) {
            const product = await Product.findByPk(data.product_id, {
                include: [
                    {
                        model: ProductImage,
                        as: 'images',
                        required: false,
                        attributes: ['image_url', 'is_primary'],
                    },
                    {
                        model: Category,
                        as: 'category',
                        required: false,
                        attributes: ['name'],
                    }
                ]
            });

            if (!product) throw new Error(`Product with id "${data.product_id}" not found`);

            const image = this._resolveProductImage(product);
            const categoryName = typeof product.category === 'object'
                ? (product.category?.name ?? null)
                : product.category;
            const originalPrice = Number(product.price ?? 0);
            const discountPct   = Number(data.discount ?? 0);
            const salePrice     = discountPct > 0
                ? Number((originalPrice * (1 - discountPct / 100)).toFixed(2))
                : originalPrice;

            // Product values are defaults; explicit body fields override them
            enrichedData = {
                product_id:    data.product_id,
                name:          data.name          || product.name,
                image:         data.image         || image,
                category:      data.category      || categoryName,
                originalPrice: data.originalPrice ?? originalPrice,
                price:         data.price         ?? salePrice,
                discount:      data.discount       ?? 0,
                badge:         data.badge          || 'Flash Deal',
                stockLimit:    data.stockLimit     ?? 20,
                claimedPct:    data.claimedPct     ?? 0,
                status:        data.status         || 'active',
                endTime:       data.endTime        || null,
            };
        }

        return await FlashSale.create(enrichedData);
    }

    async findAll() {
        const { Op } = require('sequelize');
        try {
            await FlashSale.destroy({
                where: {
                    endTime: {
                        [Op.ne]: null,
                        [Op.lt]: new Date()
                    }
                }
            });
        } catch (e) {
            // ignore cleanup warning
        }

        const sales = await FlashSale.findAll({
            include: this._productInclude(),
            order: [['created_at', 'DESC']],
        });
        return sales.map(s => this._enrich(s));
    }

    async findActive() {
        const { Op } = require('sequelize');
        try {
            await FlashSale.destroy({
                where: {
                    endTime: {
                        [Op.ne]: null,
                        [Op.lt]: new Date()
                    }
                }
            });
        } catch (e) {
            // ignore cleanup warning
        }

        const sales = await FlashSale.findAll({
            where: {
                status: 'active',
                [Op.or]: [
                    { endTime: null },
                    { endTime: { [Op.gt]: new Date() } }
                ]
            },
            include: this._productInclude(),
            order: [['created_at', 'DESC']],
        });
        return sales.map(s => this._enrich(s));
    }

    async findById(id) {
        const sale = await FlashSale.findByPk(id, {
            include: this._productInclude(),
        });
        return sale ? this._enrich(sale) : null;
    }

    async update(id, data) {
        const sale = await FlashSale.findByPk(id);
        if (!sale) throw new Error('Flash sale deal not found');
        await sale.update(data);
        // Re-fetch with product join so the response has the image
        return this.findById(id);
    }

    async delete(id) {
        const sale = await FlashSale.findByPk(id);
        if (!sale) throw new Error('Flash sale deal not found');
        await sale.destroy();
        return true;
    }
}

module.exports = new FlashSaleService();

