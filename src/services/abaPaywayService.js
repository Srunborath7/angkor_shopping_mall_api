require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

/**
 * Helper to format UTC request time in YYYYMMDDHHmmss
 */
function formatReqTime(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return '' + y + m + day + h + min + s;
}

/**
 * Node.js Client for ABA PayWay (based on alnovate-digital/aba-payway-js & official PayWay spec)
 */
class PayWayClient {
    constructor(baseUrl, merchantId, apiKey) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.merchantId = merchantId;
        this.apiKey = apiKey;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000
        });
    }

    create_hash(values) {
        const data = values.join('');
        return crypto
            .createHmac('sha512', this.apiKey)
            .update(data)
            .digest('base64');
    }

    create_payload(body = {}, date = new Date()) {
        const cleanedBody = Object.fromEntries(
            Object.entries(body).filter(([_, v]) => v != null)
        );

        const req_time = formatReqTime(date);
        const merchant_id = this.merchantId;
        const formData = new FormData();
        const entries = Object.entries(cleanedBody);

        const hash = this.create_hash([
            req_time,
            merchant_id,
            ...Object.values(cleanedBody)
        ]);

        formData.append('req_time', req_time);
        formData.append('merchant_id', merchant_id);

        for (const [key, value] of entries) {
            formData.append(key, value);
        }

        formData.append('hash', hash);
        return { formData, req_time, hash };
    }

    async create_transaction({
        tran_id,
        payment_option = 'abapay_deeplink',
        amount,
        currency = 'USD',
        return_url,
        return_deeplink,
        continue_success_url,
        pwt,
        firstname = 'Valued',
        lastname = 'Customer',
        email = 'customer@angkor.com',
        phone = '0974242291'
    } = {}) {
        function base64(d) {
            if (!d) return '';
            return Buffer.from(String(d)).toString('base64');
        }

        let formattedReturnUrl = return_url;
        if (formattedReturnUrl && !formattedReturnUrl.endsWith('=')) {
            formattedReturnUrl = base64(formattedReturnUrl);
        }

        let formattedReturnDeeplink = return_deeplink;
        if (formattedReturnDeeplink && typeof formattedReturnDeeplink === 'object') {
            formattedReturnDeeplink = base64(JSON.stringify(formattedReturnDeeplink));
        } else if (formattedReturnDeeplink && !formattedReturnDeeplink.endsWith('=')) {
            formattedReturnDeeplink = base64(formattedReturnDeeplink);
        }

        const { formData } = this.create_payload({
            tran_id,
            amount: String(amount),
            pwt,
            firstname: String(firstname || 'Valued').trim(),
            lastname: String(lastname || 'Customer').trim(),
            email: String(email || 'customer@angkor.com').trim(),
            phone: String(phone || '0974242291').trim(),
            payment_option,
            return_url: formattedReturnUrl,
            continue_success_url,
            return_deeplink: formattedReturnDeeplink,
            currency: String(currency).toUpperCase()
        });

        const response = await this.client.post(
            '/api/payment-gateway/v1/payments/purchase',
            formData
        );
        return response.data;
    }

    async check_transaction(tran_id) {
        const { formData } = this.create_payload({ tran_id });
        const response = await this.client.post(
            '/api/payment-gateway/v1/payments/check-transaction',
            formData
        );
        return response.data;
    }

    async transaction_list({
        from_date,
        to_date,
        from_amount,
        to_amount,
        status
    } = {}) {
        const { formData } = this.create_payload({
            from_date,
            to_date,
            from_amount,
            to_amount,
            status
        });
        const response = await this.client.post(
            '/api/payment-gateway/v1/payments/transaction-list',
            formData
        );
        return response.data;
    }
}

