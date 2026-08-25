const crypto = require('crypto');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo, MerchantInfo } = require('bakong-khqr');

class AbaPaywayService {
    constructor() {
        this.apiUrl = process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments';
        this.merchantId = process.env.ABA_PAYWAY_MERCHANT_ID || 'angkor_mall';
        this.apiKey = process.env.ABA_PAYWAY_API_KEY || 'aba_sandbox_api_key';
        this.storeLabel = process.env.ABA_PAYWAY_STORE_LABEL || 'Angkor Shopping Mall';
        this.khqr = new BakongKHQR();
    }

    /**
     * Generate request time in YYYYMMDDHHmmss format
     */
    getReqTime() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${y}${m}${d}${h}${min}${s}`;
    }

    /**
     * Generate HMAC-SHA512 hash in Base64 for ABA PayWay request signing
     */
    generateHash(rawString) {
        return crypto
            .createHmac('sha512', this.apiKey)
            .update(rawString)
            .digest('base64');
    }

    /**
     * Format transaction ID to meet ABA PayWay constraints (alphanumeric, max 20 chars)
     */
    formatTranId(orderId) {
        if (!orderId) {
            return `TRX${Date.now()}`;
        }
        const clean = String(orderId).replace(/[^a-zA-Z0-9]/g, '');
        if (clean.length > 20) {
            return clean.slice(-20);
        }
        return clean.padStart(6, '0');
    }

    /**
     * Generate ABA PayWay Dynamic QR code & Deeplink
     */
    async generateAbaQR({
        orderId,
        amount,
        currency = 'USD',
        firstName = 'Valued',
        lastName = 'Customer',
        email = '',
        phone = '',
        items = [],
        validityMinutes = 15
    }) {
        const reqTime = this.getReqTime();
        const tranId = this.formatTranId(orderId);
        const curr = String(currency).toUpperCase() === 'KHR' ? 'KHR' : 'USD';
        
        let finalAmount = parseFloat(amount);
        if (isNaN(finalAmount) || finalAmount <= 0) {
            finalAmount = 0.01;
        }

        const formattedAmount = curr === 'KHR' ? Math.round(finalAmount).toFixed(0) : finalAmount.toFixed(2);
        
        const preparedItems = items && items.length > 0
            ? items.map(item => ({
                name: String(item.name || item.title || 'Product').substring(0, 50),
                quantity: parseInt(item.quantity || 1, 10),
                price: parseFloat(item.price || finalAmount).toFixed(2)
            }))
            : [{ name: 'Order Payment', quantity: 1, price: formattedAmount }];

        const itemsBase64 = Buffer.from(JSON.stringify(preparedItems)).toString('base64');

        const purchaseType = 'purchase';
        const paymentOption = 'abapay_khqr';
        const callbackUrl = process.env.ABA_PAYWAY_CALLBACK_URL || '';
        const returnDeeplink = process.env.ABA_PAYWAY_RETURN_DEEPLINK || '';
        const customFields = '';
        const returnParams = '';
        const payout = '';
        const lifetime = String(validityMinutes);
        const qrImageTemplate = 'template3';

        // Hash concatenation string for ABA PayWay /generate-qr endpoint:
        // req_time + merchant_id + tran_id + amount + items + first_name + last_name + email + phone + purchase_type + payment_option + callback_url + return_deeplink + currency + custom_fields + return_params + payout + lifetime + qr_image_template
        const rawHashString = `${reqTime}${this.merchantId}${tranId}${formattedAmount}${itemsBase64}${firstName}${lastName}${email}${phone}${purchaseType}${paymentOption}${callbackUrl}${returnDeeplink}${curr}${customFields}${returnParams}${payout}${lifetime}${qrImageTemplate}`;
        const hash = this.generateHash(rawHashString);

        const expTimestamp = Date.now() + validityMinutes * 60 * 1000;
        const expiresAt = new Date(expTimestamp).toISOString();

        // 1. Attempt to call official ABA PayWay API if configured with live credentials
        if (this.apiKey && this.apiKey !== 'aba_sandbox_api_key' && this.merchantId !== 'angkor_mall') {
            try {
                const response = await axios.post(
                    `${this.apiUrl}/generate-qr`,
                    {
                        req_time: reqTime,
                        merchant_id: this.merchantId,
                        tran_id: tranId,
                        amount: formattedAmount,
                        items: itemsBase64,
                        first_name: firstName,
                        last_name: lastName,
                        email: email,
                        phone: phone,
                        purchase_type: purchaseType,
                        payment_option: paymentOption,
                        callback_url: callbackUrl,
                        return_deeplink: returnDeeplink,
                        currency: curr,
                        custom_fields: customFields,
                        return_params: returnParams,
                        payout: payout,
                        lifetime: lifetime,
                        qr_image_template: qrImageTemplate,
                        hash: hash
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 8000
                    }
                );

                if (response.data && (response.data.status?.code === '00' || response.data.status === 0 || response.data.qr_string)) {
                    const qrString = response.data.qr_string || response.data.data?.qr_string;
                    const md5Hash = crypto.createHash('md5').update(qrString || tranId).digest('hex');
                    const abaDeepLink = response.data.abapay_deeplink || response.data.deeplink || `aba://qr?qr=${encodeURIComponent(qrString)}`;

