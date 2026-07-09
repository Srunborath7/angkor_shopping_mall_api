const TelegramBot = require("node-telegram-bot-api");
const { User, Product, Category, Brand, CartItem, Order, OrderItem } = require("../models/relationships");
const recommendationService = require("../services/recommendationService");
const paymentService = require("../services/paymentService");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});

// Checkout state tracker
const checkoutState = {};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await User.findOne({ where: { telegram_chat_id: chatId } });

    if (user) {
        await bot.sendMessage(
            chatId,
            `🛒 *Angkor Shopping Mall*
━━━━━━━━━━━━━━
Welcome back, *${user.name}*! 👋

You are linked and ready to shop! Use the menu below or type commands to start:
• /catalog - Browse products
• /cart - View shopping cart
• /orders - View order history
• /recommend - Personalised AI recommendations
• /help - Display instructions`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ["📦 Browse Catalog", "🛒 View Cart"],
                        ["📑 My Orders", "🤖 AI Recommendations"],
                        ["⚙️ Help"]
                    ],
                    resize_keyboard: true
                }
            }
        );
    } else {
        await bot.sendMessage(
            chatId,
            `🛒 *Angkor Shopping Mall*
━━━━━━━━━━━━━━
🔒 *Telegram Account Linking*
━━━━━━━━━━━━━━

Welcome! To access the shop, browse products, and checkout, please secure your account by linking your phone number.

Please tap the button below to share your phone number.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: "📱 Share Phone Number",
                                request_contact: true
                            }
                        ]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            }
        );
    }
});

bot.on("contact", async (msg) => {
    const chatId = msg.chat.id;
    try {
        const telegramPhone = normalizePhone(msg.contact.phone_number);
        const user = await User.findOne({ where: { phone: telegramPhone } });

        if (!user) {
            return bot.sendMessage(
                chatId,
                `❌ No account found in our system for phone number: ${telegramPhone}.\n\nPlease register on our application first, then return here to link.`,
                {
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
        }

        await User.update(
            { telegram_chat_id: chatId },
            { where: { id: user.id } }
        );

        await bot.sendMessage(
            chatId,
            `✅ *Account Linked Successfully!*\n\nWelcome, *${user.name}*! 🛍️\nYou can now browse our catalog, manage your cart, and place orders directly from Telegram.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ["📦 Browse Catalog", "🛒 View Cart"],
                        ["📑 My Orders", "🤖 AI Recommendations"],
                        ["⚙️ Help"]
                    ],
                    resize_keyboard: true
                }
            }
        );

    } catch (error) {
        console.error("Telegram contact link error:", error);
        await bot.sendMessage(chatId, "⚠️ An error occurred during account linking. Please try again later.");
    }
});

// Router for text messages / buttons
bot.on("message", async (msg) => {
    if (msg.text && msg.text.startsWith("/")) return; // handled by command listeners
    if (msg.contact) return; // handled by contact listener

    const chatId = msg.chat.id;

    // Check if user is in checkout flow
    if (checkoutState[chatId]?.step === 'awaiting_address') {
        return await handleCheckoutAddress(msg);
    }

    const text = msg.text;
    const user = await User.findOne({ where: { telegram_chat_id: chatId } });

    if (!user) {
        return bot.sendMessage(
            chatId,
            "🔒 Please link your account first to access e-commerce features. Run /start to begin."
        );
    }

    switch (text) {
        case "📦 Browse Catalog":
            await sendCatalogCategories(chatId);
            break;
        case "🛒 View Cart":
            await sendCart(chatId, user.id);
            break;
        case "📑 My Orders":
            await sendOrders(chatId, user.id);
            break;
        case "🤖 AI Recommendations":
            await sendRecommendations(chatId, user.id);
            break;
        case "⚙️ Help":
            await sendHelp(chatId);
            break;
    }
});

// Command listeners
bot.onText(/\/help/, async (msg) => {
    await sendHelp(msg.chat.id);
});

bot.onText(/\/catalog/, async (msg) => {
    const user = await User.findOne({ where: { telegram_chat_id: msg.chat.id } });
    if (!user) return promptLinking(msg.chat.id);
    await sendCatalogCategories(msg.chat.id);
});

bot.onText(/\/cart/, async (msg) => {
    const user = await User.findOne({ where: { telegram_chat_id: msg.chat.id } });
    if (!user) return promptLinking(msg.chat.id);
    await sendCart(msg.chat.id, user.id);
});

bot.onText(/\/checkout/, async (msg) => {
    const user = await User.findOne({ where: { telegram_chat_id: msg.chat.id } });
    if (!user) return promptLinking(msg.chat.id);
    await startCheckout(msg.chat.id, user.id);
});

