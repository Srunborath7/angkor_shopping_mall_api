const { Op } = require("sequelize");
const aiProviderService = require("./aiProviderService");
const {
    Product,
    ProductVariant,
    ProductDetail,
    ProductImage,
    ProductReview,
    Category,
    Brand,
    FlashSale,
    Order,
    OrderItem,
    User,
    TradeProduct
} = require("../models/relationships");

class ChatbotService {
    /**
     * Primary conversation handler
     * @param {string} userMessage - text sent by user
     * @param {object} options - { userId, context: { page, productId, categoryId, lang } }
     */
    async processMessage(userMessage = "", options = {}) {
        const rawText = (userMessage || "").trim();
        const text = rawText.toLowerCase();
        const userId = options.userId || null;
        const pageContext = options.context || {};
        const isKhmer = pageContext.lang === "km" || /[\u1780-\u17FF]/.test(rawText);

        // 1. Fetch Customer Profile if logged in
        let customer = null;
        let customerName = null;
        if (userId) {
            try {
                customer = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone'] });
                customerName = customer?.name || null;
            } catch (e) {}
        }

        // 2. Fetch Customer's Recent Orders for context
        let recentOrders = [];
        if (userId) {
            try {
                const orders = await Order.findAll({
                    where: { user_id: userId },
                    limit: 3,
                    order: [['created_at', 'DESC']],
                    include: [
                        {
                            model: OrderItem,
                            as: 'items',
                            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'price'] }]
                        }
                    ]
                });
                recentOrders = orders.map(o => ({
                    id: `#ORD-${o.id.slice(0, 8).toUpperCase()}`,
                    rawId: o.id,
                    total: `$${parseFloat(o.total_amount).toFixed(2)}`,
                    status: o.status,
                    date: o.created_at
                }));
            } catch (e) {}
        }

        // 3. Search Matching Products in Database
        let matchingProducts = [];
        try {
            const searchWords = rawText.replace(/[^a-zA-Z0-9\u1780-\u17FF ]/g, '').split(' ').filter(w => w.length > 2);
            let whereClause = { is_active: true };

            if (searchWords.length > 0) {
                whereClause[Op.or] = searchWords.map(w => ({
                    name: { [Op.iLike]: `%${w}%` }
                }));
            }

            const prods = await Product.findAll({
                where: whereClause,
                limit: 4,
                include: [
                    { model: ProductImage, as: 'images', attributes: ['image_url', 'is_primary'] },
                    { model: Category, as: 'category', attributes: ['name'] },
                    { model: Brand, as: 'brand', attributes: ['name'] },
                    { model: FlashSale, as: 'flashSales', where: { status: 'active' }, required: false }
                ]
            });

            matchingProducts = prods.map(p => this.formatProductCard(p));
        } catch (e) {}

        // 4. If AI (OpenAI / Gemini) is available, generate smart personalized response
        if (aiProviderService.isAIAvailable()) {
            try {
                const storeContext = {
                    customerName: customerName,
                    customerEmail: customer?.email,
                    language: pageContext.lang || (isKhmer ? 'km' : 'en'),
                    page: pageContext.page,
                    orders: recentOrders,
                    products: matchingProducts.slice(0, 4)
                };

                const aiReply = await aiProviderService.generateChatbotAIResponse(rawText, storeContext);

                if (aiReply) {
                    return {
                        replyText: aiReply,
                        products: matchingProducts.length > 0 ? matchingProducts : [],
                        orders: (text.includes('order') || text.includes('ទិញ') || text.includes('កាម៉ង់') || text.includes('status')) ? recentOrders : [],
                        actions: this.getRecommendedActions(text, isKhmer)
                    };
                }
            } catch (aiErr) {
                console.warn('[ChatbotService] AI response fallback:', aiErr.message);
            }
        }

        // 5. Intelligent Rule-Based Fallback (Polite, multilingual & personalized by Name)
        return await this.handleSmartRuleBasedResponse(rawText, {
            customerName,
            isKhmer,
            recentOrders,
            matchingProducts,
            pageContext,
            userId
        });
    }

    /**
     * Fallback Intelligent Response Handler
     */
    async handleSmartRuleBasedResponse(rawText, { customerName, isKhmer, recentOrders, matchingProducts, pageContext, userId }) {
        const text = rawText.toLowerCase();
        const greetingName = customerName ? (isKhmer ? `បង ${customerName}` : customerName) : (isKhmer ? 'លោកអ្នក' : 'there');

        // Order Inquiry
        if (text.includes('order') || text.includes('track') || text.includes('កាម៉ង់') || text.includes('ទំនិញខ្ញុំ') || text.includes('status')) {
            if (!userId) {
                return {
                    replyText: isKhmer
                        ? `👋 សួស្តី${greetingName}! ដើម្បីពិនិត្យមើល និងតាមដានការបញ្ជាទិញរបស់អ្នក សូមចូលគណនី (Sign in) ជាមុនសិន។`
                        : `👋 Hello ${greetingName}! To view and track your orders, please sign in to your account.`,
                    actions: [
                        { label: isKhmer ? "🔑 ចូលគណនី (Login)" : "🔑 Sign In", path: "/auth/login", icon: "UserIcon" },
                        { label: isKhmer ? "🛍️ មើលទំនិញទាំងអស់" : "🛍️ Browse Shop", path: "/shop", icon: "ShoppingBag" }
                    ]
                };
            }

            if (recentOrders.length > 0) {
                return {
                    replyText: isKhmer
                        ? `📦 សួស្តី${greetingName}! នេះជាប្រវត្តិការបញ្ជាទិញចុងក្រោយរបស់អ្នកនៅ Angkor Shopping Mall ៖`
                        : `📦 Hello ${greetingName}! Here are your most recent orders at Angkor Shopping Mall:`,
                    orders: recentOrders,
                    actions: [
                        { label: isKhmer ? "📦 មើលការបញ្ជាទិញទាំងអស់" : "📦 View All Orders", path: "/orders", icon: "Package" }
                    ]
                };
            }

            return {
                replyText: isKhmer
                    ? `📦 សួស្តី${greetingName}! លោកអ្នកមិនទាន់មានការបញ្ជាទិញនៅឡើយទេ។ សូមរីករាយជាមួយការទិញទំនិញក្នុងហាងយើងខ្ញុំ!`
                    : `📦 Hello ${greetingName}! You don't have any placed orders yet. Explore our shop to find top tech deals!`,
                actions: [
                    { label: isKhmer ? "⚡ Flash Sales បញ្ចុះតម្លៃ" : "⚡ Flash Sales", path: "/shop?flashSale=true", icon: "Flame" },
                    { label: isKhmer ? "🛍️ ទៅកាន់ហាង" : "🛍️ Browse Shop", path: "/shop", icon: "ShoppingBag" }
                ]
            };
        }

        // Flash Sale / Discount
        if (text.includes('flash') || text.includes('sale') || text.includes('deal') || text.includes('discount') || text.includes('បញ្ចុះតម្លៃ') || text.includes('ប្រូម៉ូសិន')) {
            const flashProducts = await this.getFlashSaleProducts();
            return {
                replyText: isKhmer
                    ? `🔥 សួស្តី${greetingName}! ថ្ងៃនេះ Angkor Shopping Mall មានប្រូម៉ូសិន Flash Sale បញ្ចុះតម្លៃរហូតដល់ 50% លើផលិតផលស្មាតហ្វូន កុំព្យូទ័រ និងគ្រឿងអេឡិចត្រូនិកជាច្រើន! ⚡`
                    : `🔥 Hello ${greetingName}! Today Angkor Shopping Mall has exciting Flash Sale discounts up to 50% off on smartphones, laptops, and gadgets! ⚡`,
                products: flashProducts.length > 0 ? flashProducts : matchingProducts,
                actions: [
                    { label: isKhmer ? "⚡ មើល Flash Sales ទាំងអស់" : "⚡ View All Flash Deals", path: "/shop?flashSale=true", icon: "Flame" }
                ]
            };
        }

        // Payment / Bakong KHQR
        if (text.includes('pay') || text.includes('khqr') || text.includes('aba') || text.includes('bakong') || text.includes('card') || text.includes('លុយ') || text.includes('ទូទាត់')) {
            return {
                replyText: isKhmer
                    ? `💳 **វិធីទូទាត់ប្រាក់នៅ Angkor Shopping Mall**\n\nសួស្តី${greetingName}! ហាងយើងខ្ញុំទទួលការទូទាត់ប្រាក់យ៉ាងងាយស្រួល និងមានសុវត្ថិភាពខ្ពស់ ៖\n\n• 🇰🇭 **Bakong KHQR**: ស្កេនទូទាត់បានភ្លាមៗជាមួយ ABA, ACLEDA, Wing, Canadia, Sathapana និងគ្រប់ធនាគារក្នុងស្រុក។\n• 💳 **Credit / Debit Cards**: Visa, Mastercard & UnionPay\n• 🚚 **Cash on Delivery (COD)**: ទូទាត់ប្រាក់ផ្ទាល់ពេលទំនិញដឹកដល់ដៃ\n• 🔄 **Trade-In Credits**: ប្រើប្រាស់ឥណទានប្តូរសេរីទូរស័ព្ទដើម្បីកាត់បន្ថយតម្លៃទិញ`
                    : `💳 **Payment Methods at Angkor Shopping Mall**\n\nHello ${greetingName}! We support fast, secure payments via:\n\n• 🇰🇭 **Bakong KHQR**: Instant QR scan with ABA, ACLEDA, Wing, Canadia, and all Cambodian bank apps.\n• 💳 **Visa / Mastercard**: Secure debit and credit card processing.\n• 🚚 **Cash on Delivery (COD)**: Pay when your items arrive at your doorstep.\n• 🔄 **Trade-In Credit**: Apply instant exchange discounts.`,
                actions: [
                    { label: isKhmer ? "🛍️ ទៅកាន់ហាងទិញទំនិញ" : "🛍️ Shop Now", path: "/shop", icon: "ShoppingBag" },
                    { label: isKhmer ? "🔄 សេវាកម្ម Trade-In" : "🔄 Trade-In Hub", path: "/trading", icon: "Repeat" }
                ]
            };
        }

        // Trade-In
        if (text.includes('trade') || text.includes('swap') || text.includes('exchange') || text.includes('ប្តូរ') || text.includes('ចាស់')) {
            return {
                replyText: isKhmer
                    ? `🔄 **សេវាកម្មប្តូរសេរីទូរស័ព្ទ & កុំព្យូទ័រ (Device Trade-In)**\n\nសួស្តី${greetingName}! លោកអ្នកអាចយកទូរស័ព្ទដៃ ឬ Laptop ចាស់ៗមកវាយតម្លៃ ដើម្បីទទួលបានឥណទានបញ្ចុះតម្លៃភ្លាមៗពេលទិញផលិតផលថ្មីនៅ Angkor Shopping Mall! 📱💻`
                    : `🔄 **Device Trade-In Program**\n\nHello ${greetingName}! You can exchange your pre-owned smartphone or laptop for instant discount credits towards brand-new tech at Angkor Shopping Mall! 📱💻`,
                actions: [
                    { label: isKhmer ? "🔄 វាយតម្លៃឧបករណ៍ចាស់" : "🔄 Get Trade-In Estimate", path: "/trading", icon: "Repeat" }
                ]
            };
        }

        // Product search results if matched
        if (matchingProducts.length > 0) {
            return {
                replyText: isKhmer
                    ? `✨ សួស្តី${greetingName}! ខ្ញុំបានស្វែងរកឃើញផលិតផលដែលត្រូវនឹងអ្វីដែលលោកអ្នកចង់បាន ៖`
                    : `✨ Hello ${greetingName}! Here are the top matching products found in our catalog:`,
                products: matchingProducts,
                actions: [
                    { label: isKhmer ? "🛍️ មើលទំនិញបន្ថែមទៀត" : "🛍️ View Full Catalog", path: "/shop", icon: "ShoppingBag" }
                ]
            };
        }

        // General Greeting / Assistance
        return {
            replyText: isKhmer
                ? `👋 សួស្តី${greetingName}! ខ្ញុំជា **Smart AI Shopping Assistant** របស់ Angkor Shopping Mall! ខ្ញុំអាចជួយបងប្អូនស្វែងរកទំនិញ ពិនិត្យប្រូម៉ូសិន Flash Sale តាមដានការបញ្ជាទិញ ឬភ្ជាប់ទំនាក់ទំនងទៅកាន់ Admin ហាង។ តើបងចង់ស្វែងរកអ្វីដែរ? ✨`
                : `👋 Hello ${greetingName}! I'm your **Smart AI Shopping Assistant** at Angkor Shopping Mall! I can help you find products, check daily flash deals, track your orders, or contact store support. How can I help you today? ✨`,
            actions: [
                { label: isKhmer ? "⚡ Flash Sales បញ្ចុះតម្លៃ" : "⚡ Flash Deals", path: "/shop?flashSale=true", icon: "Flame" },
                { label: isKhmer ? "🛍️ មើលទំនិញទាំងអស់" : "🛍️ Browse Shop", path: "/shop", icon: "ShoppingBag" },
                { label: isKhmer ? "✉️ ផ្ញើសារទៅ Admin" : "✉️ Message Admin", actionType: "contact_admin", icon: "Headphones" }
            ]
        };
    }

    async getFlashSaleProducts() {
        try {
            const sales = await FlashSale.findAll({
                where: { status: 'active' },
                limit: 4,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        include: [{ model: ProductImage, as: 'images', attributes: ['image_url', 'is_primary'] }]
                    }
                ]
            });
            return sales.map(s => {
                const prod = s.product;
                if (!prod) return null;
                return {
                    id: prod.id,
                    name: prod.name,
                    price: parseFloat(s.price || prod.price),
                    originalPrice: parseFloat(prod.price),
                    discount_percentage: s.discount_percentage,
                    image_url: prod.images?.[0]?.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
                    is_flash_sale: true
                };
            }).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    formatProductCard(product) {
        const primaryImg = product.images?.find(i => i.is_primary)?.image_url || product.images?.[0]?.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
        const hasFlash = product.flashSales && product.flashSales.length > 0;
        const flashPrice = hasFlash ? parseFloat(product.flashSales[0].price) : null;

        return {
            id: product.id,
            name: product.name,
            price: flashPrice || parseFloat(product.price),
            originalPrice: hasFlash ? parseFloat(product.price) : null,
            image_url: primaryImg,
            category: product.category?.name || '',
            brand: product.brand?.name || '',
            stock_quantity: product.stock_quantity,
            is_flash_sale: hasFlash
        };
    }

    getRecommendedActions(text, isKhmer) {
        return [
            { label: isKhmer ? "⚡ Flash Sales" : "⚡ Flash Deals", path: "/shop?flashSale=true", icon: "Flame" },
            { label: isKhmer ? "🛍️ ទិញទំនិញ" : "🛍️ Shop All", path: "/shop", icon: "ShoppingBag" },
            { label: isKhmer ? "🔄 សេវាកម្ម Trade-In" : "🔄 Trade-In", path: "/trading", icon: "Repeat" },
            { label: isKhmer ? "✉️ ផ្ញើសារទៅ Admin" : "✉️ Contact Support", actionType: "contact_admin", icon: "Headphones" }
        ];
    }

    async getQuickPrompts() {
        return [
            { label: "⚡ Flash Sales", query: "What are today's flash sales and deals?" },
            { label: "📱 Phones under $500", query: "Show me smartphones under $500" },
            { label: "💻 Laptops & PC", query: "Find top performance laptops" },
            { label: "🔄 Device Trade-In", query: "How does device trade-in work?" },
            { label: "✉️ Message Admin", query: "I want to contact admin and support" },
            { label: "📦 Track My Order", query: "Where is my order?" },
            { label: "💳 Payment Methods", query: "What payment methods are supported?" }
        ];
    }
}

module.exports = new ChatbotService();
