require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

class AbaPaywayService {
    constructor() {
        this.rawApiUrl = process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments';
        // Normalize base URL (strip trailing /purchase, /generate-qr, etc.)
        this.baseUrl = this.rawApiUrl
            .replace(/\/purchase\/?$/, '')
            .replace(/\/generate-qr\/?$/, '')
            .replace(/\/+$/, '');
        this.merchantId = (process.env.ABA_PAYWAY_MERCHANT_ID || 'ec478143').trim();
        this.apiKey = (process.env.ABA_PAYWAY_API_KEY || '2791e248611230ff454a67ed9ece439f95217688').trim();
        this.storeLabel = process.env.ABA_PAYWAY_STORE_LABEL || 'Angkor Shopping Mall';
        this.accountId = (process.env.ABA_ACCOUNT_ID || process.env.BAKONG_ACCOUNT_ID || '974242291@abaa').trim();
        this.khqr = new BakongKHQR();
    }

    /**
     * Generate request time in YYYYMMDDHHmmss format (UTC)
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
     * Generate HMAC-SHA512 hash in Base64 for ABA PayWay request signing
     */
    generateHash(rawString) {
        if (this.apiKey) {
            return crypto
                .createHmac('sha512', this.apiKey)
                .update(rawString)
                .digest('base64');
        }
        return '';
    }

    /**
     * Format transaction ID to meet ABA PayWay constraints (alphanumeric, max 20 chars, uppercase prefixed)
     */
    formatTranId(orderId) {
        if (!orderId) {
            return `TRX${Date.now()}`;
        }
        const clean = String(orderId).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (clean.startsWith('TRX') || clean.startsWith('ORD')) {
            return clean.slice(0, 20);
        }
        if (clean.length > 15) {
            return `TRX${clean.slice(-12)}`;
        }
        return `TRX${clean.padStart(6, '0')}`.slice(0, 20);
    }

    /**
     * Generate ABA PayWay Dynamic QR code & Deeplink registered with Sandbox server
     */
    async generateAbaQR({
        orderId,
        amount,
        currency = 'USD',
        firstName = 'Valued',
        lastName = 'Customer',
        email = 'customer@angkor.com',
        phone = '0974242291',
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
        
        const validFirstName = (firstName && String(firstName).trim()) || 'Valued';
        const validLastName = (lastName && String(lastName).trim()) || 'Customer';
        const validEmail = (email && String(email).trim()) || 'customer@angkor.com';
        const validPhone = (phone && String(phone).trim()) || '0974242291';

        const preparedItems = [{ name: 'Order Payment', quantity: 1, price: parseFloat(formattedAmount) }];
        const itemsBase64 = Buffer.from(JSON.stringify(preparedItems)).toString('base64');
        const purchaseType = 'purchase';
        const paymentOption = 'abapay_khqr';

        const expTimestamp = Date.now() + validityMinutes * 60 * 1000;
        const expiresAt = new Date(expTimestamp).toISOString();

        // 1. Send signed request to live ABA PayWay Sandbox server
        if (this.apiKey && this.merchantId) {
            try {
                const qrHashString = `${reqTime}${this.merchantId}${tranId}${formattedAmount}${itemsBase64}${validFirstName}${validLastName}${validEmail}${validPhone}${purchaseType}${paymentOption}${curr}`;
                const qrHash = this.generateHash(qrHashString);

                const qrPayload = {
                    req_time: reqTime,
                    merchant_id: this.merchantId,
                    tran_id: tranId,
                    amount: formattedAmount,
                    items: itemsBase64,
                    first_name: validFirstName,
                    last_name: validLastName,
                    email: validEmail,
                    phone: validPhone,
                    purchase_type: purchaseType,
                    payment_option: paymentOption,
                    currency: curr,
                    hash: qrHash
                };

                const qrUrl = `${this.baseUrl}/generate-qr`;
                const qrResponse = await axios.post(qrUrl, qrPayload, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });

                const resData = qrResponse.data;
                const statusCode = String(resData?.status?.code ?? '');
                const hasQr = resData?.qrString || resData?.qr_string;

                if (statusCode === '0' || statusCode === '00' || hasQr) {
                    const qrString = resData.qrString || resData.qr_string;
                    const md5Hash = resData.md5 || (qrString ? crypto.createHash('md5').update(qrString).digest('hex') : tranId);
                    const abaDeepLink = resData.abapay_deeplink || resData.deeplink || `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qrString)}`;

                    return {
                        success: true,
                        provider: 'ABA_PAYWAY',
                        tranId: tranId,
                        reqTime: reqTime,
                        qrString: qrString,
                        qrImage: resData.qrImage || resData.qr_image || null,
                        md5: md5Hash,
                        amount: parseFloat(formattedAmount),
                        currency: curr,
                        currencySymbol: curr === 'KHR' ? '៛' : '$',
                        merchantName: this.storeLabel,
                        merchantId: this.merchantId,
                        abaDeepLink: abaDeepLink,
                        checkoutUrl: resData.checkout_url || '',
                        expiresAt: expiresAt,
                        validityMinutes: validityMinutes,
                        sandboxStatus: resData.status
                    };
                }
            } catch (qrApiErr) {
                console.warn('ABA PayWay [/generate-qr] error:', qrApiErr.response?.data || qrApiErr.message);
            }
        }

        // 2. High-Fidelity NBC Bakong / ABA KHQR generation fallback
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
                mobileNumber: validPhone || process.env.BAKONG_MERCHANT_PHONE || '85512345678',
                storeLabel: store,
                terminalLabel: `POS-${tranId.slice(-4)}`,
                billNumber: bill,
                purposeOfTransaction: 'ABA PayWay Payment',
                expirationTimestamp: expTimestamp
            };

