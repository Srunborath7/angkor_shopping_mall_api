
const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        "Welcome!\n\nPlease share your phone number to link your account.",
        {
            reply_markup: {
                keyboard: [[
                    {
                        text: "📱 Share Phone Number",
                        request_contact: true
                    }
                ]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
    );
});

bot.on("contact", async (msg) => {
    try {
        const chatId = msg.chat.id;

        let phone = msg.contact.phone_number;

        // Normalize phone number
        phone = phone
            .replace(/\s+/g, "")
            .replace(/-/g, "");

        // Add + if Telegram removes it
        if (phone.startsWith("855")) {
            phone = "+" + phone;
        }


        const user = await User.findOne({
            where: { phone }
        });


        if (!user) {
            return bot.sendMessage(
                chatId,
                `❌ No account found for ${phone}.`
            );
        }


        await user.update({
            telegram_chat_id: chatId
        });


        await bot.sendMessage(
            chatId,
            "✅ Telegram linked successfully!\n\nYou can now receive password reset OTPs here."
        );

    } catch (err) {

        console.error("Telegram contact error:", err);

        await bot.sendMessage(
            msg.chat.id,
            "❌ Failed to link your account."
        );
    }
});

module.exports = {
    bot
};