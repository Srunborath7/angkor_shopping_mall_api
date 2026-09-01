const Setting = require("../models/settingModel");

const DEFAULT_STORE_PROFILE = {
    storeName: "Angkor Shopping Mall",
    storeTagline: "Cambodia's Leading Tech & Lifestyle Destination",
    storeEmail: "contact@angkormall.com",
    storePhone: "+855 23 888 999",
    supportTelegram: "@AngkorMallSupport",
    storeAddress: "St. 2004, Sangkat Kakab, Khan Sen Sok, Phnom Penh, Kingdom of Cambodia",
    operatingHours: "Mon - Sun: 8:00 AM - 10:00 PM (Daily)",
    facebookUrl: "https://facebook.com/angkorshoppingmall",
    tiktokUrl: "https://tiktok.com/@angkormall",
    instagramUrl: "https://instagram.com/angkormall",
    currency: "USD",
    dualCurrencyDisplay: true,
    khrRate: 4100,
    taxRate: 10,
    abaEnabled: true,
    bakongEnabled: true,
    wingEnabled: true,
    codEnabled: true,
    cardEnabled: true
};

class SettingService {
    async getStoreProfile() {
        try {
            const setting = await Setting.findOne({ where: { key: "store_profile" } });
            if (setting && setting.value) {
                return { ...DEFAULT_STORE_PROFILE, ...setting.value };
            }
            await Setting.create({
                key: "store_profile",
                value: DEFAULT_STORE_PROFILE,
                description: "Official Store Profile and Company Information"
            }).catch(() => {});
            return DEFAULT_STORE_PROFILE;
        } catch (err) {
            return DEFAULT_STORE_PROFILE;
        }
    }

    async updateStoreProfile(data) {
        let setting = await Setting.findOne({ where: { key: "store_profile" } });
        const merged = { ...DEFAULT_STORE_PROFILE, ...(setting?.value || {}), ...data };
        if (setting) {
            setting.value = merged;
            await setting.save();
        } else {
            setting = await Setting.create({
                key: "store_profile",
                value: merged,
                description: "Official Store Profile and Company Information"
            });
        }
        return setting.value;
    }

    async getByKey(key) {
        const setting = await Setting.findOne({ where: { key } });
        return setting ? setting.value : null;
    }

    async setByKey(key, value, description = "") {
        let setting = await Setting.findOne({ where: { key } });
        if (setting) {
            setting.value = value;
            if (description) setting.description = description;
            await setting.save();
        } else {
            setting = await Setting.create({ key, value, description });
        }
        return setting.value;
    }
}

module.exports = new SettingService();