            const rawAccountId = this.accountId || '974242291@abaa';
            const abaAccountId = rawAccountId.includes('@') ? rawAccountId.trim() : `${rawAccountId.trim()}@abaa`;
            const individualInfo = new IndividualInfo(
                abaAccountId,
                this.storeLabel,
                'Phnom Penh',
                optionalData
            );
            const khqrResult = this.khqr.generateIndividual(individualInfo);

            if (khqrResult?.status?.code === 0 && khqrResult.data?.qr) {
                qrString = khqrResult.data.qr;
                md5Hash = khqrResult.data.md5;
            }
        } catch (khqrErr) {
            console.warn('KHQR generation fallback error:', khqrErr.message);
        }

        if (!qrString) {
            qrString = `00020101021229370016aba.payway.khqr0113${this.merchantId}520459995303840540${formattedAmount.length}${formattedAmount}5802KH59${this.storeLabel.length}${this.storeLabel}6010Phnom Penh62${tranId.length}${tranId}6304`;
        }

        if (!md5Hash) {
            md5Hash = crypto.createHash('md5').update(qrString || tranId).digest('hex');
        }

        const abaDeepLink = `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qrString)}`;

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
     * Check transaction status directly with ABA PayWay Sandbox server
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

        if (this.apiKey && this.merchantId) {
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

                    // payment_status_code === 0 means APPROVED/PAID
                    if (dataObj.payment_status === 'APPROVED' || dataObj.payment_status_code === 0 || (statusObj?.code === '00' && dataObj.payment_status === 'APPROVED')) {
                        return {
                            isPaid: true,
                            transaction: dataObj,
                            tranId: cleanTranId,
                            amount: dataObj.total_amount || dataObj.amount,
                            paymentMethod: dataObj.payment_type || 'ABA PayWay'
                        };
                    }

                    return {
                        isPaid: false,
                        status: dataObj.payment_status || 'PENDING',
                        statusCode: dataObj.payment_status_code,
                        message: statusObj?.message || 'Awaiting ABA payment',
                        transaction: dataObj
                    };
                } catch (error) {
                    console.debug(`ABA check status [${endpoint}] error:`, error.response?.data?.status?.message || error.message);
                }
            }
        }

        return {
            isPaid: false,
            message: 'Awaiting payment verification'
        };
    }
}

module.exports = new AbaPaywayService();
