const { bot } = require("../config/telegram");

async function sendOtp(chatId, otp) {
    return await bot.sendMessage(
        chatId,
`🔐 PASSWORD RESET OTP

Your OTP: ${otp}

⏰ Valid for 5 minutes`
    );
}

module.exports = {
    sendOtp
};