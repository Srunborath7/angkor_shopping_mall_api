const TelegramBot = require("node-telegram-bot-api");
const User = require("../models/userModel");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(process.env.BOT_TOKEN);

// ================================
// /start
// ================================
bot.onText(/\/start/, async (msg) => {
    try {
        console.log("🔥 /start received");
        console.log("Chat ID:", msg.chat.id);

        await bot.sendMessage(
            msg.chat.id,
            `🛒 <b>Angkor Shopping Mall</b>

━━━━━━━━━━━━━━
🔐 Telegram Account Linking
━━━━━━━━━━━━━━

Welcome 👋

To secure your account, please share your phone number.

Benefits:
✅ Receive password reset OTP
✅ Account verification
✅ Secure login`,
            {
                parse_mode: "HTML",
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

    } catch (error) {
        console.error("❌ /start error:", error);
    }
});


// ================================
// Contact handler
// ================================
bot.on("contact", async (msg) => {
    try {
        console.log("Telegram contact received");

        const telegramPhone = normalizePhone(
            msg.contact.phone_number
        );

        console.log("Normalized phone:", telegramPhone);

        const user = await User.findOne({
            where: {
                phone: telegramPhone
            }
        });

        if (!user) {
            return bot.sendMessage(
                msg.chat.id,
                `❌ No account found for ${telegramPhone}`,
                {
                    reply_markup: {
                        remove_keyboard: true
                    }
                }
            );
        }

        await User.update(
            {
                telegram_chat_id: String(msg.chat.id)
            },
            {
                where: {
                    id: user.id
                }
            }
        );

        await bot.sendMessage(
            msg.chat.id,
            `✅ Telegram linked successfully!

You can now receive password reset OTPs here.`,
            {
                reply_markup: {
                    remove_keyboard: true
                }
            }
        );

    } catch (error) {
        console.error("Telegram contact error:", error);
    }
});


// ================================
// Webhook receiver
// ================================
const handleTelegramWebhook = async (req, res) => {
    try {

        console.log("=================================");
        console.log("🔥 TELEGRAM WEBHOOK RECEIVED");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("=================================");

        bot.processUpdate(req.body);

        res.sendStatus(200);

    } catch (error) {

        console.error(
            "❌ Telegram webhook error:",
            error
        );

        res.sendStatus(500);
    }
};


// ================================
// Set webhook
// ================================
const setupWebhook = async () => {
    try {
        const url = `${process.env.APP_URL}/telegram/webhook`;

        console.log("Setting Telegram webhook:", url);

        await bot.setWebHook(url);

        console.log("Telegram webhook successfully set:", url);

    } catch (error) {
        console.error(
            "Telegram webhook setup error:",
            error
        );
    }
};


module.exports = {
    bot,
    setupWebhook,
    handleTelegramWebhook
};