const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify SMTP connection
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP Error:", error);
    } else {
        console.log("SMTP Server is ready");
    }
});

const sendOtpEmail = async (email, otp) => {
    try {
        const info = await transporter.sendMail({
            from: `"OTP Verification" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Password Reset OTP",
            html: `
                <div style="font-family:Arial,sans-serif">
                    <h2>Password Reset</h2>
                    <p>Your OTP is:</p>

                    <h1 style="color:#0d6efd">${otp}</h1>

                    <p>This OTP expires in <b>5 minutes</b>.</p>

                    <p>If you didn't request this, ignore this email.</p>
                </div>
            `,
        });

        console.log("Email sent:", info.messageId);
        console.log("Response:", info.response);

        return true;
    } catch (error) {
        console.error("Email sending failed:");
        console.error(error);

        throw error;
    }
};

module.exports = {
    sendOtpEmail,
};