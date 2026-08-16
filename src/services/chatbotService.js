const { Op } = require("sequelize");
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
    TradeProduct
} = require("../models/relationships");

class ChatbotService {
    /**
     * Primary conversation handler
     * @param {string} userMessage - text sent by user
     * @param {object} options - { userId, context: { page, productId, categoryId } }
     */
    async processMessage(userMessage = "", options = {}) {
        const rawText = (userMessage || "").trim();
        const text = rawText.toLowerCase();
        const userId = options.userId || null;
        const pageContext = options.context || {};

        // Extract UUID if user entered a specific order id
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const uuidMatch = rawText.match(uuidRegex);

        // 1. Check for specific order ID query
        if (uuidMatch) {
            return await this.handleSpecificOrderLookup(uuidMatch[0]);
        }

        // 2. Check for Contextual queries (e.g. user is on a product page asking "is this in stock?" or "tell me about this product")
        if (pageContext.productId && (text.includes("this") || text.includes("product") || text.includes("stock") || text.includes("price") || text.includes("warranty") || text.includes("detail") || text.includes("spec"))) {
            const contextResponse = await this.handleProductContext(pageContext.productId, text);
            if (contextResponse) return contextResponse;
        }

        // 3. Order Tracking / History intent
        if (
            text.includes("my order") ||
            text.includes("track order") ||
            text.includes("order status") ||
            text.includes("where is my order") ||
            text.includes("tracking") ||
            text.includes("check order") ||
            text.includes("my purchase") ||
            text.includes("invoice")
        ) {
            return await this.handleOrderInquiry(userId, rawText);
        }

        // 4. Flash Sale & Deals intent
        if (
            text.includes("flash") ||
            text.includes("deal") ||
            text.includes("sale") ||
            text.includes("discount") ||
            text.includes("promo") ||
            text.includes("offer") ||
            text.includes("cheap") ||
            text.includes("promotion")
        ) {
            return await this.handleFlashSales();
        }

        // 5. Trade-in intent
        if (
            text.includes("trade") ||
            text.includes("exchange") ||
            text.includes("swap") ||
            text.includes("old phone") ||
            text.includes("sell device") ||
            text.includes("trade-in") ||
            text.includes("valuation")
        ) {
            return await this.handleTradeInInquiry();
        }

        // 6. Payment & Checkout intent
        if (
            text.includes("pay") ||
            text.includes("aba") ||
            text.includes("khqr") ||
            text.includes("bakong") ||
            text.includes("wing") ||
            text.includes("card") ||
            text.includes("cash") ||
            text.includes("cod") ||
            text.includes("payment method")
        ) {
            return this.handlePaymentInfo();
        }

        // 7. Shipping & Delivery intent
        if (
            text.includes("ship") ||
            text.includes("deliver") ||
            text.includes("province") ||
            text.includes("phnom penh") ||
            text.includes("how long") ||
            text.includes("delivery time") ||
            text.includes("fee")
        ) {
            return this.handleShippingInfo();
        }

        // 8. Warranty & Return Policy intent
        if (
            text.includes("warranty") ||
            text.includes("return") ||
            text.includes("refund") ||
            text.includes("replace") ||
            text.includes("guarantee") ||
            text.includes("broken") ||
            text.includes("defective")
        ) {
            return this.handleWarrantyInfo();
        }

        // 9. Contact, Support & Store Location intent
        if (
            text.includes("contact") ||
            text.includes("location") ||
            text.includes("store") ||
            text.includes("shop address") ||
            text.includes("phone number") ||
            text.includes("support") ||
            text.includes("customer care") ||
            text.includes("working hour") ||
            text.includes("open")
        ) {
            return this.handleStoreInfo();
        }

        // 10. Greetings & Small talk
        if (
            text === "hi" ||
            text === "hello" ||
            text === "hey" ||
            text.startsWith("hi ") ||
            text.startsWith("hello ") ||
            text.startsWith("hey ") ||
            text.includes("good morning") ||
            text.includes("good afternoon") ||
            text.includes("good evening") ||
            text.includes("sok sabay") ||
            text.includes("chom reap sour") ||
            text.includes("who are you") ||
            text.includes("what can you do")
        ) {
            return this.handleGreeting();
        }

        // 11. Recommendations / Trending intent
        if (
            text.includes("recommend") ||
            text.includes("suggest") ||
            text.includes("popular") ||
            text.includes("trending") ||
            text.includes("best seller") ||
            text.includes("top rated")
        ) {
            return await this.handleRecommendations();
        }

        // 12. Smart Product Search (Category, Brand, Price constraint, or keyword)
        return await this.handleProductSearch(rawText);
    }

