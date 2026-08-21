const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const User = require('../models/userModel');
const Role = require('../models/roleModel');
const RefreshToken = require('../models/refreshTokenModel');
const Otp = require('../models/otpModel');

const telegramService = require('./telegramService');
const {
    generateAccessToken,
    generateRefreshToken,
    generateResetToken,
    verifyResetToken,
    verifyRefreshToken,
} = require('../utils/jwt');
const { sendOtpEmail } = require('../utils/mailer');

class UserService {
    async createUser(data) {
        const exist = await User.findOne({
            where: { email: data.email }
        });

        if (exist) {
            throw new Error('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const user = await User.create({
            name: data.name,
            email: data.email,
            password: hashedPassword,
            phone: data.phone,
            is_active: true
        });
        let role;
        if (data.role_id) {
            role = await Role.findByPk(data.role_id);
        }

        if (!role) {
            role = await Role.findOne({
                where: { name: 'customer' }
            });
        }

        if (!role) {
            throw new Error('Role not found');
        }

        await user.addRole(role);

        return await User.findByPk(user.id, {
            attributes: { exclude: ['password'] },
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });
    }

    async getAllUsers() {
        return await User.findAll({
            attributes: { exclude: ['password'] },
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });
    }
    async getUserById(id) {
        return await User.findByPk(id, {
            attributes: { exclude: ['password'] },
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });
    }
    async updateUser(id, data) {

        const user = await User.findByPk(id);

        if (!user) {
            throw new Error('User not found');
        }

        const updateData = {
            name: data.name,
            email: data.email,
            phone: data.phone,
            is_active: data.is_active
        };

        if (data.password) {
            updateData.password = await bcrypt.hash(data.password, 10);
        }

        await user.update(updateData);

        return await this.getUserById(id);
    }
    async deleteUser(id) {

        const user = await User.findByPk(id);

        if (!user) {
            throw new Error('User not found');
        }

        // delete refresh tokens
        await RefreshToken.destroy({
            where: { user_id: id }
        });

        await user.destroy();

        return true;
    }
    