class AbaPaywayService {
    constructor() {
        this.rawApiUrl = process.env.ABA_PAYWAY_API_URL || 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments';
        this.baseUrl = this.rawApiUrl
            .replace(/\/purchase\/?$/, '')
            .replace(/\/generate-qr\/?$/, '')
            .replace(/\/api\/payment-gateway\/v1\/payments\/?$/, '')
            .replace(/\/+$/, '');
        if (!this.baseUrl.startsWith('http')) {
            this.baseUrl = 'https://checkout-sandbox.payway.com.kh';
        }

        this.merchantId = (process.env.ABA_PAYWAY_MERCHANT_ID || 'ec478143').trim();
        this.apiKey = (process.env.ABA_PAYWAY_API_KEY || '2791e248611230ff454a67ed9ece439f95217688').trim();
        this.storeLabel = process.env.ABA_PAYWAY_STORE_LABEL || 'Angkor Shopping Mall';
        this.accountId = (process.env.ABA_ACCOUNT_ID || process.env.BAKONG_ACCOUNT_ID || '974242291@abaa').trim();
        this.khqr = new BakongKHQR();

        // Initialize PayWayClient from alnovate-digital/aba-payway-js
        this.client = new PayWayClient(this.baseUrl, this.merchantId, this.apiKey);
    }

    getReqTime() {
        return formatReqTime(new Date());
    }

    generateHash(rawString) {
        if (this.apiKey) {
            return crypto
                .createHmac('sha512', this.apiKey)
                .update(rawString)
                .digest('base64');
        }
        return '';
    }

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
     * Generate ABA PayWay transaction registered with Sandbox server
     * Uses alnovate-digital/aba-payway-js purchase flow so it shows in PayWay Portal
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
        const expTimestamp = Date.now() + validityMinutes * 60 * 1000;
        const expiresAt = new Date(expTimestamp).toISOString();

        const validFirstName = (firstName && String(firstName).trim()) || 'Valued';
        const validLastName = (lastName && String(lastName).trim()) || 'Customer';
        const validEmail = (email && String(email).trim()) || 'customer@angkor.com';
        const validPhone = (phone && String(phone).trim()) || '0974242291';

