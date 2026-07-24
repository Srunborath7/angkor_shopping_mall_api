const userService = require('../services/userService');

const {
    successResponse,
    errorResponse
} = require('../utils/response');

class UserController {

    async create(req, res) {
        try {
            const user = await userService.createUser(req.body);

            return successResponse(
                res,
                'User created successfully',
                user
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findAll(req, res) {
        try {
            const users = await userService.getAllUsers();

            return successResponse(
                res,
                'Users retrieved successfully',
                users
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async findOne(req, res) {
        try {

            const user = await userService.getUserById(req.params.id);

            if (!user) {
                return errorResponse(res, 'User not found');
            }

            return successResponse(
                res,
                'User retrieved successfully',
                user
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async update(req, res) {
        try {

            const user = await userService.updateUser(
                req.params.id,
                req.body
            );

            return successResponse(
                res,
                'User updated successfully',
                user
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async delete(req, res) {
        try {

            await userService.deleteUser(req.params.id);

            return successResponse(
                res,
                'User deleted successfully'
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async login(req, res) {
        try {

            const result = await userService.login(req.body);

            return successResponse(
                res,
                'Login successful',
                result
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async refreshToken(req, res) {
        try {

            const { refreshToken } = req.body;

            if (!refreshToken) {
                return errorResponse(res, 'Refresh token is required');
            }

            const result = await userService.refreshToken(refreshToken);

            return successResponse(
                res,
                'Token refreshed successfully',
                result
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async logout(req, res) {
        try {

            const { refreshToken } = req.body;

            if (!refreshToken) {
                return errorResponse(res, 'Refresh token is required');
            }

            await userService.logout(refreshToken);

            return successResponse(
                res,
                'Logout successful'
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async changePassword(req, res) {
        try {

            const { oldPassword, newPassword } = req.body;

            await userService.changePassword(
                req.user.id,
                oldPassword,
                newPassword
            );

            return successResponse(
                res,
                'Password changed successfully'
            );

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
    async sendResetOtp(req, res) {
        try {

            const result = await userService.sendResetOtp(req.body.email);

            return successResponse(res, 'OTP sent', result);

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async verifyResetOtp(req, res) {
        try {

            const { email, otp } = req.body;

            const result = await userService.verifyOtp(email, otp);

            return successResponse(res, 'OTP verified', result);

        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async resetPassword(req, res) {
        try {
            const { resetToken, newPassword } = req.body;
            const result = await userService.resetPassword(resetToken, newPassword);
            return successResponse(res, "Password reset success", result);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }
    async sendResetOtpTelegram(req, res) {
        try {
            const result = await userService.sendResetOtpTelegram(req.body.phone);
            return successResponse(res, "OTP sent", result);
        } catch (err) {
            return errorResponse(res, err.message);
        }
    }

    async verifyResetOtpTelegram(req, res) {
        try {
            const { phone, otp } = req.body;

            const result = await userService.verifyOtpTelegram(phone, otp);
            return successResponse(
                res,
                "OTP verified successfully",
                result
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async resetPasswordTelegram(req, res) {
        try {
            const result = await userService.resetPasswordTelegram(
                req.body.resetToken,
                req.body.newPassword
            );
            return successResponse(res, "Password reset success", result);
        } catch (err) {
            return error(res, err.message);
        }
    }

    async getCustomers(req, res) {
        try {
            const customers = await userService.getCustomers();

            return successResponse(
                res,
                "Customers retrieved successfully",
                customers
            );
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new UserController();