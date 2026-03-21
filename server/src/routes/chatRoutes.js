const express = require('express');
const { protect } = require('../middleware/auth');
const { sendMessage } = require('../controllers/chatController');

const router = express.Router();

router.use(protect);

router.post('/message', sendMessage);

module.exports = router;