bot.onText(/\/orders/, async (msg) => {
    const user = await User.findOne({ where: { telegram_chat_id: msg.chat.id } });
    if (!user) return promptLinking(msg.chat.id);
    await sendOrders(msg.chat.id, user.id);
});

bot.onText(/\/recommend/, async (msg) => {
    const user = await User.findOne({ where: { telegram_chat_id: msg.chat.id } });
    if (!user) return promptLinking(msg.chat.id);
    await sendRecommendations(msg.chat.id, user.id);
});

// Callback queries handler
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    const user = await User.findOne({ where: { telegram_chat_id: chatId } });
    if (!user) {
        await bot.answerCallbackQuery(query.id, { text: "🔒 Please link your account first." });
        return;
    }

    try {
        if (data.startsWith("CAT_VIEW_")) {
            // Format: CAT_VIEW_<index>_<category_id>
            const parts = data.split("_");
            const index = parseInt(parts[2]);
            const categoryId = parts[3];
            await sendProductCarousel(chatId, messageId, index, categoryId);
            await bot.answerCallbackQuery(query.id);

        } else if (data === "CAT_RESET") {
            await editMessageToCategories(chatId, messageId);
            await bot.answerCallbackQuery(query.id);

        } else if (data.startsWith("ADD_CART_")) {
            // Format: ADD_CART_<productId>_<currentIndex>_<categoryId>
            const parts = data.split("_");
            const productId = parts[2];
            const currentIndex = parseInt(parts[3]);
            const categoryId = parts[4];

            const product = await Product.findByPk(productId);
            if (!product || product.stock_quantity <= 0) {
                await bot.answerCallbackQuery(query.id, { text: "❌ Out of stock!", show_alert: true });
                return;
            }

            // Add to cart database
            let cartItem = await CartItem.findOne({ where: { user_id: user.id, product_id: productId } });
            if (cartItem) {
                cartItem.quantity += 1;
                await cartItem.save();
            } else {
                await CartItem.create({ user_id: user.id, product_id: productId, quantity: 1 });
            }

            await bot.answerCallbackQuery(query.id, { text: "🛒 Added to cart successfully!" });

        } else if (data === "VIEW_CART") {
            await sendCart(chatId, user.id);
            await bot.answerCallbackQuery(query.id);

        } else if (data === "CLEAR_CART") {
            await CartItem.destroy({ where: { user_id: user.id } });
            await bot.answerCallbackQuery(query.id, { text: "🧹 Cart cleared!" });
            await bot.editMessageText("🛒 *Your Shopping Cart*\n\nYour cart is empty.", {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });

        } else if (data === "PROCEED_CHECKOUT") {
            await bot.answerCallbackQuery(query.id);
            await startCheckout(chatId, user.id);
        }

    } catch (err) {
        console.error("Callback query error:", err);
        await bot.answerCallbackQuery(query.id, { text: "⚠️ Error processing request." });
    }
});

// Helper: Prompt user to link account
async function promptLinking(chatId) {
    await bot.sendMessage(chatId, "🔒 Please link your account first to access this command. Run /start to share your contact details.");
}

// Helper: Send help instructions
async function sendHelp(chatId) {
    const text = `ℹ️ *Angkor Shopping Mall Bot Instructions*

Here is how you can use this bot:
• Use the buttons at the bottom to quickly browse catalog, check cart, view order history, or request AI recommendations.
• Send */catalog* to view category filter options.
• Send */cart* to check items added.
• Send */checkout* to place a new order.
• Send */orders* to see list of previous purchases and payment status.
• Send */recommend* to get AI-powered product recommendations!`;

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// Helper: Send category selector
async function sendCatalogCategories(chatId) {
    const categories = await Category.findAll();
    
    const inline_keyboard = categories.map(cat => [
        { text: `📁 ${cat.name}`, callback_data: `CAT_VIEW_0_${cat.id}` }
    ]);
    
    inline_keyboard.push([
        { text: "🌐 View All Products", callback_data: "CAT_VIEW_0_all" }
    ]);

    await bot.sendMessage(chatId, "📁 *Angkor Mall Catalog*\nSelect a category to browse active items:", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard
        }
    });
}

// Helper: Edit message back to categories
async function editMessageToCategories(chatId, messageId) {
    const categories = await Category.findAll();
    
    const inline_keyboard = categories.map(cat => [
        { text: `📁 ${cat.name}`, callback_data: `CAT_VIEW_0_${cat.id}` }
    ]);
    
    inline_keyboard.push([
        { text: "🌐 View All Products", callback_data: "CAT_VIEW_0_all" }
    ]);

    await bot.editMessageText("📁 *Angkor Mall Catalog*\nSelect a category to browse active items:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard
        }
    });
}

