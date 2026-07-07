const crypto = require("crypto");

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(otp) {
    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");
}

function verifyOTP(inputOTP, storedHash) {
    const hashedInput = hashOTP(inputOTP);
    return hashedInput === storedHash;
}


function isOTPExpired(expireTime) {
    return new Date() > new Date(expireTime);
}

function createOTPWithExpiry(minutes = 5) {

    const otp = generateOTP();

    const hashedOTP = hashOTP(otp);

    const expireAt = new Date(Date.now() + minutes * 60 * 1000);

    return {
        otp,          // send to Telegram
        hashedOTP,    // store in DB
        expireAt      // store in DB
    };
}

module.exports = {
    generateOTP,
    hashOTP,
    verifyOTP,
    isOTPExpired,
    createOTPWithExpiry
};