const crypto = require('crypto');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo, MerchantInfo } = require('bakong-khqr');

class AbaPaywayService {
    constructor() {
        this.rawApiUrl = process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments';
        // Normalize base URL (strip trailing /purchase or /generate-qr if present)
        this.baseUrl = this.rawApiUrl.replace(/\/purchase\/?$/, '').replace(/\/generate-qr\/?$/, '').replace(/\/+$/, '');
        this.merchantId = process.env.ABA_PAYWAY_MERCHANT_ID || 'e23444444';
        this.apiKey = process.env.ABA_PAYWAY_API_KEY || 'bff7e9c4570.............';
        this.rsaPrivateKey = process.env.ABA_PAYWAY_RSA_PRIVATE_KEY || '';
        this.rsaPublicKey = process.env.ABA_PAYWAY_RSA_PUBLIC_KEY || '';
        this.storeLabel = process.env.ABA_PAYWAY_STORE_LABEL || 'Angkor Shopping Mall';
        this.khqr = new BakongKHQR();
    }

    /**
     * Generate request time in YYYYMMDDHHmmss format
     */
    getReqTime() {
        const now = new Date();
        const y = now.getUTCFullYear();
        const m = String(now.getUTCMonth() + 1).padStart(2, '0');
        const d = String(now.getUTCDate()).padStart(2, '0');
        const h = String(now.getUTCHours()).padStart(2, '0');
        const min = String(now.getUTCMinutes()).padStart(2, '0');
        const s = String(now.getUTCSeconds()).padStart(2, '0');
        return `${y}${m}${d}${h}${min}${s}`;
    }

    /**
     * Generate HMAC-SHA512 hash in Base64 or RSA signature for ABA PayWay request signing
     */
    generateHash(rawString) {
        if (this.rsaPrivateKey && this.rsaPrivateKey.includes('BEGIN') && this.rsaPrivateKey.length > 200) {
            try {
                const sign = crypto.createSign('SHA512');
                sign.update(rawString);
                sign.end();
                return sign.sign(this.rsaPrivateKey, 'base64');
            } catch (rsaErr) {
                // Fall back to HMAC-SHA512
            }
        }
        if (this.apiKey) {
            return crypto
                .createHmac('sha512', this.apiKey)
                .update(rawString)
                .digest('base64');
        }
        return '';
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
        
        // Auto-configure callback URL from APP_URL if not explicitly set
        const appUrl = process.env.APP_URL || process.env.BASE_URL || '';
        const envCallbackUrl = process.env.ABA_PAYWAY_CALLBACK_URL || '';
        const callbackUrl = envCallbackUrl || (appUrl ? `${appUrl}/api/payments/aba/callback` : '');
        
        const returnDeeplink = process.env.ABA_PAYWAY_RETURN_DEEPLINK || '';
        
        // Include order details in return_params for callback processing
        const returnParams = orderId ? JSON.stringify({
            order_id: String(orderId),
            amount: formattedAmount,
            currency: curr
        }) : '';
        
        const customFields = '';
        const payout = '';
        const lifetime = String(validityMinutes);
        const qrImageTemplate = 'template1';

        // Hash concatenation string for ABA PayWay /generate-qr & /purchase endpoints
        const rawHashString = `${reqTime}${this.merchantId}${tranId}${formattedAmount}${itemsBase64}${firstName}${lastName}${email}${phone}${purchaseType}${paymentOption}${callbackUrl}${returnDeeplink}${curr}${customFields}${returnParams}${payout}${lifetime}${qrImageTemplate}`;
        const hash = this.generateHash(rawHashString);

        const expTimestamp = Date.now() + validityMinutes * 60 * 1000;
        const expiresAt = new Date(expTimestamp).toISOString();

        const payload = {
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
        };

        // 1. Attempt live ABA PayWay API if credentials are provided
        if (this.apiKey && this.apiKey !== 'aba_sandbox_api_key' && this.merchantId !== 'angkor_mall') {
            const candidateUrls = [
                `${this.baseUrl}/purchase`,
                `${this.baseUrl}/generate-qr`,
                this.rawApiUrl
            ];

            for (const targetUrl of [...new Set(candidateUrls)]) {
                try {
                    const response = await axios.post(targetUrl, payload, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    });

                    const resData = response.data;
                    if (resData && (resData.status?.code === '00' || resData.status === 0 || resData.qr_string || resData.data?.qr_string)) {
                        const qrString = resData.qr_string || resData.data?.qr_string;
                        const md5Hash = resData.md5 || (qrString ? crypto.createHash('md5').update(qrString).digest('hex') : tranId);
                        const abaDeepLink = resData.abapay_deeplink || resData.deeplink || resData.app_checkout_url || (qrString ? `aba://qr?qr=${encodeURIComponent(qrString)}` : '');
                        const checkoutUrl = resData.checkout_url || resData.data?.checkout_url || '';

                        return {
                            success: true,
                            provider: 'ABA_PAYWAY',
                            tranId: tranId,
                            reqTime: reqTime,
                            qrString: qrString,
                            qrImage: resData.qr_image || resData.data?.qr_image || null,
                            md5: md5Hash,
                            amount: parseFloat(formattedAmount),
                            currency: curr,
                            currencySymbol: curr === 'KHR' ? '៛' : '$',
                            merchantName: this.storeLabel,
                            abaDeepLink: abaDeepLink,
                            checkoutUrl: checkoutUrl,
                            expiresAt: expiresAt,
                            validityMinutes: validityMinutes
                        };
                    }
                } catch (apiError) {
                    console.warn(`ABA PayWay API [${targetUrl}] notice:`, apiError.response?.data || apiError.message);
                }
            }
        }

        // 2. High-Fidelity ABA KHQR generation fallback for sandbox / local development
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
     * Check transaction status with ABA PayWay (/check-transaction-2 or /check-transaction-status)
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
            const checkEndpoints = [
                `${this.baseUrl}/check-transaction-2`,
                `${this.baseUrl}/check-transaction`
            ];

            for (const endpoint of [...new Set(checkEndpoints)]) {
                try {
                    const response = await axios.post(
                        endpoint,
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

                    if (dataObj.payment_status === 'APPROVED' || dataObj.payment_status_code === 0 || statusObj?.code === '00' || resData?.status === '0' || resData?.status === 0) {
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
                    console.warn(`ABA check status [${endpoint}] warning:`, error.response?.data || error.message);
                }
            }
        }

        return {
            isPaid: false,
            message: 'ABA PayWay credentials in sandbox mode. Use test simulation or configure live API key.'
        };
    }
}

module.exports = new AbaPaywayService();