// Helper: Product Carousel
async function sendProductCarousel(chatId, messageId, index, categoryId) {
    const queryOpts = {
        where: { is_active: true },
        include: [{ model: Brand, as: 'brand' }, { model: Category, as: 'category' }],
        order: [['created_at', 'DESC']]
    };

    if (categoryId !== 'all') {
        queryOpts.where.category_id = categoryId;
    }

    const products = await Product.findAll(queryOpts);

    if (products.length === 0) {
        return bot.editMessageText("😔 No products found in this category.", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: "🔙 Back to Categories", callback_data: "CAT_RESET" }]]
            }
        });
    }

    const product = products[index];
    const imagePrefix = product.image_url ? `[\u200B](${product.image_url})` : '';
    const brandName = product.brand?.name || 'Generic';
    const categoryName = product.category?.name || 'Uncategorized';

    const text = `${imagePrefix}🛍️ *${product.name}*
━━━━━━━━━━━━━━
💰 *Price:* $${product.price}
📦 *Stock:* ${product.stock_quantity}
🏷️ *Brand:* ${brandName}
📁 *Category:* ${categoryName}

*Description:*
${product.description || 'No description available.'}`;

    const navigationRow = [];
    if (index > 0) {
        navigationRow.push({ text: "⬅️ Prev", callback_data: `CAT_VIEW_${index - 1}_${categoryId}` });
    }
    if (index < products.length - 1) {
        navigationRow.push({ text: "Next ➡️", callback_data: `CAT_VIEW_${index + 1}_${categoryId}` });
    }

    const inline_keyboard = [
        [{ text: "🛒 Add to Cart", callback_data: `ADD_CART_${product.id}_${index}_${categoryId}` }],
        navigationRow,
        [{ text: "🔙 Back to Categories", callback_data: "CAT_RESET" }]
    ];

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
    });
}

// Helper: Send Cart Items
async function sendCart(chatId, userId) {
    const items = await CartItem.findAll({
        where: { user_id: userId },
        include: [{ model: Product, as: 'product' }]
    });

    if (items.length === 0) {
        return bot.sendMessage(chatId, "🛒 *Your Shopping Cart*\n\nYour cart is empty. Go browse catalog to find something you like!", { parse_mode: 'Markdown' });
    }

    let text = `🛒 *Your Shopping Cart*\n━━━━━━━━━━━━━━\n`;
    let subtotal = 0;

    items.forEach((item, i) => {
        const itemTotal = parseFloat(item.product?.price || 0) * item.quantity;
        subtotal += itemTotal;
        text += `${i + 1}. *${item.product?.name}*\n    Qty: ${item.quantity} × $${item.product?.price} = *$${itemTotal.toFixed(2)}*\n\n`;
    });

    text += `━━━━━━━━━━━━━━\n💰 *Total Amount:* *$${subtotal.toFixed(2)}*`;

    await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "💳 Proceed to Checkout", callback_data: "PROCEED_CHECKOUT" },
                    { text: "🧹 Clear", callback_data: "CLEAR_CART" }
                ],
                [{ text: "📦 Continue Shopping", callback_data: "CAT_RESET" }]
            ]
        }
    });
}

// Helper: Start Checkout Flow
async function startCheckout(chatId, userId) {
    const cartItems = await CartItem.findAll({ where: { user_id: userId } });
    if (cartItems.length === 0) {
        return bot.sendMessage(chatId, "❌ Cannot checkout: Your cart is empty.");
    }

    checkoutState[chatId] = {
        step: 'awaiting_address',
        userId
    };

    await bot.sendMessage(chatId, "📍 *Checkout Process*\n\nPlease enter and send your *Shipping Address* below:", {
        parse_mode: 'Markdown',
        reply_markup: {
            remove_keyboard: true
        }
    });
}

