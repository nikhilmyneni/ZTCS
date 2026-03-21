const geminiService = require('../services/geminiService');

// ─── SEND MESSAGE ───
const sendMessage = async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    if (message.length > 500) {
      return res.status(400).json({ success: false, message: 'Message too long (max 500 characters).' });
    }

    // Cap history to last 20 messages
    const trimmedHistory = Array.isArray(history) ? history.slice(-20) : [];

    const reply = await geminiService.chat({
      message: message.trim(),
      conversationHistory: trimmedHistory,
      userName: req.user.name || 'User',
    });

    res.status(200).json({ success: true, data: { reply } });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, message: 'Failed to process message.' });
  }
};

module.exports = { sendMessage };
