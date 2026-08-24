const nodemailer = require("nodemailer");
const { Resend } = require("resend");

let resendClient = null;
if (process.env.RESEND_API_KEY) {
    try {
        resendClient = new Resend(process.env.RESEND_API_KEY);
    } catch (e) {
        console.warn("Resend initialization error:", e.message);
    }
}

// Setup Nodemailer transporter if Gmail credentials are provided
const createNodemailerTransporter = () => {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        return nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS.replace(/\s+/g, "") // support passwords with or without spaces
            }
        });
    }
    return null;
};

const getOtpEmailHtml = (otp) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset OTP</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #f4f6f8;
                margin: 0;
                padding: 24px;
                color: #2d3748;
            }
            .container {
                max-width: 520px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                border: 1px solid #e2e8f0;
            }
            .header {
                background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                padding: 32px 24px;
                text-align: center;
                color: #ffffff;
            }
            .header h1 {
                margin: 0 0 6px 0;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: 0.5px;
            }
            .header p {
                margin: 0;
                font-size: 14px;
                opacity: 0.9;
            }
            .content {
                padding: 32px 24px;
                text-align: center;
            }
            .greeting {
                font-size: 16px;
                margin-bottom: 12px;
                color: #4a5568;
            }
            .instructions {
                font-size: 14px;
                line-height: 1.6;
                color: #718096;
                margin-bottom: 24px;
            }
            .otp-box {
                background: #f0f7ff;
                border: 2px dashed #3b82f6;
                border-radius: 12px;
                padding: 18px 24px;
                display: inline-block;
                margin-bottom: 24px;
            }
            .otp-code {
                font-size: 36px;
                font-weight: 800;
                letter-spacing: 8px;
                color: #1e40af;
                margin: 0;
                font-family: monospace;
            }
            .timer-note {
                font-size: 13px;
                color: #e53e3e;
                font-weight: 600;
                margin-top: 8px;
                display: block;
            }
            .security-tips {
                background: #fffbeb;
                border-left: 4px solid #f59e0b;
                padding: 12px 16px;
                text-align: left;
                border-radius: 4px;
                margin-top: 24px;
                font-size: 13px;
                color: #92400e;
            }
            .footer {
                background: #f8fafc;
                padding: 20px 24px;
                text-align: center;
                border-top: 1px solid #edf2f7;
                font-size: 12px;
                color: #a0aec0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Angkor Shopping Mall</h1>
                <p>Security & Account Protection</p>
            </div>
            <div class="content">
                <p class="greeting">Hello,</p>
                <p class="instructions">
                    We received a request to reset the password for your Angkor Shopping Mall account. 
                    Use the 6-digit verification code below to complete your password reset:
                </p>
                <div class="otp-box">
                    <div class="otp-code">${otp}</div>
                    <span class="timer-note">⏱ Code expires in 5 minutes</span>
                </div>
                <div class="security-tips">
                    <strong>Security Notice:</strong> Never share this code with anyone. Angkor Shopping Mall staff will never ask for your verification code.
                </div>
            </div>
            <div class="footer">
                <p>If you didn't request a password reset, you can safely ignore this email.</p>
                <p>&copy; ${new Date().getFullYear()} Angkor Shopping Mall. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

const sendOtpEmail = async (email, otp) => {
    let lastError = null;

    // 1. Try sending via Nodemailer (Gmail) if credentials configured
    const transporter = createNodemailerTransporter();
    if (transporter) {
        try {
            const info = await transporter.sendMail({
                from: `"Angkor Shopping Mall" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Your Angkor Shopping Mall Password Reset OTP: ${otp}`,
                html: getOtpEmailHtml(otp)
            });
            console.log("Email sent successfully via Nodemailer:", info.messageId);
            return { provider: "nodemailer", messageId: info.messageId };
        } catch (err) {
            console.warn("Nodemailer send failed, attempting fallback:", err.message);
            lastError = err;
        }
    }

    // 2. Try sending via Resend if available
    if (resendClient && process.env.RESEND_API_KEY) {
        try {
            const response = await resendClient.emails.send({
                from: process.env.EMAIL_FROM || "onboarding@resend.dev",
                to: email,
                subject: `Your Angkor Shopping Mall Password Reset OTP: ${otp}`,
                html: getOtpEmailHtml(otp)
            });
            console.log("Email sent successfully via Resend:", response);
            return { provider: "resend", response };
        } catch (err) {
            console.error("Resend send failed:", err.message);
            lastError = err;
        }
    }

    if (lastError) {
        throw new Error(lastError.message || "Unable to send reset email");
    }

    throw new Error("No email service configured (missing EMAIL_USER/EMAIL_PASS or RESEND_API_KEY)");
};

module.exports = {
    sendOtpEmail
};
