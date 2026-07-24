const { Product, Category, Brand } = require("../models/relationships");
const { Op } = require("sequelize");
const {
    uploadFile,
    deleteFile
} = require("../utils/uploadToSupabase");

const {
    successResponse,
    errorResponse
} = require("../utils/response");

class ProductController {

    async create(req, res) {
        try {

            let image = null;

            if (req.file) {
                image = await uploadFile(req.file, "products");
            }

            const data = {
                name: req.body.name,
                description: req.body.description,
                price: req.body.price,
                stock_quantity: req.body.stock_quantity,
                category_id: req.body.category_id,
                brand_id: req.body.brand_id,
                is_active: req.body.is_active ?? true,
                user_id: req.user?.id,

                image_url: image?.url,
                image_path: image?.path
            };

            const product = await Product.create(data);

            return successResponse(
                res,
                "Product created successfully",
                product
            );

        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }
    }
    async findAll(req, res) {

        try {

            const {
                category_id,
                brand_id,
                search
            } = req.query;


            const where = {};


            if (category_id) {
                where.category_id = category_id;
            }


            if (brand_id) {
                where.brand_id = brand_id;
            }


            if (search) {

                where[Op.or] = [
                    {
                        name: {
                            [Op.iLike]: `%${search}%`
                        }
                    },
                    {
                        description: {
                            [Op.iLike]: `%${search}%`
                        }
                    }
                ];

            }


            const products = await Product.findAll({

                where,

                include: [
                    {
                        model: Category,
                        as: "category"
                    },
                    {
                        model: Brand,
                        as: "brand"
                    }
                ],

                order: [
                    ["created_at", "DESC"]
                ]

            });


            return successResponse(
                res,
                "Products fetched successfully",
                {
                    totalItems: products.length,
                    products
                }
            );


        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }

    }
    async findAllTrue(req, res) {

        try {

            const {
                category_id,
                brand_id,
                search,
                page = 1,
                limit = 10
            } = req.query;

            const offset = (page - 1) * limit;

            const where = {
                is_active: true
            };

            if (category_id) {
                where.category_id = category_id;
            }

            if (brand_id) {
                where.brand_id = brand_id;
            }

            if (search) {

                where[Op.or] = [
                    {
                        name: {
                            [Op.iLike]: `%${search}%`
                        }
                    },
                    {
                        description: {
                            [Op.iLike]: `%${search}%`
                        }
                    }
                ];

            }

            const { count, rows } = await Product.findAndCountAll({

                where,

                include: [
                    {
                        model: Category,
                        as: "category"
                    },
                    {
                        model: Brand,
                        as: "brand"
                    }
                ],

                limit: parseInt(limit),
                offset: parseInt(offset),

                order: [
                    ["created_at", "DESC"]
                ]

            });

            return successResponse(
                res,
                "Products fetched successfully",
                {
                    totalItems: count,
                    totalPages: Math.ceil(count / limit),
                    currentPage: parseInt(page),
                    products: rows
                }
            );

        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }

    }

    async findOne(req, res) {

        try {

            const product = await Product.findOne({

                where: {
                    id: req.params.id,
                    is_active: true
                },

                include: [
                    {
                        model: Category,
                        as: "category"
                    },
                    {
                        model: Brand,
                        as: "brand"
                    }
                ]

            });

            if (!product) {

                return errorResponse(
                    res,
                    "Product not found",
                    404
                );

            }

            return successResponse(
                res,
                "Product fetched successfully",
                product
            );

        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }

    }

    async update(req, res) {

        try {

            const product = await Product.findByPk(req.params.id);

            if (!product) {

                return errorResponse(
                    res,
                    "Product not found",
                    404
                );

            }

            const data = {
                name: req.body.name,
                description: req.body.description,
                price: req.body.price,
                stock_quantity: req.body.stock_quantity,
                category_id: req.body.category_id,
                brand_id: req.body.brand_id,
                is_active: req.body.is_active
            };

            if (req.file) {

                if (product.image_path) {
                    await deleteFile(product.image_path);
                }

                const image = await uploadFile(
                    req.file,
                    "products"
                );

                data.image_url = image.url;
                data.image_path = image.path;

            }

            await product.update(data);

            return successResponse(
                res,
                "Product updated successfully",
                product
            );

        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }

    }

