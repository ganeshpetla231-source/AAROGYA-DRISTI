const express = require('express');
const controller = require('../controllers/governmentDirectoryController');

const router = express.Router();
router.get('/', controller.directory);
router.get('/summary', controller.summary);
router.get('/dmho', controller.dmho);
router.get('/hospitals', controller.hospitals);
router.get('/providers', controller.providers);
router.get('/hospitals/:id', controller.hospital);
router.get('/phcs', controller.phcs);
router.get('/phcs/search', controller.searchPhcs);
router.get('/phcs/mandal/:mandalName', controller.mandalPhcs);
router.get('/phcs/:id', controller.phc);

module.exports = router;
