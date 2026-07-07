const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});


bot.on("polling_error", (error) => {
    console.log("Telegram polling error:", error.message);
});


bot.onText(/\/start/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,
        "👋 Welcome!\n\nPlease share your phone number to link your account.",
        {
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

});


function normalizePhone(phone) {

    if (!phone) return null;

    phone = phone
        .replace(/\s+/g, "")
        .replace(/-/g, "");


    // Telegram sometimes sends 855xxxxxxxx without +
    if (phone.startsWith("855")) {
        phone = "+" + phone;
    }


    return phone;
}



bot.on("contact", async (msg) => {

    try {

        const chatId = msg.chat.id;

        let phone = normalizePhone(
            msg.contact.phone_number
        );


        console.log("Telegram phone:", phone);


        const user = await User.findOne({
            where: {
                phone: phone
            }
        });


        if (!user) {

            return bot.sendMessage(
                chatId,
                `❌ No account found for ${phone}`
            );

        }


        await user.update({
            telegram_chat_id: chatId
        });


        await bot.sendMessage(
            chatId,
            "✅ Telegram linked successfully!\n\nYou can now receive password reset OTPs here."
        );


    } catch (error) {

        console.error(
            "Telegram contact error:",
            error
        );


        await bot.sendMessage(
            msg.chat.id,
            "❌ Failed to link your account."
        );

    }

});


module.exports = {
    bot
};