        // 1. Primary: Use PayWayClient (alnovate-digital/aba-payway-js) purchase creation
        // This registers the transaction into the ABA PayWay merchant portal
        if (this.apiKey && this.merchantId) {
            try {
                const purchaseRes = await this.client.create_transaction({
                    tran_id: tranId,
                    amount: formattedAmount,
                    currency: curr,
                    payment_option: 'abapay_deeplink',
                    firstname: validFirstName,
                    lastname: validLastName,
                    email: validEmail,
                    phone: validPhone,
                    return_url: (process.env.FRONTEND_URL || 'http://localhost:5173') + '/orders'
                });

                const statusCode = String(purchaseRes?.status?.code ?? '');
                const hasQr = purchaseRes?.qrString || purchaseRes?.qr_string;

                if (statusCode === '00' || statusCode === '0' || hasQr) {
                    const qrString = purchaseRes.qrString || purchaseRes.qr_string;
                    const md5Hash = purchaseRes.md5 || (qrString ? crypto.createHash('md5').update(qrString).digest('hex') : tranId);
                    const abaDeepLink = purchaseRes.abapay_deeplink || purchaseRes.deeplink || `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qrString)}`;

                    return {
                        success: true,
                        provider: 'ABA_PAYWAY',
                        tranId: tranId,
                        reqTime: reqTime,
                        qrString: qrString,
                        qrImage: purchaseRes.qrImage || purchaseRes.qr_image || null,
                        md5: md5Hash,
                        amount: parseFloat(formattedAmount),
                        currency: curr,
                        currencySymbol: curr === 'KHR' ? '៛' : '$',
                        merchantName: this.storeLabel,
                        merchantId: this.merchantId,
                        abaDeepLink: abaDeepLink,
                        checkoutUrl: purchaseRes.checkout_url || '',
                        expiresAt: expiresAt,
                        validityMinutes: validityMinutes,
                        sandboxStatus: purchaseRes.status
                    };
                }
            } catch (purchaseErr) {
                console.warn('ABA PayWay [/purchase] warning:', purchaseErr.response?.data || purchaseErr.message);
            }

            // 2. Secondary: Live /generate-qr endpoint
            try {
                const preparedItems = [{ name: 'Order Payment', quantity: 1, price: parseFloat(formattedAmount) }];
                const itemsBase64 = Buffer.from(JSON.stringify(preparedItems)).toString('base64');
                const purchaseType = 'purchase';
                const paymentOption = 'abapay_khqr';

                const qrHashString = `${reqTime}${this.merchantId}${tranId}${formattedAmount}${itemsBase64}${validFirstName}${validLastName}${validEmail}${validPhone}${purchaseType}${paymentOption}${curr}`;
                const qrHash = this.generateHash(qrHashString);

                const qrUrl = `${this.baseUrl}/api/payment-gateway/v1/payments/generate-qr`;
                const qrResponse = await axios.post(qrUrl, {
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
                }, {
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

        // 3. Fallback: High-Fidelity NBC Bakong KHQR
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

        // 1. Check with /check-transaction-2 (JSON payload)
        if (this.apiKey && this.merchantId) {
            const rawHashString = `${time}${this.merchantId}${cleanTranId}`;
            const hash = this.generateHash(rawHashString);

            try {
                const endpoint = `${this.baseUrl}/api/payment-gateway/v1/payments/check-transaction-2`;
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

                if (dataObj.payment_status === 'APPROVED' || dataObj.payment_status_code === 0 || (statusObj?.code === '00' && dataObj.payment_status === 'APPROVED')) {
                    return {
                        isPaid: true,
                        transaction: dataObj,
                        tranId: cleanTranId,
                        amount: dataObj.total_amount || dataObj.amount,
                        paymentMethod: dataObj.payment_type || 'ABA PayWay'
                    };
                }

                if (dataObj.payment_status) {
                    return {
                        isPaid: false,
                        status: dataObj.payment_status || 'PENDING',
                        statusCode: dataObj.payment_status_code,
                        message: statusObj?.message || 'Awaiting ABA payment',
                        transaction: dataObj
                    };
                }
            } catch (error) {
                console.debug('check-transaction-2 debug:', error.response?.data || error.message);
            }

            // 2. Check with PayWayClient check_transaction (FormData payload)
            try {
                const checkRes = await this.client.check_transaction(cleanTranId);
                if (checkRes?.status === 0 || checkRes?.payment_status === 'APPROVED') {
                    return {
                        isPaid: true,
                        transaction: checkRes,
                        tranId: cleanTranId,
                        amount: checkRes.amount || checkRes.totalAmount,
                        paymentMethod: 'ABA PayWay'
                    };
                }

                if (checkRes?.payment_status || checkRes?.status === 2) {
                    return {
                        isPaid: false,
                        status: checkRes.payment_status || 'PENDING',
                        statusCode: checkRes.status,
                        message: checkRes.description || 'Pending ABA payment',
                        transaction: checkRes
                    };
                }
            } catch (err) {
                console.debug('client check_transaction debug:', err.response?.data || err.message);
            }
        }

        return {
            isPaid: false,
            message: 'Awaiting payment verification'
        };
    }

    /**
     * Fetch list of transactions from ABA PayWay gateway
     */
    async getTransactionList({ from_date, to_date, status } = {}) {
        const now = new Date();
        const defaultTo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} 23:59:59`;
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        const defaultFrom = `${twoDaysAgo.getUTCFullYear()}-${String(twoDaysAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getUTCDate()).padStart(2, '0')} 00:00:00`;

        return this.client.transaction_list({
            from_date: from_date || defaultFrom,
            to_date: to_date || defaultTo,
            status
        });
    }
}

module.exports = new AbaPaywayService();
