const { BakongKHQR, khqrData, IndividualInfo, MerchantInfo } = require('bakong-khqr');
const axios = require('axios');

class BakongKhqrService {
    constructor() {
        this.khqr = new BakongKHQR();
    }

    generateOrderKHQR({
        orderId,
        amount,
        currency = 'USD',
        billNumber = null,
        storeLabel = null,
        validityMinutes = 15
    }) {
        const isKHR = String(currency).toUpperCase() === 'KHR';
        const currEnum = isKHR ? khqrData.currency.khr : khqrData.currency.usd;

        let finalAmount = parseFloat(amount);
        if (isNaN(finalAmount) || finalAmount <= 0) {
            finalAmount = 0.01;
        }

        const expTimestamp = Date.now() + validityMinutes * 60 * 1000;
        const bill = (billNumber || `ORD-${String(orderId).slice(-8)}`).substring(0, 25);
        const store = (storeLabel || process.env.BAKONG_STORE_LABEL || 'Angkor Mall').substring(0, 25);
        const terminal = `POS-${String(orderId).slice(-4)}`.substring(0, 25);
        const bakongAccountId = process.env.BAKONG_ACCOUNT_ID || 'angkor_mall@devb';
        const merchantName = (process.env.BAKONG_MERCHANT_NAME || 'Angkor Shopping Mall').substring(0, 25);
        const merchantCity = (process.env.BAKONG_MERCHANT_CITY || 'Phnom Penh').substring(0, 15);

        const optionalData = {
            currency: currEnum,
            amount: finalAmount,
            mobileNumber: process.env.BAKONG_MERCHANT_PHONE || '85512345678',
            storeLabel: store,
            terminalLabel: terminal,
            billNumber: bill,
            purposeOfTransaction: 'Payment',
            expirationTimestamp: expTimestamp
        };

        let result;
        try {
            const merchantInfo = new MerchantInfo(
                bakongAccountId,
                merchantName,
                merchantCity,
                process.env.BAKONG_MERCHANT_ID || '0001',
                store,
                optionalData
            );
            result = this.khqr.generateMerchant(merchantInfo);
        } catch (mErr) {
            const individualInfo = new IndividualInfo(
                bakongAccountId,
                merchantName,
                merchantCity,
                optionalData
            );
            result = this.khqr.generateIndividual(individualInfo);
        }

        if (!result || result.status?.code !== 0 || !result.data?.qr) {
            const indInfo = new IndividualInfo(
                bakongAccountId,
                merchantName,
                merchantCity,
                optionalData
            );
            result = this.khqr.generateIndividual(indInfo);
        }

        if (result && result.status?.code === 0 && result.data?.qr) {
            const qrString = result.data.qr;
            const md5Hash = result.data.md5;
            const bakongDeepLink = `bakong://qr?qr=${encodeURIComponent(qrString)}`;
            const universalDeepLink = `https://api-bakong.nbc.gov.kh/v1/generate_deeplink_by_qr?qr=${encodeURIComponent(qrString)}`;

            return {
                success: true,
                qrString,
                md5: md5Hash,
                amount: finalAmount,
                currency: isKHR ? 'KHR' : 'USD',
                currencySymbol: isKHR ? '៛' : '$',
                billNumber: bill,
                merchantName,
                bakongAccountId,
                bakongDeepLink,
                universalDeepLink,
                expiresAt: new Date(expTimestamp).toISOString(),
                validityMinutes
            };
        }

        throw new Error(result?.status?.message || 'Failed to generate KHQR string');
    }

    async checkTransactionStatus(md5Hash) {
        if (!md5Hash) {
            return { isPaid: false, error: 'MD5 hash is required' };
        }

        const apiUrl = process.env.BAKONG_API_URL || 'https://api-bakong.nbc.gov.kh/v1';
        const apiToken = process.env.BAKONG_API_TOKEN;

        if (!apiToken) {
            return {
                isPaid: false,
                message: 'Bakong API Token not configured in .env'
            };
        }

        try {
            const response = await axios.post(
                `${apiUrl}/check_transaction_by_md5`,
                { md5: md5Hash },
                {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000
                }
            );

            if (response.data && (response.data.responseCode === 0 || response.data.code === 0)) {
                return {
                    isPaid: true,
                    transaction: response.data.data || response.data
                };
            }

            return {
                isPaid: false,
                responseCode: response.data?.responseCode,
                responseMessage: response.data?.responseMessage
            };
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;
            return {
                isPaid: false,
                statusCode: status,
                error: data?.responseMessage || error.message
            };
        }
    }
}

module.exports = new BakongKhqrService();
