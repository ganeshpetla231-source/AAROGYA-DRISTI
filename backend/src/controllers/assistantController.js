const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const assistant = require('../services/geminiLiveService');

module.exports = {
  health: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Gemini is available',
    data: await assistant.checkGeminiHealth()
  })),
  liveToken: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Short-lived Gemini Live session token created',
    data: await assistant.createLiveToken(req.body?.language || 'auto')
  })),
  message: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'AI assistant response created',
    data: await assistant.generateTextResponse(req.body)
  })),
  conversations: asyncHandler(async (req, res) => apiResponse(res, { data: await assistant.listConversations(req.user, req.query) })),
  createConversation: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, data: await assistant.createConversation(req.user, req.body?.language || 'auto') })),
  conversationMessages: asyncHandler(async (req, res) => apiResponse(res, { data: await assistant.listConversationMessages(req.params.id, req.user, req.query) })),
  saveConversationTurn: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, data: await assistant.saveConversationTurn(req.params.id, req.body, req.user) })),
  deleteConversation: asyncHandler(async (req, res) => apiResponse(res, { data: await assistant.deleteConversation(req.params.id, req.user) }))
};