    async googleLogin(data) {
        const { token, access_token } = data;
        let googleEmail, googleName, googlePicture, googleSub;

        if (token) {
            try {
                const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
                googleEmail = response.data.email;
                googleName = response.data.name || response.data.given_name || 'Google User';
                googlePicture = response.data.picture;
                googleSub = response.data.sub;
            } catch (err) {
                try {
                    const { OAuth2Client } = require('google-auth-library');
                    const client = new OAuth2Client();
                    const ticket = await client.verifyIdToken({ idToken: token });
                    const payload = ticket.getPayload();
                    googleEmail = payload.email;
                    googleName = payload.name || payload.given_name || 'Google User';
                    googlePicture = payload.picture;
                    googleSub = payload.sub;
                } catch (verifyErr) {
                    throw new Error('Invalid or expired Google token');
                }
            }
        } else if (access_token) {
            try {
                const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${access_token}` }
                });
                googleEmail = response.data.email;
                googleName = response.data.name || response.data.given_name || 'Google User';
                googlePicture = response.data.picture;
                googleSub = response.data.sub;
            } catch (err) {
                throw new Error('Failed to fetch Google profile with access token');
            }
        } else {
            throw new Error('Google token is required');
        }

        if (!googleEmail) {
            throw new Error('Could not retrieve email from Google');
        }

        let user = await User.findOne({
            where: { email: googleEmail },
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });

        if (!user) {
            const randomPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
            const placeholderPhone = 'g_' + (googleSub ? googleSub.slice(-8) : Date.now().toString().slice(-8));

            user = await User.create({
                name: googleName,
                email: googleEmail,
                password: randomPassword,
                phone: placeholderPhone,
                is_active: true
            });

            const customerRole = await Role.findOne({ where: { name: 'customer' } });
            if (customerRole) {
                await user.addRole(customerRole);
            }

            user = await User.findByPk(user.id, {
                include: [{
                    model: Role,
                    as: 'roles',
                    attributes: ['id', 'name'],
                    through: { attributes: [] }
                }]
            });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await RefreshToken.create({
            user_id: user.id,
            token: refreshToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles
            },
            accessToken,
            refreshToken
        };
    }

    async login(data) {

        const user = await User.findOne({
            where: { email: data.email },
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        const isMatch = await bcrypt.compare(
            data.password,
            user.password
        );

        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await RefreshToken.create({
            user_id: user.id,
            token: refreshToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles
            },
            accessToken,
            refreshToken
        };
    }
    async refreshToken(token) {

        const decoded = verifyRefreshToken(token);

        const savedToken = await RefreshToken.findOne({
            where: { token }
        });

        if (!savedToken) {
            throw new Error('Invalid refresh token');
        }

        if (savedToken.expires_at < new Date()) {
            await savedToken.destroy();
            throw new Error('Refresh token expired');
        }

        const user = await User.findByPk(decoded.id, {
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }]
        });

        if (!user) {
            throw new Error('User not found');
        }

        const newAccessToken = generateAccessToken(user);

        return {
            accessToken: newAccessToken
        };
    }
    async logout(refreshToken) {

        await RefreshToken.destroy({
            where: { token: refreshToken }
        });

        return true;
    }
    async changePassword(userId, oldPassword, newPassword) {

        const user = await User.findByPk(userId);

        if (!user) {
            throw new Error('User not found');
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);

        if (!isMatch) {
            throw new Error('Old password incorrect');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return true;
    }
    async sendResetOtp(email) {

        const user = await User.findOne({ where: { email } });

        if (!user) {
            throw new Error('User not found');
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await Otp.create({
            user_id: user.id,
            otp,
            purpose: 'reset_password',
            expires_at: new Date(Date.now() + 5 * 60 * 1000)
        });

        await sendOtpEmail(email, otp);

        return { message: 'OTP sent to email' };
    }
    async verifyOtp(email, otp) {

        const user = await User.findOne({ where: { email } });
        if (!user) throw new Error('User not found');
        const record = await Otp.findOne({
            where: {
                user_id: user.id,
                otp,
                purpose: 'reset_password',
                is_used: false
            }
        });
        if (!record) throw new Error('Invalid OTP');
        if (record.expires_at < new Date()) {
            throw new Error('OTP expired');
        }

        record.is_used = true;
        await record.save();
        const resetToken = generateResetToken(user);

        return {
            resetToken
        };
    }
    async resetPassword(resetToken, newPassword) {

        const decoded = jwt.verify(resetToken, process.env.RESET_SECRET);

        const user = await User.findByPk(decoded.userId);

        if (!user) throw new Error('User not found');

        const bcrypt = require('bcrypt');
        const hashed = await bcrypt.hash(newPassword, 10);

        user.password = hashed;
        await user.save();

        return { message: "Password reset successful" };
    }
    async sendResetOtpTelegram(phone) {
        const user = await User.findOne({
            where: { phone }
        });

        if (!user) {
            throw new Error("Phone not found");
        }

        if (!user.telegram_chat_id) {
            throw new Error("Telegram account not linked.");
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await Otp.create({
            user_id: user.id,
            otp,
            purpose: "reset_password",
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
            is_used: false
        });

        await telegramService.sendOtp(user.telegram_chat_id, otp);

        return {
            message: "OTP sent to Telegram"
        };
    }

    /**
     * 2. VERIFY OTP
     */
    async verifyOtpTelegram(phone, otp) {
        const user = await User.findOne({
            where: { phone }
        });

        if (!user) {
            throw new Error("User not found");
        }

        const otpRecord = await Otp.findOne({
            where: {
                user_id: user.id,
                otp,
                purpose: "reset_password",
                is_used: false
            }
        });

        if (!otpRecord) {
            throw new Error("Invalid OTP");
        }

        if (otpRecord.expires_at < new Date()) {
            throw new Error("OTP expired");
        }

        otpRecord.is_used = true;
        await otpRecord.save();

        const resetToken = generateResetToken(user);

        return {
            resetToken,
            message: "OTP verified successfully"
        };
    }

    /**
     * 3. RESET PASSWORD
     */
    async resetPasswordTelegram(resetToken, newPassword) {

        const decoded = jwt.verify(resetToken, process.env.RESET_SECRET);

        const user = await User.findByPk(decoded.userId);

        if (!user) throw new Error("User not found");

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return { message: "Password reset successful" };
    }
    async getCustomers() {
        return await User.findAll({
            include: [
                {
                    model: Role,
                    as: "roles",
                    where: {
                        name: "customer",
                    },
                    attributes: ["id", "name"],
                    through: {
                        attributes: [],
                    },
                    required: true,
                },
            ],
        });
    }
}

module.exports = new UserService();