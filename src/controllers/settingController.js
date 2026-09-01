const settingService = require("../services/settingService");
const { successResponse, errorResponse } = require("../utils/response");

class SettingController {
    async getStoreProfile(req, res) {
        try {
            const profile = await settingService.getStoreProfile();
            return successResponse(res, "Store profile retrieved successfully", profile);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async updateStoreProfile(req, res) {
        try {
            const updated = await settingService.updateStoreProfile(req.body);
            return successResponse(res, "Store profile updated successfully", updated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async getSetting(req, res) {
        try {
            const { key } = req.params;
            const val = await settingService.getByKey(key);
            return successResponse(res, "Setting retrieved", val);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }

    async saveSetting(req, res) {
        try {
            const { key, value, description, type, settings } = req.body;
            const actualKey = key || type || "general";
            const actualVal = value || settings || req.body;
            const updated = await settingService.setByKey(actualKey, actualVal, description);
            return successResponse(res, "Setting saved", updated);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
}

module.exports = new SettingController();
