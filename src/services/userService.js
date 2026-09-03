const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const User = require('../models/userModel');
const Role = require('../models/roleModel');
const UserRole = require('../models/userRoleModel');
const Permission = require('../models/permissionModel');
const RolePermission = require('../models/rolePermissionModel');
const RefreshToken = require('../models/refreshTokenModel');
const Otp = require('../models/otpModel');

const telegramService = require('./telegramService');
const {
    generateAccessToken,
    generateRefreshToken,
    generateResetToken,
    verifyResetToken,
    verifyRefreshToken,
    generateTempToken,
    verifyTempToken,
} = require('../utils/jwt');
const { sendOtpEmail } = require('../utils/mailer');

class UserService {
    async _loadUserWithRolesAndPermissions(user) {
        if (!user) return null;
        const plain = user.toJSON ? user.toJSON() : { ...user };
        delete plain.password;
        delete plain.two_fa_pin;

        // Fetch user roles via junction table to avoid deep SQL joins that cause lock table exhaustion
        const userRoles = await UserRole.findAll({
            where: { user_id: plain.id },
            raw: true
        });
        const roleIds = userRoles.map(ur => ur.role_id).filter(Boolean);

        let roles = [];
        let permissions = [];

        if (roleIds.length > 0) {
            roles = await Role.findAll({
                where: { id: { [Op.in]: roleIds } },
                raw: true
            });

            const rolePermissions = await RolePermission.findAll({
                where: { role_id: { [Op.in]: roleIds } },
                raw: true
            });
            const permissionIds = rolePermissions.map(rp => rp.permission_id).filter(Boolean);

            if (permissionIds.length > 0) {
                const perms = await Permission.findAll({
                    where: { id: { [Op.in]: permissionIds } },
                    raw: true
                });
                permissions = perms.map(p => p.name || `${p.module}:${p.action}`);
            }
        }

        const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
        const isOnline = plain.last_active_at
            ? (Date.now() - new Date(plain.last_active_at).getTime()) < ONLINE_THRESHOLD_MS
            : false;

        return {
            ...plain,
            is_online: isOnline,
            roles: roles.map(r => ({
                id: r.id,
                name: r.name,
                description: r.description
            })),
            permissions: Array.from(new Set(permissions))
        };
    }

    async createUser(data) {
        const cleanEmail = (data.email || '').trim().toLowerCase();
        const exist = await User.findOne({
            where: { email: cleanEmail }
        });

        if (exist) {
            throw new Error('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const user = await User.create({
            name: data.name,
            email: cleanEmail,
            password: hashedPassword,
            phone: data.phone,
            is_active: true
        });

        let role;
        if (data.role_id) {
            role = await Role.findByPk(data.role_id);
        } else if (data.role) {
            role = await Role.findOne({ where: { name: data.role } });
        }

        if (!role) {
            role = await Role.findOne({
                where: { name: 'customer' }
            });
        }

        if (role) {
            await UserRole.findOrCreate({
                where: { user_id: user.id, role_id: role.id }
            });
        }

        return await this.getUserById(user.id);
    }

    async getAllUsers() {
        const users = await User.findAll({
            attributes: { exclude: ['password', 'two_fa_pin'] },
            order: [['created_at', 'DESC']],
            raw: true
        });
        if (!users.length) return [];

        const userIds = users.map(u => u.id);
        const userRoles = await UserRole.findAll({
            where: { user_id: { [Op.in]: userIds } },
            raw: true
        });

        const roleIds = Array.from(new Set(userRoles.map(ur => ur.role_id).filter(Boolean)));
        const roles = roleIds.length > 0 ? await Role.findAll({
            where: { id: { [Op.in]: roleIds } },
            raw: true
        }) : [];

        const roleMap = new Map(roles.map(r => [r.id, r]));
        const userRolesMap = new Map();
        for (const ur of userRoles) {
            if (!userRolesMap.has(ur.user_id)) {
                userRolesMap.set(ur.user_id, []);
            }
            const roleObj = roleMap.get(ur.role_id);
            if (roleObj) {
                userRolesMap.get(ur.user_id).push({ id: roleObj.id, name: roleObj.name, description: roleObj.description });
            }
        }

        const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
        return users.map(u => {
            const isOnline = u.last_active_at
                ? (Date.now() - new Date(u.last_active_at).getTime()) < ONLINE_THRESHOLD_MS
                : false;
            return {
                ...u,
                is_online: isOnline,
                roles: userRolesMap.get(u.id) || []
            };
        });
    }

    async getUserById(id) {
        const user = await User.findByPk(id);
        if (!user) return null;
        return await this._loadUserWithRolesAndPermissions(user);
    }

