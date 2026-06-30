const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
    try {
        const response = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Password Reset OTP",
            html: `
                <h2>Password Reset</h2>
                <p>Your OTP code is:</p>
                <h1 style="color:#2563eb;">${otp}</h1>
                <p>This OTP will expire in 5 minutes.</p>
            `
        });

        console.log("Email sent:", response);

    } catch (error) {
        console.error("EMAIL ERROR:", error);
        throw new Error("Failed to send OTP email");
    }
};

module.exports = { sendOtpEmail };