const axios = require('axios');

class AIProviderService {
    constructor() {
        this.openaiApiKey = process.env.OPENAI_API_KEY || null;
        this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        this.geminiApiKey = process.env.GEMINI_API_KEY || null;
    }

    /**
     * Check if any AI provider is available
     */
    isAIAvailable() {
        return !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
    }

    /**
     * Call OpenAI Chat Completion API
     * @param {Array<{role: string, content: string}>} messages
     * @param {object} options
     */
    async callOpenAI(messages, options = {}) {
        const apiKey = options.apiKey || process.env.OPENAI_API_KEY || this.openaiApiKey;
        if (!apiKey) {
            return null;
        }

        try {
            const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    messages: messages,
                    temperature: options.temperature || 0.7,
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
            console.error('[AIProviderService] OpenAI API Error:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * Generate an intelligent AI reply for user shopping queries
     */
    async generateChatbotAIResponse(userMessage, storeContext = {}) {
        if (!this.isAIAvailable()) {
            return null;
        }

        const systemPrompt = `You are the official smart shopping assistant for Angkor Shopping Mall, Cambodia's premier tech and electronics eCommerce platform.
Store Information:
- Location: Phnom Penh, Cambodia
- Shipping: Express 1-2 business days in Phnom Penh, 2-4 business days for provinces.
- Payment Methods: ABA KHQR (Bakong), Wing Bank, Visa/MasterCard, Cash on Delivery (COD).
- Warranty: Official 1-Year Manufacturer Warranty on all brand-new devices, 7-day replacement for defective units.
- Trade-In: Customers can trade in their old phones or laptops for instant checkout discount credits at /trading.
- Flash sales: Daily live discounts up to 50% off.

Store Context Data:
${JSON.stringify(storeContext, null, 2)}

Instructions:
1. Provide helpful, polite, concise, and enthusiastic responses.
2. Use markdown formatting with bold text and bullet points.
3. Suggest relevant store categories or trade-ins when appropriate.
4. Keep replies under 150 words for fast reading.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ];

        return await this.callOpenAI(messages);
    }

    /**
     * Generate a smart AI suggested draft reply for Admins to reply to customer inquiries
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
- Payment: ABA KHQR, Wing, Cards, COD.
- Warranty: 1-year official warranty, 7-day return.
- Hotline: +855 23 888 999 (8AM - 9PM).

Write the complete draft message for the admin to review and send directly:`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please write a response to this customer inquiry: "${customerMessage}"` }
        ];

        const aiResponse = await this.callOpenAI(messages, { temperature: 0.6 });

        if (aiResponse) {
            return aiResponse;
        }

        // Rule-based fallback draft if OpenAI API key is not configured
        return `Dear ${customerInfo.sender_name || 'Customer'},\n\nThank you for reaching out to Angkor Shopping Mall support regarding "${customerInfo.subject || 'your inquiry'}".\n\nWe have received your message and are happy to assist you. Our support team is actively reviewing your request and will ensure you receive prompt assistance.\n\nIf you need immediate assistance, you can also contact our hotline directly at +855 23 888 999 (8:00 AM - 9:00 PM).\n\nWarm regards,\nAngkor Shopping Mall Customer Care Team`;
    }

    /**
     * Generate 1-sentence summary and sentiment tag for customer inquiry
     */
    async analyzeInquiry(customerMessage) {
        const text = customerMessage.toLowerCase();
        let sentiment = 'general';

        if (text.includes('urgent') || text.includes('broken') || text.includes('cancel') || text.includes('wrong') || text.includes('refund') || text.includes('defect') || text.includes('fail')) {
            sentiment = 'urgent';
        } else if (text.includes('buy') || text.includes('order') || text.includes('price') || text.includes('discount') || text.includes('stock') || text.includes('shipping')) {
            sentiment = 'inquiry';
        } else if (text.includes('trade') || text.includes('exchange') || text.includes('swap')) {
            sentiment = 'trade-in';
        }

        let summary = customerMessage.slice(0, 120);
        if (this.isAIAvailable()) {
            try {
                const aiSummary = await this.callOpenAI([
                    {
                        role: 'system',
                        content: 'Summarize the customer support message in 1 short sentence (max 15 words) and classify sentiment as "urgent", "inquiry", "complaint", or "general". Format output as: Summary | Sentiment'
                    },
                    { role: 'user', content: customerMessage }
                ], { max_tokens: 50 });

                if (aiSummary && aiSummary.includes('|')) {
                    const [s, sent] = aiSummary.split('|');
                    return {
                        summary: s.trim(),
                        sentiment: sent.trim().toLowerCase() || sentiment
                    };
                }
            } catch (e) {}
        }

        return { summary, sentiment };
    }
}

module.exports = new AIProviderService();
