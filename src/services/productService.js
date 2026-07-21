const Product = require('../models/productModel');

class ProductService {
    async index() {
        return await Product.findAll();
    }

    async show(id) {
        return await Product.findByPk(id);
    }

    async create(data) {
        return await Product.create(data);
    }

    async update(id, data) {
        const product = await Product.findByPk(id);

        if (!product) {
            throw new Error('Product not found');
        }

        await product.update(data);
        return product;
    }

    async destroy(id) {
        const product = await Product.findByPk(id);

        if (!product) {
            throw new Error('Product not found');
        }

        await product.destroy();

        return {
            message: 'Product deleted successfully',
        };
    }
}

module.exports = new ProductService();