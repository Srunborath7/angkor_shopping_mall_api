const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
    try {
        const result = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Password Reset OTP",
            html: `
                <h2>Your OTP Code</h2>
                <h1>${otp}</h1>
                <p>This OTP expires in 5 minutes.</p>
            `
        });

        console.log("EMAIL RESULT:", result);

        if (result.error) {
            throw new Error(result.error.message);
        }

        return result;

    } catch (error) {
        console.error("EMAIL SEND ERROR:", error);
        throw error;
    }
};

module.exports = { sendOtpEmail };