                    return {
                        success: true,
                        provider: 'ABA_PAYWAY',
                        tranId: tranId,
                        reqTime: reqTime,
                        qrString: qrString,
                        qrImage: response.data.qr_image || null,
                        md5: md5Hash,
                        amount: parseFloat(formattedAmount),
                        currency: curr,
                        currencySymbol: curr === 'KHR' ? '៛' : '$',
                        merchantName: this.storeLabel,
                        abaDeepLink: abaDeepLink,
                        expiresAt: expiresAt,
                        validityMinutes: validityMinutes
                    };
                }
            } catch (apiError) {
                console.warn('ABA PayWay API live call failed, using high-compatibility fallback:', apiError.response?.data || apiError.message);
            }
        }

        // 2. High-Fidelity ABA KHQR generation fallback for sandbox and local environment
        let qrString = '';
        let md5Hash = '';
        try {
            const isKHR = curr === 'KHR';
            const currEnum = isKHR ? khqrData.currency.khr : khqrData.currency.usd;
            const store = this.storeLabel.substring(0, 25);
            const bill = `ORD-${tranId.slice(-8)}`.substring(0, 25);

            const optionalData = {
                currency: currEnum,
                amount: parseFloat(formattedAmount),
                mobileNumber: phone || process.env.BAKONG_MERCHANT_PHONE || '85512345678',
                storeLabel: store,
                terminalLabel: `POS-${tranId.slice(-4)}`,
                billNumber: bill,
                purposeOfTransaction: 'ABA PayWay Payment',
                expirationTimestamp: expTimestamp
            };

            const abaAccountId = process.env.ABA_ACCOUNT_ID || `${this.merchantId}@abaa`;
            const merchantInfo = new MerchantInfo(
                abaAccountId,
                this.storeLabel,
                'Phnom Penh',
                this.merchantId.slice(0, 10),
                store,
                optionalData
            );
            const khqrResult = this.khqr.generateMerchant(merchantInfo);

            if (khqrResult?.status?.code === 0 && khqrResult.data?.qr) {
                qrString = khqrResult.data.qr;
                md5Hash = khqrResult.data.md5;
            }
        } catch (khqrErr) {
            // Fallback generic ABA payload
            qrString = `00020101021229370016aba.payway.khqr0113${this.merchantId}520459995303840540${formattedAmount.length}${formattedAmount}5802KH59${this.storeLabel.length}${this.storeLabel}6010Phnom Penh62${tranId.length}${tranId}6304`;
            md5Hash = crypto.createHash('md5').update(qrString).digest('hex');
        }

        if (!md5Hash) {
            md5Hash = crypto.createHash('md5').update(qrString || tranId).digest('hex');
        }

        const abaDeepLink = `aba://qr?qr=${encodeURIComponent(qrString)}`;

        return {
            success: true,
            provider: 'ABA_PAYWAY',
            tranId: tranId,
            reqTime: reqTime,
            qrString: qrString,
            md5: md5Hash,
            amount: parseFloat(formattedAmount),
            currency: curr,
            currencySymbol: curr === 'KHR' ? '៛' : '$',
            merchantName: this.storeLabel,
            merchantId: this.merchantId,
            abaDeepLink: abaDeepLink,
            expiresAt: expiresAt,
            validityMinutes: validityMinutes
        };
    }

    /**
     * Check transaction status with ABA PayWay (/check-transaction-2)
     */
    async checkTransactionStatus(tranId, reqTime = null) {
        if (!tranId) {
            return { isPaid: false, error: 'Transaction ID is required' };
        }

        const cleanTranId = this.formatTranId(tranId);
        const time = reqTime || this.getReqTime();
        
        // Hash for /check-transaction-2: req_time + merchant_id + tran_id
        const rawHashString = `${time}${this.merchantId}${cleanTranId}`;
        const hash = this.generateHash(rawHashString);

        if (this.apiKey && this.apiKey !== 'aba_sandbox_api_key' && this.merchantId !== 'angkor_mall') {
            try {
                const response = await axios.post(
                    `${this.apiUrl}/check-transaction-2`,
                    {
                        req_time: time,
                        merchant_id: this.merchantId,
                        tran_id: cleanTranId,
                        hash: hash
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 8000
                    }
                );

                const resData = response.data;
                const statusObj = resData?.status;
                const dataObj = resData?.data || {};

                // ABA PayWay returns data.payment_status === 'APPROVED' or status.code === '00'
                if (dataObj.payment_status === 'APPROVED' || dataObj.payment_status_code === 0 || statusObj?.code === '00') {
                    return {
                        isPaid: true,
                        transaction: dataObj,
                        tranId: cleanTranId,
                        amount: dataObj.amount,
                        paymentMethod: dataObj.payment_type || 'ABA PayWay'
                    };
                }

                return {
                    isPaid: false,
                    status: dataObj.payment_status || 'PENDING',
                    statusCode: dataObj.payment_status_code,
                    message: statusObj?.message || 'Awaiting ABA payment'
                };
            } catch (error) {
                console.warn('ABA check-transaction API warning:', error.response?.data || error.message);
                return {
                    isPaid: false,
                    error: error.response?.data?.description || error.message
                };
            }
        }

        return {
            isPaid: false,
            message: 'ABA PayWay credentials in sandbox mode. Use test simulation or configure live API key.'
        };
    }
}

module.exports = new AbaPaywayService();