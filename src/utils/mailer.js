const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOtpEmail = async (email, otp) => {
    try {

        const response = await resend.emails.send({

            from: process.env.EMAIL_FROM,

            to: email,

            subject: "Password Reset OTP",

            html: `
                <div style="font-family:Arial,sans-serif">

                    <h2>Password Reset</h2>

                    <p>Your OTP is</p>

                    <h1 style="color:#0d6efd">${otp}</h1>

                    <p>This OTP expires in <b>5 minutes</b>.</p>

                    <p>If you didn't request this email, simply ignore it.</p>

                </div>
            `
        });

        console.log("Email sent");

        console.log(response);

        return response;

    } catch (err) {

        console.error("Resend Error");

        console.error(err);

        throw new Error(err.message || "Unable to send email");

    }
};

module.exports = {
    sendOtpEmail
};