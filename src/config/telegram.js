const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(
    process.env.BOT_TOKEN
);


// Start command
bot.onText(/\/start/, async (msg) => {

    try {

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
✅ Secure login
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


    } catch(error){

        console.log(
            "Telegram start error:",
            error.message
        );

    }

});




// Contact handler

bot.on("contact", async (msg)=>{

    try {

        const telegramPhone =
            normalizePhone(
                msg.contact.phone_number
            );


        const user = await User.findOne({

            where:{
                phone: telegramPhone
            }

        });



        if(!user){

            return bot.sendMessage(
                msg.chat.id,

                `❌ No account found for ${telegramPhone}`,

                {
                    reply_markup:{
                        remove_keyboard:true
                    }
                }
            );

        }



        await User.update(

            {

                telegram_chat_id:
                    String(msg.chat.id)

            },

            {

                where:{
                    id:user.id
                }

            }

        );



        await bot.sendMessage(

            msg.chat.id,

            `✅ Telegram linked successfully!

You can now receive password reset OTPs here.`,

            {
                reply_markup:{
                    remove_keyboard:true
                }
            }

        );



    }catch(error){

        console.log(
            "Telegram contact error:",
            error.message
        );

    }


});





// Webhook receiver

const handleTelegramWebhook = async (req,res)=>{

    try {

        bot.processUpdate(req.body);

        res.sendStatus(200);


    }catch(error){

        console.log(
            "Webhook error:",
            error.message
        );

        res.sendStatus(500);

    }

};





// Set webhook

const setupWebhook = async ()=>{

    try {

        const url =
            `${process.env.APP_URL}/telegram/webhook`;


        await bot.setWebHook(url);


        console.log(
            "Telegram webhook:",
            url
        );


    }catch(error){

        console.log(
            "Webhook setup error:",
            error.message
        );

    }

};




module.exports = {

    bot,
    setupWebhook,
    handleTelegramWebhook

};