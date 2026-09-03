const { SupportMessage, User, Order } = require('../models/relationships');
const { successResponse, errorResponse } = require('../utils/response');
const aiProviderService = require('../services/aiProviderService');
const { bot } = require('../config/telegram');
const { Op } = require('sequelize');

class SupportMessageController {
    /**
     * POST /api/support/send
     * User or Guest sends a message to Admin
     */
    async sendMessage(req, res) {
        try {
            const userId = req.user?.id || null;
            const {
                sender_name,
                sender_email,
                sender_phone,
                subject = 'General Inquiry',
                message
            } = req.body;

            if (!message || !message.trim()) {
                return errorResponse(res, 'Message text is required', 400);
            }

            let name = sender_name;
            let email = sender_email;
            let phone = sender_phone;

            if (userId) {
                try {
                    const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone'], raw: true });
                    if (user) {
                        name = name || user.name || 'Registered Customer';
                        email = email || user.email;
                        phone = phone || user.phone;
                    }
                } catch (e) {
                    // Ignore user lookup error
                }
            }

            name = name || 'Guest Customer';

            // 1. Analyze sentiment and generate AI summary + auto suggested reply
            let analysis = { sentiment: 'neutral', summary: 'Customer support request' };
            let aiSuggestedReply = '';
            try {
                analysis = await aiProviderService.analyzeInquiry(message);
                aiSuggestedReply = await aiProviderService.generateAdminDraftReply(message, {
                    sender_name: name,
                    subject: subject
                });
            } catch (aiErr) {
                console.warn('[SupportMessageController] AI analysis warning:', aiErr.message);
            }

            // 2. Create message in DB
            const supportMsg = await SupportMessage.create({
                user_id: userId,
                sender_name: name,
                sender_email: email,
                sender_phone: phone,
                subject: subject,
                message: message.trim(),
                sender_type: 'user',
                status: 'unread',
                sentiment: analysis.sentiment,
                ai_summary: analysis.summary,
                ai_suggested_reply: aiSuggestedReply
            });

            // 3. Optional: Notify Admin via Telegram if bot is configured
            try {
                if (bot && process.env.TELEGRAM_ADMIN_CHAT_ID) {
                    const telegramText = `💬 *New Customer Support Message*\n\n*From:* ${name} (${email || phone || 'No contact'})\n*Subject:* ${subject}\n*Sentiment:* ${analysis.sentiment.toUpperCase()}\n*Summary:* ${analysis.summary}\n\n*Message:*\n${message}`;
                    bot.sendMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, telegramText, { parse_mode: 'Markdown' }).catch(() => {});
                }
            } catch (e) {}

            return successResponse(res, 'Your message has been sent to our customer support team! An admin will review and reply promptly.', supportMsg, 201);
        } catch (error) {
            console.error('[SupportMessageController] sendMessage error:', error);
            return errorResponse(res, 'Failed to send support message', 500);
        }
    }

    /**
     * GET /api/support/messages
     * Admin views all messages
     */
    async getMessages(req, res) {
        try {
            const { status, search, page = 1, limit = 20 } = req.query;
            const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
            const parsedPage = Math.max(1, parseInt(page, 10) || 1);
            const offset = (parsedPage - 1) * parsedLimit;
            const where = {};

            if (status && status !== 'all' && status !== 'undefined' && status !== 'null' && status.trim() !== '') {
                where.status = status.trim();
            }

            if (search && search !== 'undefined' && search !== 'null' && search.trim() !== '') {
                const s = search.trim();
                where[Op.or] = [
                    { sender_name: { [Op.iLike]: `%${s}%` } },
                    { sender_email: { [Op.iLike]: `%${s}%` } },
                    { subject: { [Op.iLike]: `%${s}%` } },
                    { message: { [Op.iLike]: `%${s}%` } }
                ];
            }

            // Single query with findAndCountAll to avoid multi-connection lock contention
            const result = await SupportMessage.findAndCountAll({
                where,
                order: [
                    ['status', 'ASC'],
                    ['created_at', 'DESC']
                ],
                limit: parsedLimit,
                offset: offset,
                raw: true
            });

            const count = result.count;
            const rows = result.rows || [];

            // Safe population of user & admin info
            const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
            const adminIds = [...new Set(rows.map(r => r.admin_id).filter(Boolean))];
            const allUserIds = [...new Set([...userIds, ...adminIds])];

            let userMap = new Map();
            if (allUserIds.length > 0) {
                try {
                    const users = await User.findAll({
                        where: { id: allUserIds },
                        attributes: ['id', 'name', 'email', 'phone'],
                        raw: true
                    });
                    users.forEach(u => userMap.set(u.id, u));
                } catch (userErr) {
                    console.warn('[SupportMessageController] User mapping skipped:', userErr.message);
                }
            }

            const messages = rows.map(r => {
                const item = { ...r };
                item.user = item.user_id ? userMap.get(item.user_id) || null : null;
                item.admin = item.admin_id ? userMap.get(item.admin_id) || null : null;
                return item;
            });

            return successResponse(res, 'Support messages retrieved successfully', {
                total: count,
                page: parsedPage,
                totalPages: Math.ceil(count / parsedLimit),
                messages
            });
        } catch (error) {
            console.error('[SupportMessageController] getMessages error:', error);
            return errorResponse(res, 'Failed to retrieve support messages', 500);
        }
    }

    /**
     * GET /api/support/messages/:id
     * Admin views single message with customer profile and orders
     */
    async getMessageById(req, res) {
        try {
            const { id } = req.params;
            const message = await SupportMessage.findByPk(id);

            if (!message) {
                return errorResponse(res, 'Message not found', 404);
            }

            // Mark as in_progress if still unread
            if (message.status === 'unread') {
                message.status = 'in_progress';
                await message.save();
            }

            const messageData = message.toJSON ? message.toJSON() : { ...message };

            // Fetch user and admin details
            if (message.user_id) {
                try {
                    messageData.user = await User.findByPk(message.user_id, {
                        attributes: ['id', 'name', 'email', 'phone', 'created_at'],
                        raw: true
                    });
                } catch (e) {
                    messageData.user = null;
                }
            } else {
                messageData.user = null;
            }

            if (message.admin_id) {
                try {
                    messageData.admin = await User.findByPk(message.admin_id, {
                        attributes: ['id', 'name', 'email'],
                        raw: true
                    });
                } catch (e) {
                    messageData.admin = null;
                }
            } else {
                messageData.admin = null;
            }

            // Fetch user's recent orders if logged in user
            let recentOrders = [];
            if (message.user_id) {
                try {
                    recentOrders = await Order.findAll({
                        where: { user_id: message.user_id },
                        order: [['created_at', 'DESC']],
                        limit: 3,
                        raw: true
                    });
                } catch (e) {
                    recentOrders = [];
                }
            }

            return successResponse(res, 'Message details fetched successfully', {
                message: messageData,
                recentOrders
            });
        } catch (error) {
            console.error('[SupportMessageController] getMessageById error:', error);
            return errorResponse(res, 'Failed to fetch message details', 500);
        }
    }

    /**
     * POST /api/support/messages/:id/reply
     * Admin replies to a customer message
     */
    async replyMessage(req, res) {
        try {
            const { id } = req.params;
            const { reply } = req.body;
            const adminId = req.user?.id || null;

            if (!reply || !reply.trim()) {
                return errorResponse(res, 'Reply message cannot be empty', 400);
            }

            const message = await SupportMessage.findByPk(id);
            if (!message) {
                return errorResponse(res, 'Message not found', 404);
            }

            let validAdminId = null;
            if (adminId) {
                try {
                    const existingAdmin = await User.findByPk(adminId, { raw: true });
                    if (existingAdmin) validAdminId = adminId;
                } catch (e) {}
            }

            message.admin_reply = reply.trim();
            message.admin_id = validAdminId;
            message.status = 'replied';
            message.replied_at = new Date();
            await message.save();

            return successResponse(res, 'Reply sent to customer successfully', message);
        } catch (error) {
            console.error('[SupportMessageController] replyMessage error:', error);
            return errorResponse(res, 'Failed to reply to message', 500);
        }
    }

    /**
     * POST /api/support/messages/:id/ai-draft
     * Admin generates a fresh AI reply draft using OpenAI
     */
    async generateAiDraft(req, res) {
        try {
            const { id } = req.params;
            const { instruction } = req.body;

            const message = await SupportMessage.findByPk(id);
            if (!message) {
                return errorResponse(res, 'Message not found', 404);
            }

            const draft = await aiProviderService.generateAdminDraftReply(
                message.message,
                { sender_name: message.sender_name, subject: message.subject },
                instruction || ''
            );

            message.ai_suggested_reply = draft;
            await message.save();

            return successResponse(res, 'AI Draft generated successfully', { draft });
        } catch (error) {
            console.error('[SupportMessageController] generateAiDraft error:', error);
            return errorResponse(res, 'Failed to generate AI draft', 500);
        }
    }

    /**
     * GET /api/support/my-messages
     * Logged in user fetches their messages and replies
     */
    async getMyMessages(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return errorResponse(res, 'Authentication required', 401);
            }

            const messages = await SupportMessage.findAll({
                where: { user_id: userId },
                order: [['created_at', 'DESC']],
                limit: 20,
                raw: true
            });

            return successResponse(res, 'My support messages fetched successfully', messages);
        } catch (error) {
            console.error('[SupportMessageController] getMyMessages error:', error);
            return errorResponse(res, 'Failed to fetch my messages', 500);
        }
    }

    /**
     * GET /api/support/stats
     * Stats for admin dashboard / navbar badge
     */
    async getStats(req, res) {
        try {
            const [total, unread, inProgress, replied] = await Promise.all([
                SupportMessage.count(),
                SupportMessage.count({ where: { status: 'unread' } }),
                SupportMessage.count({ where: { status: 'in_progress' } }),
                SupportMessage.count({ where: { status: 'replied' } })
            ]);

            return successResponse(res, 'Support stats fetched successfully', {
                total,
                unread,
                in_progress: inProgress,
                replied
            });
        } catch (error) {
            console.error('[SupportMessageController] getStats error:', error);
            return errorResponse(res, 'Failed to fetch support stats', 500);
        }
    }

    /**
     * POST /api/support/track
     * Track messages by IDs, email, or phone (accessible to guests and logged-in users)
     */
    async trackMessages(req, res) {
        try {
            const { ids, email, phone } = req.body;
            const whereConditions = [];

            if (Array.isArray(ids) && ids.length > 0) {
                whereConditions.push({ id: { [Op.in]: ids } });
            }
            if (email && email.trim()) {
                whereConditions.push({ sender_email: email.trim().toLowerCase() });
            }
            if (phone && phone.trim()) {
                whereConditions.push({ sender_phone: phone.trim() });
            }

            if (whereConditions.length === 0) {
                return successResponse(res, 'No tickets found', []);
            }

            const messages = await SupportMessage.findAll({
                where: { [Op.or]: whereConditions },
                order: [['created_at', 'DESC']],
                limit: 20,
                raw: true
            });

            return successResponse(res, 'Messages tracked successfully', messages);
        } catch (error) {
            console.error('[SupportMessageController] trackMessages error:', error);
            return errorResponse(res, 'Failed to track messages', 500);
        }
    }
}

module.exports = new SupportMessageController();
