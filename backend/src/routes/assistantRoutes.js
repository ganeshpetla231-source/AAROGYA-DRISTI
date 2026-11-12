const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { expensiveLimiter } = require('../middleware/rateLimits');
const controller = require('../controllers/assistantController');

const router = express.Router();
router.get('/health', authenticate, expensiveLimiter, controller.health);
router.post('/live-token', authenticate, expensiveLimiter, controller.liveToken);
router.post('/message', authenticate, expensiveLimiter, controller.message);
router.get('/conversations', authenticate, controller.conversations);
router.post('/conversations', authenticate, expensiveLimiter, controller.createConversation);
router.get('/conversations/:id/messages', authenticate, controller.conversationMessages);
router.post('/conversations/:id/messages', authenticate, expensiveLimiter, controller.saveConversationTurn);
router.delete('/conversations/:id', authenticate, controller.deleteConversation);

module.exports = router;