// Helper: Handle address entry
async function handleCheckoutAddress(msg) {
    const chatId = msg.chat.id;
    const address = msg.text;
    const state = checkoutState[chatId];

    if (!address) {
        return bot.sendMessage(chatId, "⚠️ Please send a valid text address.");
    }

    try {
        const userId = state.userId;
        const user = await User.findByPk(userId);

        const cartItems = await CartItem.findAll({
            where: { user_id: userId },
            include: [{ model: Product, as: 'product' }]
        });

        if (cartItems.length === 0) {
            delete checkoutState[chatId];
            return bot.sendMessage(chatId, "❌ Cart was empty when processing checkout.");
        }

        // Validate stock and calculate total
        let totalAmount = 0;
        for (const item of cartItems) {
            if (item.product.stock_quantity < item.quantity) {
                delete checkoutState[chatId];
                return bot.sendMessage(chatId, `❌ Insufficient stock for ${item.product.name}. Available: ${item.product.stock_quantity}`);
            }
            totalAmount += parseFloat(item.product.price) * item.quantity;
        }

        // Create Order record
        const order = await Order.create({
            user_id: userId,
            total_amount: totalAmount,
            status: 'pending',
            shipping_address: address,
            contact_phone: user.phone
        });

        // Create Order Items and decrease stock
        for (const item of cartItems) {
            await OrderItem.create({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                price: item.product.price
            });

            await Product.decrement('stock_quantity', {
                by: item.quantity,
                where: { id: item.product_id }
            });
        }

        // Clear cart
        await CartItem.destroy({ where: { user_id: userId } });

        // Generate Simulated checkout page URL
        // We'll construct a request-like object for the service
        const mockReq = {
            get: () => process.env.BASE_URL || `localhost:${process.env.PORT || 3000}`,
            secure: false
        };
        const paymentDetails = await paymentService.createCheckoutSession(order, mockReq);

        delete checkoutState[chatId];

        // Send confirmation with Web Link button
        await bot.sendMessage(
            chatId,
            `📦 *Order Created Successfully!*
━━━━━━━━━━━━━━
🆔 *Order ID:* \`${order.id}\`
💰 *Total Amount:* *$${totalAmount.toFixed(2)}*
📍 *Delivery To:* ${address}
━━━━━━━━━━━━━━

Please click the button below to secure your payment transaction.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💳 Pay with Angkor Pay", url: paymentDetails.payment_url }]
                    ],
                    keyboard: [
                        ["📦 Browse Catalog", "🛒 View Cart"],
                        ["📑 My Orders", "🤖 AI Recommendations"],
                        ["⚙️ Help"]
                    ],
                    resize_keyboard: true
                }
            }
        );

    } catch (err) {
        console.error("Checkout address parsing error:", err);
        delete checkoutState[chatId];
        await bot.sendMessage(chatId, "⚠️ Checkout failed due to server error. Please try again.");
    }
}

// Helper: Send historical orders
async function sendOrders(chatId, userId) {
    const orders = await Order.findAll({
        where: { user_id: userId },
        limit: 5,
        order: [['created_at', 'DESC']]
    });

    if (orders.length === 0) {
        return bot.sendMessage(chatId, "📑 *Order History*\n\nYou have not placed any orders yet.");
    }

    let text = `📑 *Recent Orders (Last 5)*\n━━━━━━━━━━━━━━\n`;
    orders.forEach((order, index) => {
        const dateStr = new Date(order.created_at).toLocaleDateString();
        const statusEmoji = order.status === 'paid' ? '✅ Paid' : '⏳ Pending';
        text += `${index + 1}. *Order ID:* \`${order.id}\`
    📅 Date: ${dateStr}
    💰 Amount: *$${order.total_amount}*
    ⚡ Status: ${statusEmoji}\n\n`;
    });

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// Helper: Send AI recommendations
async function sendRecommendations(chatId, userId) {
    const loadingMsg = await bot.sendMessage(chatId, "🤖 *Consulting AI Recommendation Engine...* Please wait.", { parse_mode: 'Markdown' });

    try {
        const recs = await recommendationService.getRecommendations(userId);

        // Delete the loading message
        await bot.deleteMessage(chatId, loadingMsg.message_id);

        if (recs.length === 0) {
            return bot.sendMessage(chatId, "🤖 *AI Recommendations*\n\nWe couldn't generate recommendations yet. Shop more to train the AI!");
        }

        await bot.sendMessage(chatId, "🤖 *AI Personalized Recommendations* \nHere are products chosen specifically for you by Angkor AI:", { parse_mode: 'Markdown' });

        for (const item of recs) {
            const product = item.product;
            const imagePrefix = product.image_url ? `[\u200B](${product.image_url})` : '';
            const productText = `${imagePrefix}🛍️ *${product.name}*
💰 *Price:* $${product.price}
📖 *AI Reason:* _${item.reason}_`;

            await bot.sendMessage(chatId, productText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🛒 Add to Cart", callback_data: `ADD_CART_${product.id}_0_rec` }
                        ]
                    ]
                }
            });
        }

    } catch (err) {
        console.error("Telegram recommendations failure:", err);
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        await bot.sendMessage(chatId, "⚠️ Could not retrieve AI recommendations at this time.");
    }
}

module.exports = {
    bot
};