    async updateUser(id, data) {
        const user = await User.findByPk(id);

        if (!user) {
            throw new Error('User not found');
        }

        const updateData = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = String(data.email).trim().toLowerCase();
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.is_active !== undefined) updateData.is_active = data.is_active;
        if (data.telegram_chat_id !== undefined) updateData.telegram_chat_id = data.telegram_chat_id;
        if (data.two_fa_pin !== undefined) updateData.two_fa_pin = data.two_fa_pin;
        if (data.two_fa_enabled !== undefined) updateData.two_fa_enabled = data.two_fa_enabled;

        if (data.password) {
            updateData.password = await bcrypt.hash(data.password, 10);
        }

        await user.update(updateData);

        if (data.role_id) {
            const role = await Role.findByPk(data.role_id);
            if (role) {
                await UserRole.destroy({ where: { user_id: id } });
                await UserRole.create({ user_id: id, role_id: role.id });
            }
        } else if (data.role) {
            const role = await Role.findOne({ where: { name: data.role } });
            if (role) {
                await UserRole.destroy({ where: { user_id: id } });
                await UserRole.create({ user_id: id, role_id: role.id });
            }
        }

        return await this.getUserById(id);
    }

    async deleteUser(id) {
        const user = await User.findByPk(id);

        if (!user) {
            throw new Error('User not found');
        }

        // delete refresh tokens & junction roles
        await RefreshToken.destroy({
            where: { user_id: id }
        });
        await UserRole.destroy({
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

        const cleanEmail = googleEmail.trim().toLowerCase();
        let userRecord = await User.findOne({
            where: { email: cleanEmail }
        });

        if (!userRecord) {
            const randomPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
            const placeholderPhone = 'g_' + (googleSub ? googleSub.slice(-8) : Date.now().toString().slice(-8));

            const newUser = await User.create({
                name: googleName,
                email: cleanEmail,
                password: randomPassword,
                phone: placeholderPhone,
                is_active: true
            });

            const customerRole = await Role.findOne({ where: { name: 'customer' } });
            if (customerRole) {
                await UserRole.create({ user_id: newUser.id, role_id: customerRole.id });
            }

            userRecord = await User.findByPk(newUser.id);
        }

        const formattedUser = await this._loadUserWithRolesAndPermissions(userRecord);

        const accessToken = generateAccessToken(formattedUser);
        const refreshToken = generateRefreshToken(formattedUser);

        await RefreshToken.create({
            user_id: formattedUser.id,
            token: refreshToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        const roleNames = (formattedUser.roles || []).map(r => (r.name || '').toLowerCase());
        const isStaffOrAdmin = roleNames.some(role =>
            role !== 'customer' &&
            (role.includes('admin') ||
             role.includes('manager') ||
             role.includes('sale') ||
             role.includes('staff') ||
             role.includes('cashier') ||
             role.includes('inventory') ||
             role.includes('security') ||
             role.includes('super'))
        );

        if (isStaffOrAdmin && userRecord.two_fa_enabled && userRecord.two_fa_pin) {
            const tempToken = generateTempToken(formattedUser);
            return {
                requires_2fa: true,
                temp_token: tempToken,
                user: formattedUser
            };
        }

        return {
            user: formattedUser,
            accessToken,
            refreshToken
        };
    }

    async login(data) {
        const email = (data.email || '').trim().toLowerCase();
        const user = await User.findOne({
            where: { email }
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

        const formattedUser = await this._loadUserWithRolesAndPermissions(user);

        const roleNames = (formattedUser.roles || []).map(r => (r.name || '').toLowerCase());
        const isStaffOrAdmin = roleNames.some(role =>
            role !== 'customer' &&
            (role.includes('admin') ||
             role.includes('manager') ||
             role.includes('sale') ||
             role.includes('staff') ||
             role.includes('cashier') ||
             role.includes('inventory') ||
             role.includes('security') ||
             role.includes('super'))
        );

        if (isStaffOrAdmin && user.two_fa_enabled && user.two_fa_pin) {
            const tempToken = generateTempToken(formattedUser);
            return {
                requires_2fa: true,
                temp_token: tempToken,
                user: formattedUser
            };
        }

        const accessToken = generateAccessToken(formattedUser);
        const refreshToken = generateRefreshToken(formattedUser);

        await RefreshToken.create({
            user_id: formattedUser.id,
            token: refreshToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        return {
            user: formattedUser,
            accessToken,
            refreshToken
        };
    }

    async verify2FA(tempToken, pin) {
        if (!tempToken || !pin) {
            throw new Error('Temporary token and PIN are required');
        }

        let decoded;
        try {
            decoded = verifyTempToken(tempToken);
        } catch (err) {
            throw new Error('Invalid or expired verification session');
        }

        const user = await User.findByPk(decoded.id);
        if (!user || !user.two_fa_enabled || !user.two_fa_pin) {
            throw new Error('2FA is not configured for this account');
        }

        const isMatch = await bcrypt.compare(String(pin).trim(), user.two_fa_pin);
        if (!isMatch) {
            throw new Error('Invalid 2FA PIN');
        }

        const formattedUser = await this._loadUserWithRolesAndPermissions(user);

        const accessToken = generateAccessToken(formattedUser);
        const refreshToken = generateRefreshToken(formattedUser);

        await RefreshToken.create({
            user_id: formattedUser.id,
            token: refreshToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        return {
            user: formattedUser,
            accessToken,
            refreshToken
        };
    }

    async setTwoFAPin(userId, pin) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const cleanPin = String(pin || '').trim();
        if (!/^\d{6}$/.test(cleanPin)) {
            throw new Error('Security PIN must be exactly 6 numeric digits');
        }

        const hashedPin = await bcrypt.hash(cleanPin, 10);
        user.two_fa_pin = hashedPin;
        user.two_fa_enabled = true;
        await user.save();

        return {
            message: '2FA PIN configured successfully',
            two_fa_enabled: true
        };
    }

    async disable2FA(userId) {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.two_fa_pin = null;
        user.two_fa_enabled = false;
        await user.save();

        return {
            message: '2FA disabled successfully',
            two_fa_enabled: false
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

        const user = await User.findByPk(decoded.id);
        if (!user) {
            throw new Error('User not found');
        }

        const formattedUser = await this._loadUserWithRolesAndPermissions(user);
        const newAccessToken = generateAccessToken(formattedUser);

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
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            throw new Error('Please provide a valid email address');
        }

        const user = await User.findOne({ where: { email: cleanEmail } });
        if (!user) {
            throw new Error('No account found with this email address');
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await Otp.destroy({
            where: {
                user_id: user.id,
                type: 'PASSWORD_RESET'
            }
        });

        await Otp.create({
            user_id: user.id,
            otp_code: otpCode,
            type: 'PASSWORD_RESET',
            expires_at: expiresAt,
            is_used: false
        });

        try {
            await sendOtpEmail(cleanEmail, otpCode);
        } catch (emailErr) {
            console.error('[sendResetOtp] sendOtpEmail failed:', emailErr.message);
            throw new Error('Failed to send OTP email: ' + (emailErr.message || 'Unknown error'));
        }

        return {
            email: cleanEmail,
            expiresIn: '10 minutes'
        };
    }

    async verifyOtp(email, otp) {
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanOtp = (otp || '').trim();

        if (!cleanEmail || !cleanOtp) {
            throw new Error('Email and OTP are required');
        }

        const user = await User.findOne({ where: { email: cleanEmail } });
        if (!user) {
            throw new Error('Invalid email');
        }

        const otpRecord = await Otp.findOne({
            where: {
                user_id: user.id,
                otp_code: cleanOtp,
                type: 'PASSWORD_RESET',
                is_used: false
            }
        });

        if (!otpRecord) {
            throw new Error('Invalid or expired OTP');
        }

        if (new Date() > new Date(otpRecord.expires_at)) {
            throw new Error('OTP has expired. Please request a new one.');
        }

        otpRecord.is_used = true;
        await otpRecord.save();

        const resetToken = generateResetToken(user);

        return {
            valid: true,
            resetToken
        };
    }

    async resetPassword(resetToken, newPassword) {
        if (!resetToken || !newPassword) {
            throw new Error('Reset token and new password are required');
        }

        if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        let decoded;
        try {
            decoded = verifyResetToken(resetToken);
        } catch (err) {
            throw new Error('Invalid or expired reset token');
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return { message: "Password reset successful" };
    }

    async sendResetOtpTelegram(phone) {
        const cleanPhone = (phone || '').trim();
        if (!cleanPhone) {
            throw new Error('Phone number is required');
        }

        const user = await User.findOne({ where: { phone: cleanPhone } });
        if (!user) {
            throw new Error('No account found with this phone number');
        }

        if (!user.telegram_chat_id) {
            throw new Error('Telegram is not connected for this account. Please connect your Telegram account first.');
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await Otp.destroy({
            where: {
                user_id: user.id,
                type: 'PASSWORD_RESET_TELEGRAM'
            }
        });

        await Otp.create({
            user_id: user.id,
            otp_code: otpCode,
            type: 'PASSWORD_RESET_TELEGRAM',
            expires_at: expiresAt,
            is_used: false
        });

        const msg = `⚡ *Angkor Shopping Mall - Password Reset*\n\nYour OTP code is: *${otpCode}*\n\nThis code expires in 10 minutes.\nDo not share this code with anyone.`;
        await telegramService.sendMessage(user.telegram_chat_id, msg);

        return {
            phone: cleanPhone,
            expiresIn: '10 minutes'
        };
    }

    async verifyOtpTelegram(phone, otp) {
        const cleanPhone = (phone || '').trim();
        const cleanOtp = (otp || '').trim();

        if (!cleanPhone || !cleanOtp) {
            throw new Error('Phone and OTP are required');
        }

        const user = await User.findOne({ where: { phone: cleanPhone } });
        if (!user) {
            throw new Error('Invalid phone number');
        }

        const otpRecord = await Otp.findOne({
            where: {
                user_id: user.id,
                otp_code: cleanOtp,
                type: 'PASSWORD_RESET_TELEGRAM',
                is_used: false
            }
        });

        if (!otpRecord) {
            throw new Error('Invalid or expired OTP');
        }

        if (new Date() > new Date(otpRecord.expires_at)) {
            throw new Error('OTP has expired. Please request a new one.');
        }

        otpRecord.is_used = true;
        await otpRecord.save();

        const resetToken = generateResetToken(user);

        return {
            valid: true,
            resetToken
        };
    }

    async resetPasswordTelegram(resetToken, newPassword) {
        if (!resetToken || !newPassword) {
            throw new Error('Reset token and new password are required');
        }

        if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        let decoded;
        try {
            decoded = verifyResetToken(resetToken);
        } catch (err) {
            throw new Error('Invalid or expired reset token');
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            throw new Error('User not found');
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return { message: "Password reset successful" };
    }

    async adminChangePassword(userId, newPassword) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }
        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error('User not found');
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        return true;
    }

    async updateHeartbeat(userId) {
        if (!userId) return null;
        await User.update(
            { last_active_at: new Date() },
            { where: { id: userId } }
        );
        return { success: true, last_active_at: new Date() };
    }

    async getStaffUsers() {
        const staffRoles = await Role.findAll({
            where: { name: { [Op.ne]: 'customer' } },
            raw: true
        });
        if (!staffRoles.length) return [];

        const staffRoleIds = staffRoles.map(r => r.id);
        const userRoles = await UserRole.findAll({
            where: { role_id: { [Op.in]: staffRoleIds } },
            raw: true
        });
        if (!userRoles.length) return [];

        const staffUserIds = Array.from(new Set(userRoles.map(ur => ur.user_id).filter(Boolean)));
        const users = await User.findAll({
            where: { id: { [Op.in]: staffUserIds } },
            attributes: { exclude: ['password', 'two_fa_pin'] },
            order: [['created_at', 'DESC']],
            raw: true
        });

        const roleMap = new Map(staffRoles.map(r => [r.id, r]));
        const userRolesMap = new Map();
        for (const ur of userRoles) {
            if (!userRolesMap.has(ur.user_id)) {
                userRolesMap.set(ur.user_id, []);
            }
            const roleObj = roleMap.get(ur.role_id);
            if (roleObj) {
                userRolesMap.get(ur.user_id).push({ id: roleObj.id, name: roleObj.name, description: roleObj.description });
            }
        }

        const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
        return users.map(u => {
            const isOnline = u.last_active_at
                ? (Date.now() - new Date(u.last_active_at).getTime()) < ONLINE_THRESHOLD_MS
                : false;
            return {
                ...u,
                is_online: isOnline,
                roles: userRolesMap.get(u.id) || []
            };
        });
    }

    async getCustomers() {
        const customerRole = await Role.findOne({
            where: { name: 'customer' },
            raw: true
        });
        if (!customerRole) return [];

        const userRoles = await UserRole.findAll({
            where: { role_id: customerRole.id },
            raw: true
        });
        if (!userRoles.length) return [];

        const customerUserIds = Array.from(new Set(userRoles.map(ur => ur.user_id).filter(Boolean)));
        const users = await User.findAll({
            where: { id: { [Op.in]: customerUserIds } },
            attributes: { exclude: ['password', 'two_fa_pin'] },
            order: [['created_at', 'DESC']],
            raw: true
        });

        const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
        return users.map(u => {
            const isOnline = u.last_active_at
                ? (Date.now() - new Date(u.last_active_at).getTime()) < ONLINE_THRESHOLD_MS
                : false;
            return {
                ...u,
                is_online: isOnline,
                roles: [{ id: customerRole.id, name: customerRole.name, description: customerRole.description }]
            };
        });
    }
}

module.exports = new UserService();
