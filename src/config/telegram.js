const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true,
});

bot.onText(/\/start/, async (msg) => {
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
                            request_contact: true,
                        },
                    ],
                ],
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        }
    );
});

bot.on("contact", async (msg) => {
    try {
        const telegramPhone = normalizePhone(msg.contact.phone_number);

        const user = await User.findOne({
            where: {
                phone: telegramPhone,
            },
        });

        if (!user) {
            return bot.sendMessage(
                msg.chat.id,
                `❌ No account found for ${telegramPhone}`,
                {
                    reply_markup: {
                        remove_keyboard: true,
                    },
                }
            );
        }

        await User.update(
            {
                // Save as string
                telegram_chat_id: String(msg.chat.id),
            },
            {
                where: {
                    id: user.id,
                },
            }
        );

        await bot.sendMessage(
            msg.chat.id,
            "✅ Telegram linked successfully!\n\nYou can now receive password reset OTPs here.",
            {
                reply_markup: {
                    remove_keyboard: true,
                },
            }
        );
    } catch (error) {
        console.error(error);
    }
});

module.exports = {
    bot,
};