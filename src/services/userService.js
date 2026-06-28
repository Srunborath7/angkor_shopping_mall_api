const bcrypt = require('bcrypt');

const User = require('../models/userModel');
const Role = require('../models/roleModel');
const RefreshToken = require('../models/refreshTokenModel');
const jwt = require('jsonwebtoken');
const {
    generateAccessToken,
    generateRefreshToken,
    generateResetToken,
    verifyResetToken
} = require('../utils/jwt');
const Otp = require('../models/otpModel');
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

}

module.exports = new UserService();