const { Notification } = require('../models');

// Notification types that should trigger email alerts
const EMAIL_TYPES = ['security_alert', 'risk_alert'];

/**
 * Create a notification and optionally emit via Socket.io + send email.
 */
const createNotification = async ({ userId, type, title, message, metadata = {}, sendEmail = false, io }) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
      emailSent: false,
    });

    // Emit real-time notification via Socket.io
    if (io) {
      io.to(`user:${userId}`).emit('notification', {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: notification.metadata,
        read: false,
        createdAt: notification.createdAt,
      });
    }

    // Send email for critical notifications
    if (sendEmail && EMAIL_TYPES.includes(type)) {
      try {
        const { User } = require('../models');
        const user = await User.findById(userId).select('email');
        if (user?.email) {
          const { sendNotificationEmail } = require('../utils/email');
          await sendNotificationEmail(user.email, title, message, type);
          await Notification.findByIdAndUpdate(notification._id, { emailSent: true });
        }
      } catch (emailErr) {
        console.error('Notification email failed:', emailErr.message);
      }
    }

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
};

module.exports = { createNotification };