    async delete(req, res) {

        try {

            const product = await Product.findByPk(req.params.id);

            if (!product) {

                return errorResponse(
                    res,
                    "Product not found",
                    404
                );

            }
            if (product.image_path) {
                await deleteFile(product.image_path);
            }
            await product.destroy();
            return successResponse(
                res,
                "Product deleted successfully"
            );

        } catch (error) {

            return errorResponse(
                res,
                error.message
            );

        }

    }

    async seed(req, res) {
        try {
            // Find or create default categories
            const [catElectronics] = await Category.findOrCreate({
                where: { name: 'Electronics' },
                defaults: { note: 'Devices, gadgets, and smart products' }
            });
            const [catFashion] = await Category.findOrCreate({
                where: { name: 'Fashion' },
                defaults: { note: 'Apparel, footwear, and accessories' }
            });
            const [catAppliances] = await Category.findOrCreate({
                where: { name: 'Home Appliances' },
                defaults: { note: 'Kitchen and cleaning appliances' }
            });

            // Find or create default brands
            const [brandApple] = await Brand.findOrCreate({
                where: { name: 'Apple' },
                defaults: { description: 'Premium phones, laptops, and tablets' }
            });
            const [brandSony] = await Brand.findOrCreate({
                where: { name: 'Sony' },
                defaults: { description: 'Industry-leading audio and entertainment electronics' }
            });
            const [brandNike] = await Brand.findOrCreate({
                where: { name: 'Nike' },
                defaults: { description: 'Athletic shoes and apparel' }
            });
            const [brandDyson] = await Brand.findOrCreate({
                where: { name: 'Dyson' },
                defaults: { description: 'Innovative smart vacuums and air care' }
            });

            // Check if products already exist
            const productCount = await Product.count();
            if (productCount > 0) {
                return successResponse(res, 'Database already seeded with products', { count: productCount });
            }

            // Create products
            const mockProducts = [
                {
                    name: 'iPhone 15 Pro Max',
                    description: 'Latest Apple iPhone featuring aerospace-grade titanium design, A17 Pro chip, and a 48MP camera system.',
                    price: 1199.00,
                    stock_quantity: 15,
                    image_url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandApple.id
                },
                {
                    name: 'MacBook Air M3',
                    description: 'Supercharged by the M3 chip, this ultra-thin laptop delivers high speed and up to 18 hours of battery life.',
                    price: 1099.00,
                    stock_quantity: 10,
                    image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandApple.id
                },
                {
                    name: 'Sony WH-1000XM5 Headphones',
                    description: 'Wireless noise-canceling headphones with premium sound, crystal clear calling quality, and smart sensors.',
                    price: 349.99,
                    stock_quantity: 25,
                    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandSony.id
                },
                {
                    name: 'Sony Bravia 4K Smart TV',
                    description: 'Experience stunning 4K visuals, immersive Dolby Atmos sound, and Google TV integration.',
                    price: 799.99,
                    stock_quantity: 8,
                    image_url: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&q=80&w=400',
                    category_id: catElectronics.id,
                    brand_id: brandSony.id
                },
                {
                    name: 'Nike Air Max Sneaker',
                    description: 'Comfortable running and lifestyle sneaker featuring iconic Air Max cushioning and breathability.',
                    price: 150.00,
                    stock_quantity: 40,
                    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=400',
                    category_id: catFashion.id,
                    brand_id: brandNike.id
                },
                {
                    name: 'Dyson V15 Detect Vacuum',
                    description: 'Cordless vacuum cleaner with laser illumination that reveals invisible dust, smart suction optimization.',
                    price: 749.00,
                    stock_quantity: 12,
                    image_url: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&q=80&w=400',
                    category_id: catAppliances.id,
                    brand_id: brandDyson.id
                }
            ];

            const createdProducts = await Product.bulkCreate(mockProducts);
            return successResponse(res, 'Mock products seeded successfully', {
                categoriesCreated: 3,
                brandsCreated: 4,
                productsCreated: createdProducts.length
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

}

module.exports = new ProductController();