    /**
     * Look up specific order by UUID
     */
    async handleSpecificOrderLookup(orderId) {
        try {
            const order = await Order.findOne({
                where: { id: orderId },
                include: [
                    {
                        model: OrderItem,
                        as: "items",
                        include: [
                            {
                                model: Product,
                                as: "product",
                                attributes: ["id", "name", "price"],
                                include: [{ model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] }]
                            }
                        ]
                    }
                ]
            });

            if (!order) {
                return {
                    replyText: `🔍 I couldn't find an order matching ID **${orderId}**. Please double-check the order number or check your order history.`,
                    actions: [
                        { label: "View All Orders", path: "/orders", icon: "Package" },
                        { label: "Browse Shop", path: "/shop", icon: "ShoppingBag" }
                    ]
                };
            }

            const formattedOrder = this.formatOrderCard(order);
            const statusMap = {
                pending: "⏳ **Pending Payment** - Waiting for payment confirmation.",
                paid: "✅ **Payment Confirmed** - Preparing your order for shipment.",
                shipped: "🚚 **Shipped & On The Way** - Your order is en route.",
                completed: "🎉 **Delivered** - Order successfully fulfilled.",
                cancelled: "❌ **Cancelled** - This order has been cancelled.",
                failed: "⚠️ **Payment Failed** - Please retry payment or contact support."
            };

            return {
                replyText: `📦 **Order Status for #${order.id.slice(0, 8)}**\n\n${statusMap[order.status] || order.status}\n• **Total**: $${parseFloat(order.total_amount).toFixed(2)}\n• **Items**: ${order.items?.length || 0} item(s)\n• **Shipping To**: ${order.shipping_address}\n• **Phone**: ${order.contact_phone}`,
                orders: [formattedOrder],
                actions: [
                    { label: "View Order Details", path: "/orders", icon: "Package" },
                    { label: "Continue Shopping", path: "/shop", icon: "ShoppingBag" }
                ]
            };
        } catch (error) {
            console.error("[ChatbotService] handleSpecificOrderLookup error:", error.message);
            return {
                replyText: "An error occurred while looking up that order. Please check your **My Orders** page.",
                actions: [{ label: "My Orders", path: "/orders", icon: "Package" }]
            };
        }
    }

    /**
     * Handle user order inquiries
     */
    async handleOrderInquiry(userId, rawText) {
        if (!userId) {
            return {
                replyText: "📦 **Order Tracking & Management**\n\nTo view your live order updates, please **Log In** to your account, or enter your **Order ID (UUID)** here directly.\n\n• **Express Phnom Penh**: 1-2 Business Days\n• **Provinces**: 2-4 Business Days",
                actions: [
                    { label: "Log In to View Orders", path: "/auth/login", icon: "User" },
                    { label: "Track in My Orders", path: "/orders", icon: "Package" }
                ],
                suggestedPrompts: ["What payment methods are supported?", "How does shipping work?", "Show flash sales"]
            };
        }

        try {
            const orders = await Order.findAll({
                where: { user_id: userId },
                order: [["created_at", "DESC"]],
                limit: 3,
                include: [
                    {
                        model: OrderItem,
                        as: "items",
                        include: [
                            {
                                model: Product,
                                as: "product",
                                attributes: ["id", "name", "price"],
                                include: [{ model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] }]
                            }
                        ]
                    }
                ]
            });

            if (!orders || orders.length === 0) {
                return {
                    replyText: "📦 You don't have any recent orders yet. Explore our latest arrivals and flash sales to find your next favorite tech gear!",
                    actions: [
                        { label: "Shop Deals Now", path: "/shop", icon: "ShoppingBag" },
                        { label: "Browse Flash Sales", path: "/shop?flashSale=true", icon: "Flame" }
                    ]
                };
            }

            const formattedOrders = orders.map(o => this.formatOrderCard(o));
            const latest = orders[0];

            return {
                replyText: `📦 Here are your latest orders. Your most recent order **#${latest.id.slice(0, 8)}** is currently **${latest.status.toUpperCase()}**.\n\nYou can track delivery updates or view complete invoices below:`,
                orders: formattedOrders,
                actions: [
                    { label: "View All Orders", path: "/orders", icon: "Package" },
                    { label: "Shop More Products", path: "/shop", icon: "ShoppingBag" }
                ]
            };
        } catch (error) {
            console.error("[ChatbotService] handleOrderInquiry error:", error.message);
            return {
                replyText: "You can track and manage all your orders directly in the **My Orders** page.",
                actions: [{ label: "Open Orders", path: "/orders", icon: "Package" }]
            };
        }
    }

    /**
     * Active Flash Sales Handler
     */
    async handleFlashSales() {
        try {
            const flashSales = await FlashSale.findAll({
                where: { status: "active" },
                order: [["discount", "DESC"]],
                limit: 4
            });

            if (!flashSales || flashSales.length === 0) {
                return {
                    replyText: "🔥 **Today's Hot Deals & Special Offers**\n\nWhile flash deals are refreshing, you can browse all discounted products in our shop right now!",
                    actions: [
                        { label: "Browse Shop", path: "/shop", icon: "ShoppingBag" },
                        { label: "AI Recommendations", path: "/recommendations", icon: "Sparkles" }
                    ]
                };
            }

            const products = flashSales.map(fs => ({
                id: fs.product_id || fs.id,
                name: fs.name,
                price: parseFloat(fs.price),
                original_price: parseFloat(fs.originalPrice || fs.price),
                discount_percentage: fs.discount || 0,
                image_url: fs.image || null,
                badge: fs.badge || `${fs.discount}% OFF`,
                in_stock: (fs.stockLimit || 20) > 0,
                claimed_pct: fs.claimedPct || 50,
                is_flash_sale: true
            }));

            const maxDiscount = Math.max(...flashSales.map(f => f.discount || 0));

            return {
                replyText: `🔥 **Live Flash Sales & Exclusive Deals!**\n\nSave up to **${maxDiscount}% OFF** on top electronics and gadgets today. Limited stock available!`,
                products: products,
                actions: [
                    { label: "Explore All Deals", path: "/shop", icon: "Flame" },
                    { label: "Trade-in & Save More", path: "/trading", icon: "Repeat" }
                ],
                suggestedPrompts: ["How does trade-in work?", "What are payment methods?", "Find phones under $500"]
            };
        } catch (error) {
            console.error("[ChatbotService] handleFlashSales error:", error.message);
            return {
                replyText: "🔥 Check out today's best discounted products in the shop!",
                actions: [{ label: "Browse Shop", path: "/shop", icon: "ShoppingBag" }]
            };
        }
    }

    /**
     * Trade-in Assistant
     */
    async handleTradeInInquiry() {
        try {
            return {
                replyText: "🔄 **Angkor Shopping Mall Trade-In Program**\n\nUpgrade your smartphone or laptop effortlessly with our 3-step trade-in process:\n\n1. **Submit Device Info**: Select brand, model, condition (Like New, Good, Fair).\n2. **Get Instant Valuation**: Receive an instant trade valuation and exchange estimate.\n3. **Apply Trade Discount**: Deduct the trade credit directly on your new checkout or swap with verified members!",
                actions: [
                    { label: "Start Trade-In Now", path: "/trading", icon: "Repeat" },
                    { label: "Browse New Phones", path: "/shop", icon: "ShoppingBag" }
                ],
                suggestedPrompts: [
                    "Show flash sales",
                    "Find laptops under $1000",
                    "How to track order?"
                ]
            };
        } catch (error) {
            return {
                replyText: "🔄 Trade your old devices for instant store credits or direct exchange. Visit our **Trade-In Hub** to get started!",
                actions: [{ label: "Trade-In Hub", path: "/trading", icon: "Repeat" }]
            };
        }
    }

    /**
     * Payment Methods Info
     */
    handlePaymentInfo() {
        return {
            replyText: "💳 **Supported Payment Methods at Angkor Shopping Mall**\n\n• **ABA PayWay & KHQR**: Instant payment via any Cambodian banking app (Bakong KHQR standard).\n• **Wing Bank / TrueMoney**: Fast digital wallet payments.\n• **Credit & Debit Cards**: Visa, MasterCard, UnionPay supported securely.\n• **Cash on Delivery (COD)**: Available for orders within Phnom Penh.\n• **Trade-In Credits**: Apply verified device valuation directly as an instant checkout discount!",
            actions: [
                { label: "Shop Now & Checkout", path: "/shop", icon: "ShoppingBag" },
                { label: "Trade-In Program", path: "/trading", icon: "Repeat" }
            ],
            suggestedPrompts: ["How does delivery work?", "What is the warranty policy?", "Show flash sales"]
        };
    }

    /**
     * Shipping & Delivery Info
     */
    handleShippingInfo() {
        return {
            replyText: "🚚 **Fast & Reliable Delivery Across Cambodia**\n\n• **Phnom Penh Express**: 1 - 2 Business Days (Same-day express dispatch available).\n• **Provincial Delivery**: 2 - 4 Business Days via reliable express courier network.\n• **Live Tracking**: Real-time status tracking available inside your order invoice.\n• **Free Shipping**: Available for selected promotional orders!",
            actions: [
                { label: "Track My Orders", path: "/orders", icon: "Package" },
                { label: "Browse Store", path: "/shop", icon: "ShoppingBag" }
            ],
            suggestedPrompts: ["Track my order", "Payment options", "Flash sales"]
        };
    }

    /**
     * Warranty & Returns Info
     */
    handleWarrantyInfo() {
        return {
            replyText: "🛡️ **Official Warranty & Return Guarantee**\n\n• **1-Year Official Warranty**: Guaranteed on all brand-new electronics, laptops, and smartphones.\n• **7-Day Hassle-Free Replacement**: For any factory or hardware defects.\n• **100% Genuine Products**: Sourced directly from official authorized distributors (Apple, Samsung, Asus, Sony, etc.).\n• **Technical Support**: In-house support technicians ready to assist.",
            actions: [
                { label: "Browse Official Brands", path: "/shop", icon: "ShoppingBag" },
                { label: "Customer Care", path: "/orders", icon: "HelpCircle" }
            ],
            suggestedPrompts: ["What are the store hours?", "Show top rated products", "Payment methods"]
        };
    }

    /**
     * Store Location & Contact Info
     */
    handleStoreInfo() {
        return {
            replyText: "🏢 **Angkor Shopping Mall Customer Care & Store Info**\n\n• **Main Store**: Phnom Penh, Kingdom of Cambodia\n• **Operating Hours**: Monday - Sunday (8:00 AM - 9:00 PM ICT)\n• **Hotline / Telegram**: +855 23 888 999\n• **Email**: support@angkorshoppingmall.com\n• **Live AI Support**: 24/7 Available right here in this chat!",
            actions: [
                { label: "Browse Catalog", path: "/shop", icon: "ShoppingBag" },
                { label: "Trade-In Center", path: "/trading", icon: "Repeat" }
            ],
            suggestedPrompts: ["Show flash sales", "Find iPhone accessories", "Track my order"]
        };
    }

    /**
     * Greetings Handler
     */
    handleGreeting() {
        return {
            replyText: "👋 **Hello! Welcome to Angkor Shopping Mall!**\n\nI'm your **Smart AI Shopping Assistant**. I can help you with:\n\n✨ Finding products & comparing specs\n🔥 Discovering live flash sales & discount deals\n📦 Tracking your order delivery in real time\n🔄 Evaluating devices for instant Trade-In discounts\n💳 Answering payment, shipping, and warranty questions\n\nWhat would you like to explore today?",
            actions: [
                { label: "⚡ Flash Sales", path: "/shop?flashSale=true", icon: "Flame" },
                { label: "🛍️ Browse Shop", path: "/shop", icon: "ShoppingBag" },
                { label: "🔄 Device Trade-In", path: "/trading", icon: "Repeat" },
                { label: "✨ AI Recommendations", path: "/recommendations", icon: "Sparkles" }
            ],
            suggestedPrompts: [
                "What are today's flash sales?",
                "Find smartphones under $500",
                "How does trade-in work?",
                "Track my order status"
            ]
        };
    }

    /**
     * Recommendations Handler
     */
    async handleRecommendations() {
        try {
            const products = await Product.findAll({
                where: { is_active: true },
                include: [
                    { model: Category, as: "category", attributes: ["name"] },
                    { model: Brand, as: "brand", attributes: ["name"] },
                    { model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] },
                    { model: ProductReview, as: "reviews", attributes: ["rating"] }
                ],
                order: [["created_at", "DESC"]],
                limit: 4
            });

            const formatted = products.map(p => this.formatProductCard(p));

            return {
                replyText: "✨ **Top Trending & AI Recommended Products**\n\nHere are handpicked top-rated products trending in Angkor Shopping Mall today:",
                products: formatted,
                actions: [
                    { label: "Full AI Recommendations", path: "/recommendations", icon: "Sparkles" },
                    { label: "Browse All Categories", path: "/shop", icon: "ShoppingBag" }
                ],
                suggestedPrompts: ["Show flash sales", "Find gaming laptops", "Trade-in old phone"]
            };
        } catch (error) {
            console.error("[ChatbotService] handleRecommendations error:", error.message);
            return {
                replyText: "✨ Check out our top curated picks on the recommendations page!",
                actions: [{ label: "View Recommendations", path: "/recommendations", icon: "Sparkles" }]
            };
        }
    }

    /**
     * Contextual Product Page Handler
     */
    async handleProductContext(productId, queryText) {
        try {
            const product = await Product.findOne({
                where: { id: productId },
                include: [
                    { model: Category, as: "category", attributes: ["name"] },
                    { model: Brand, as: "brand", attributes: ["name"] },
                    { model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] },
                    { model: ProductVariant, as: "variants" },
                    { model: ProductDetail, as: "detail" }
                ]
            });

            if (!product) return null;

            const card = this.formatProductCard(product);
            const stockStatus = (product.stock_quantity > 0) ? `In Stock (${product.stock_quantity} available)` : "Out of Stock";

            let reply = `📱 **${product.name}**\n\n• **Price**: $${parseFloat(product.price).toFixed(2)}\n• **Availability**: ${stockStatus}\n• **Brand**: ${product.brand?.name || "Official"}\n• **Category**: ${product.category?.name || "Electronics"}\n• **Warranty**: 1-Year Official Manufacturer Warranty\n• **Delivery**: 1-2 Days Express Delivery in Phnom Penh.`;

            if (product.variants && product.variants.length > 0) {
                const variantNames = product.variants.map(v => v.sku || `Variant #${v.price}`).slice(0, 3).join(", ");
                reply += `\n• **Available Options**: ${variantNames}`;
            }

            return {
                replyText: reply,
                products: [card],
                actions: [
                    { label: "View Full Specs", path: `/product/${product.id}`, icon: "ShoppingBag" },
                    { label: "Explore Similar Items", path: "/shop", icon: "Sparkles" }
                ]
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Smart Product Search Handler
     */
    async handleProductSearch(queryText) {
        const text = queryText.toLowerCase();

        // 1. Extract Price Constraints
        let maxPrice = null;
        let minPrice = null;

        const underMatch = text.match(/(?:under|below|less than|<\s*)\s*\$?(\d+(?:\.\d+)?)/i);
        if (underMatch) {
            maxPrice = parseFloat(underMatch[1]);
        }

        const aboveMatch = text.match(/(?:above|more than|over|>\s*)\s*\$?(\d+(?:\.\d+)?)/i);
        if (aboveMatch) {
            minPrice = parseFloat(aboveMatch[1]);
        }

        const betweenMatch = text.match(/(?:between)\s*\$?(\d+)\s*(?:and|to|-)\s*\$?(\d+)/i);
        if (betweenMatch) {
            minPrice = parseFloat(betweenMatch[1]);
            maxPrice = parseFloat(betweenMatch[2]);
        }

        // Clean query terms for search
        const cleanedQuery = queryText
            .replace(/(?:under|below|less than|above|over|between|and|to|find|show|me|search|look for|buy|want|recommend|best|cheap|\$|\d+)/gi, " ")
            .trim();

        const searchKeywords = cleanedQuery.split(/\s+/).filter(k => k.length > 1);

        const where = { is_active: true };

        if (maxPrice !== null && minPrice !== null) {
            where.price = { [Op.between]: [minPrice, maxPrice] };
        } else if (maxPrice !== null) {
            where.price = { [Op.lte]: maxPrice };
        } else if (minPrice !== null) {
            where.price = { [Op.gte]: minPrice };
        }

        if (searchKeywords.length > 0) {
            const orConditions = [];
            for (const kw of searchKeywords) {
                orConditions.push({ name: { [Op.iLike]: `%${kw}%` } });
                orConditions.push({ description: { [Op.iLike]: `%${kw}%` } });
            }
            where[Op.or] = orConditions;
        }

        try {
            let products = await Product.findAll({
                where,
                include: [
                    { model: Category, as: "category", attributes: ["name"] },
                    { model: Brand, as: "brand", attributes: ["name"] },
                    { model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] },
                    { model: ProductReview, as: "reviews", attributes: ["rating"] }
                ],
                order: [["created_at", "DESC"]],
                limit: 5
            });

            // If no exact match with full keywords, try fuzzy match on category/brand names
            if (products.length === 0 && searchKeywords.length > 0) {
                products = await Product.findAll({
                    where: { is_active: true },
                    include: [
                        {
                            model: Category,
                            as: "category",
                            attributes: ["name"],
                            where: {
                                name: { [Op.iLike]: `%${searchKeywords[0]}%` }
                            },
                            required: false
                        },
                        {
                            model: Brand,
                            as: "brand",
                            attributes: ["name"],
                            where: {
                                name: { [Op.iLike]: `%${searchKeywords[0]}%` }
                            },
                            required: false
                        },
                        { model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] }
                    ],
                    limit: 4
                });
            }

            // Fallback: If still empty, return top popular products
            if (products.length === 0) {
                const popularProducts = await Product.findAll({
                    where: { is_active: true },
                    include: [
                        { model: Category, as: "category", attributes: ["name"] },
                        { model: Brand, as: "brand", attributes: ["name"] },
                        { model: ProductImage, as: "images", attributes: ["image_url", "is_primary"] }
                    ],
                    order: [["created_at", "DESC"]],
                    limit: 4
                });

                const formatted = popularProducts.map(p => this.formatProductCard(p));

                return {
                    replyText: `🔍 I couldn't find exact matches for "${queryText}". However, here are some of our best-selling featured products you might like:`,
                    products: formatted,
                    actions: [
                        { label: "Browse All in Shop", path: `/shop?search=${encodeURIComponent(queryText)}`, icon: "ShoppingBag" },
                        { label: "Flash Sales", path: "/shop?flashSale=true", icon: "Flame" }
                    ],
                    suggestedPrompts: ["Show flash sales", "Find phones under $500", "How does trade-in work?"]
                };
            }

            const formatted = products.map(p => this.formatProductCard(p));
            const countStr = products.length;

            return {
                replyText: `🔍 Found **${countStr}** matching item${countStr > 1 ? "s" : ""} for your search:\n\nTap any item below to view full specifications or add directly to your cart!`,
                products: formatted,
                actions: [
                    { label: `View all results in Shop`, path: `/shop?search=${encodeURIComponent(cleanedQuery || queryText)}`, icon: "ShoppingBag" },
                    { label: "Trade-In Device", path: "/trading", icon: "Repeat" }
                ],
                suggestedPrompts: [
                    "What payment methods do you accept?",
                    "How does shipping work?",
                    "Show flash sales"
                ]
            };
        } catch (error) {
            console.error("[ChatbotService] handleProductSearch error:", error.message);
            return {
                replyText: `I can help you find smartphones, laptops, trade-ins, and deals at Angkor Shopping Mall. What are you looking for?`,
                actions: [
                    { label: "Explore Shop", path: "/shop", icon: "ShoppingBag" },
                    { label: "Trade-In", path: "/trading", icon: "Repeat" }
                ]
            };
        }
    }

    /**
     * Dynamic Quick Prompts Provider
     */
    async getQuickPrompts() {
        return [
            { label: "⚡ Flash Sales", query: "What are today's flash sales and deals?" },
            { label: "📱 Phones under $500", query: "Show me smartphones under $500" },
            { label: "💻 Laptops & PC", query: "Find top performance laptops" },
            { label: "🔄 Device Trade-In", query: "How does device trade-in work?" },
            { label: "📦 Track Order", query: "Where is my order?" },
            { label: "💳 Payment Methods", query: "What payment methods are supported?" }
        ];
    }

    /**
     * Formatter helpers
     */
    formatProductCard(product) {
        const primaryImg = product.images?.find(img => img.is_primary)?.image_url || product.images?.[0]?.image_url || null;
        let avgRating = 5;
        if (product.reviews && product.reviews.length > 0) {
            const sum = product.reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
            avgRating = parseFloat((sum / product.reviews.length).toFixed(1));
        }

        return {
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            original_price: parseFloat(product.price),
            discount_percentage: 0,
            image_url: primaryImg,
            category_name: product.category?.name || "Electronics",
            brand_name: product.brand?.name || "Brand",
            in_stock: (product.stock_quantity > 0),
            rating: avgRating
        };
    }

    formatOrderCard(order) {
        const firstItem = order.items?.[0];
        const primaryImg = firstItem?.product?.images?.find(img => img.is_primary)?.image_url || firstItem?.product?.images?.[0]?.image_url || null;

        return {
            id: order.id,
            short_id: order.id.slice(0, 8),
            status: order.status,
            total_amount: parseFloat(order.total_amount).toFixed(2),
            item_count: order.items?.length || 1,
            first_product_name: firstItem?.product?.name || "Order Item",
            image_url: primaryImg,
            created_at: order.created_at || order.createdAt,
            shipping_address: order.shipping_address,
            contact_phone: order.contact_phone
        };
    }
}

module.exports = new ChatbotService();
