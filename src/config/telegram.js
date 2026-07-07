const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
    polling: true
});

const linkMap = {};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome");
});

module.exports = {
    bot,
    linkMap
};