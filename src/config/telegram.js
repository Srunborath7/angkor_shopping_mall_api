const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});


// ==============================
// START COMMAND
// ==============================

bot.onText(/\/start/, async (msg) => {

    try {

        await bot.sendMessage(
            msg.chat.id,
            `
🛒 <b>Angkor Shopping Mall</b>

━━━━━━━━━━━━━━━
🔐 Account Security
━━━━━━━━━━━━━━━

Welcome! 👋

To connect your Telegram account,
please share your phone number.

Your phone will only be used for:
✅ Account verification
✅ Password reset OTP
`,
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

        console.log(error);

    }

});



// ==============================
// RECEIVE CONTACT
// ==============================

bot.on("contact", async (msg) => {

    const chatId = msg.chat.id;


    try {


        const telegramPhone = normalizePhone(
            msg.contact.phone_number
        );


        console.log(
            "Telegram Phone:",
            telegramPhone
        );


        // Loading animation

        const loading = await bot.sendMessage(
            chatId,
            `
⏳ <b>Checking your account...</b>

🔍 Searching phone number
`,
            {
                parse_mode: "HTML",
                reply_markup: {
                    remove_keyboard: true
                }
            }
        );



        const user = await User.findOne({
            where: {
                phone: telegramPhone
            }
        });



        if (!user) {

            await bot.editMessageText(
                `
❌ <b>Account Not Found</b>

Phone:
<code>${telegramPhone}</code>

Please register first.
`,
                {
                    chat_id: chatId,
                    message_id:
                        loading.message_id,
                    parse_mode: "HTML"
                }
            );


            return;
        }



        // Update telegram id

        await User.update(
            {
                telegram_chat_id: chatId
            },
            {
                where: {
                    id: user.id
                }
            }
        );



        // Update loading message

        await bot.editMessageText(
            `
🔄 <b>Linking Telegram...</b>

Please wait...
`,
            {
                chat_id: chatId,
                message_id:
                    loading.message_id,
                parse_mode: "HTML"
            }
        );



        await new Promise(
            resolve => setTimeout(resolve, 1000)
        );



        // Success

        await bot.sendMessage(
            chatId,
            `
🎉 <b>Telegram Linked Successfully!</b>

━━━━━━━━━━━━━━━

👤 Account:
<b>${user.name}</b>

📱 Phone:
<code>${telegramPhone}</code>

━━━━━━━━━━━━━━━

✅ You can now receive:
• Password reset OTP
• Account verification codes

🔒 Your account is protected.
`,
            {
                parse_mode: "HTML",
                reply_markup: {
                    remove_keyboard: true
                }
            }
        );


    } catch (error) {

        console.log(
            "Telegram Error:",
            error
        );


        await bot.sendMessage(
            chatId,
            `
⚠️ Something went wrong.

Please try again later.
`
        );

    }

});



module.exports = {
    bot
};