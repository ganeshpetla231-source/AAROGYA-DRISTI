const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const notifications = require('../services/notificationService');
module.exports = {
  list: asyncHandler(async (req, res) => apiResponse(res, { data: await notifications.listForUser(req.user._id, req.query) })),
  unreadCount: asyncHandler(async (req, res) => apiResponse(res, { data: { unreadCount: (await notifications.listForUser(req.user._id, { limit: 1 })).unreadCount } })),
  markRead: asyncHandler(async (req, res) => apiResponse(res, { message: 'Notification marked read', data: await notifications.markRead(req.params.id, req.user._id) })),
  markAllRead: asyncHandler(async (req, res) => apiResponse(res, { message: 'Notifications marked read', data: await notifications.markAllRead(req.user._id) }))
};
