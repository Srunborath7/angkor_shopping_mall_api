const axios = require('axios');

class AIProviderService {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY || null;
        this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        this.geminiApiKey = process.env.GEMINI_API_KEY || null;
        this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    }

    isAIAvailable() {
        return !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
    }

    /**
     * Call OpenAI Chat Completion API
     */
    async callOpenAI(messages, options = {}) {
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY || this.openaiApiKey;
        if (!apiKey) {
            return null;
        }

        try {
            const model = options.model || process.env.OPENAI_MODEL || this.openaiModel || 'gpt-4o-mini';
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    messages: messages,
                    temperature: options.temperature !== undefined ? options.temperature : 0.7,
                    max_tokens: options.max_tokens || 800,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    timeout: 15000
                }
            );

            const reply = response.data?.choices?.[0]?.message?.content;
            return reply ? reply.trim() : null;
        } catch (error) {
            const errData = error.response?.data?.error || error.response?.data || error.message;
            if (errData?.code === 'insufficient_quota' || errData?.type === 'insufficient_quota') {
                console.warn('[AIProviderService] OpenAI Quota Exceeded (insufficient_quota). Falling back to Gemini or default engine.');
            } else {
                console.warn('[AIProviderService] OpenAI API Error:', errData?.message || errData || error.message);
            }
            return null;
        }
    }

    /**
     * Call Google Gemini API (if configured)
     */
    async callGemini(promptText, options = {}) {
        const apiKey = process.env.GEMINI_API_KEY || this.geminiApiKey;
        if (!apiKey) return null;

        const model = options.model || process.env.GEMINI_MODEL || this.geminiModel || 'gemini-1.5-flash';

        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    contents: [
                        {
                            parts: [{ text: promptText }]
                        }
                    ]
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 15000
                }
            );

            const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            return candidate ? candidate.trim() : null;
        } catch (err) {
            console.warn('[AIProviderService] Gemini API Error:', err.response?.data?.error?.message || err.message);
            return null;
        }
    }

    /**
     * Analyze Customer Support Inquiry (Sentiment & Summary)
     * @param {string} messageText
     */
    async analyzeInquiry(messageText = '') {
        const text = (messageText || '').trim();
        if (!text) {
            return { sentiment: 'neutral', summary: 'Empty message' };
        }

        // Try AI first
        if (this.isAIAvailable()) {
            const prompt = `Analyze the following customer support message from an e-commerce store.
Message: "${text}"

Respond in exact JSON format ONLY:
{
  "sentiment": "positive" | "negative" | "neutral" | "urgent",
  "summary": "Short 1-sentence summary of customer issue"
}`;

            try {
                let aiResult = await this.callOpenAI([
                    { role: 'system', content: 'You are a customer support analyzer. Output only valid JSON.' },
                    { role: 'user', content: prompt }
                ], { temperature: 0.1 });

                if (!aiResult && process.env.GEMINI_API_KEY) {
                    aiResult = await this.callGemini(prompt);
                }

                if (aiResult) {
                    const cleanJson = aiResult.replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    return {
                        sentiment: ['positive', 'negative', 'neutral', 'urgent'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
                        summary: parsed.summary || text.slice(0, 100)
                    };
                }
            } catch (e) {
                // Ignore and fall back to heuristic
            }
        }

        // Heuristic Rule-Based Fallback
        const lower = text.toLowerCase();
        let sentiment = 'neutral';
        if (lower.includes('urgent') || lower.includes('broken') || lower.includes('scam') || lower.includes('fraud') || lower.includes('refund immediately')) {
            sentiment = 'urgent';
        } else if (lower.includes('bad') || lower.includes('wrong') || lower.includes('delay') || lower.includes('missing') || lower.includes('cancel') || lower.includes('fail')) {
            sentiment = 'negative';
        } else if (lower.includes('thank') || lower.includes('great') || lower.includes('love') || lower.includes('good') || lower.includes('awesome') || lower.includes('best')) {
            sentiment = 'positive';
        }

        return {
            sentiment,
            summary: text.length > 80 ? text.slice(0, 80) + '...' : text
        };
    }

    /**
     * Generate an ultra-smart, personalized AI response for customers
     * @param {string} userMessage
     * @param {object} storeContext - { customerName, customerEmail, orders, products, language, page }
     */
    async generateChatbotAIResponse(userMessage, storeContext = {}) {
        const customerName = storeContext.customerName || 'Valued Customer';
        const isKhmer = storeContext.language === 'km' || /[\u1780-\u17FF]/.test(userMessage);

        const systemPrompt = `You are the official smart AI shopping assistant for "Angkor Shopping Mall" (Cambodia's premier electronics & tech shopping platform).

Customer Profile:
- Name: ${customerName}
- Status: ${storeContext.customerName ? 'Logged-in Member' : 'Guest Visitor'}
- Target Response Language: ${isKhmer ? 'Khmer with natural polite Cambodian tone' : 'English with friendly, professional tone'}

Store Information:
- Location: Phnom Penh Central, Cambodia
- Payment: Bakong KHQR (ABA, ACLEDA, Wing, Canadia), Credit/Debit Card, Cash on Delivery (COD).
- Shipping: Express 1-2 days in Phnom Penh, 2-4 days provincial delivery across all Cambodia.
- Official Warranty: 1-Year Manufacturer Warranty on all brand-new devices + 7-Day instant replacement for defects.
- Trade-In Program: Customers can trade in their used phone or laptop for instant checkout discount credits at /trading.
- Flash Sales: Daily discounted deals up to 50% off.

Live Database Context:
${JSON.stringify({
    customerRecentOrders: storeContext.orders || [],
    matchingProductsInStore: storeContext.products || [],
    currentPage: storeContext.page || '/'
}, null, 2)}

Instructions:
1. Greet the customer warmly using their name (${customerName}) whenever appropriate.
2. If the user asks in Khmer or your target language is Khmer, ALWAYS answer in fluent, natural Khmer. If in English, answer in English.
3. If they ask about products, recommend specific items from the database context with prices in USD ($).
4. If they ask about their orders, give them exact status details from their order history context.
5. Use clean markdown formatting (bolding, bullet points) with modern emojis.
6. Keep replies concise, helpful, and under 150 words.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        // 1. Try OpenAI
        let aiReply = await this.callOpenAI(messages);

        // 2. Try Gemini fallback
        if (!aiReply && process.env.GEMINI_API_KEY) {
            aiReply = await this.callGemini(`${systemPrompt}\n\nUser message: ${userMessage}`);
        }

        return aiReply;
    }

    /**
     * Generate admin draft reply
     */
    async generateAdminDraftReply(customerMessage, customerInfo = {}, customInstruction = '') {
        const systemPrompt = `You are a senior customer support manager at Angkor Shopping Mall (Cambodia).
Generate a professional, polite, and helpful email/chat response to a customer inquiry.

Customer Name: ${customerInfo.sender_name || 'Valued Customer'}
Customer Inquiry: "${customerMessage}"
Subject: ${customerInfo.subject || 'Customer Support'}
Additional Instruction: ${customInstruction || 'Be polite, resolve the issue or provide clear next steps, and invite them to reach out if they need further assistance.'}

Store Policies:
- Phnom Penh Express Shipping: 1-2 days. Provincial: 2-4 days.
- Payment: ABA KHQR (Bakong), Wing, Cards, COD.
- Warranty: 1-year official warranty, 7-day return.
- Hotline: +855 23 888 999 (8AM - 9PM).

Write the complete draft message for the admin to review and send directly:`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please write a response to this customer inquiry: "${customerMessage}"` }
        ];

        let aiResponse = await this.callOpenAI(messages, { temperature: 0.6 });

        if (!aiResponse && process.env.GEMINI_API_KEY) {
            aiResponse = await this.callGemini(`${systemPrompt}\n\nCustomer inquiry: "${customerMessage}"`);
        }

        if (aiResponse) {
            return aiResponse;
        }

        return `Dear ${customerInfo.sender_name || 'Customer'},\n\nThank you for reaching out to Angkor Shopping Mall support regarding "${customerInfo.subject || 'your inquiry'}".\n\nWe have received your message and are happy to assist you. Our support team is actively reviewing your request and will ensure you receive prompt assistance.\n\nIf you need immediate assistance, you can also contact our hotline directly at +855 23 888 999 (8:00 AM - 9:00 PM).\n\nWarm regards,\nAngkor Shopping Mall Customer Care Team`;
    }
}

module.exports = new AIProviderService();
