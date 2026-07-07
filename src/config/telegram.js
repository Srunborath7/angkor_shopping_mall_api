
const User = require("../models/userModel");
const TelegramBot = require("node-telegram-bot-api");
const normalizePhone = require("../utils/phone");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});

bot.onText(/\/start/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,
        `👋 Welcome to Angkor Shopping Mall

Please share your phone number to link your account.`,
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


bot.on("contact", async (msg)=>{

    try {

        const telegramPhone =
            normalizePhone(
                msg.contact.phone_number
            );


        console.log(
            "Telegram Phone:",
            telegramPhone
        );


        const user = await User.findOne({
            where:{
                phone: telegramPhone
            }
        });



        if(!user){

            return bot.sendMessage(
                msg.chat.id,
                `❌ No account found for ${telegramPhone}

Please register first.`
            );

        }



        // save telegram id

        await User.update(
            {
                telegram_chat_id:
                    msg.chat.id
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


    } catch(error){

        console.log(error);

        bot.sendMessage(
            msg.chat.id,
            "❌ Something went wrong."
        );

    }

});


module.exports = {
    bot
};