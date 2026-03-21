import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data } = await api.get('/notifications?limit=30');
      setNotifications(data.data.notifications || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.data.count || 0);
    } catch {
      // Silently fail
    }
  }, [user]);

  // Mark a single notification as read
  const markRead = useCallback(async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }, []);

  // Socket.io connection for real-time notifications
  useEffect(() => {
    if (!user) return;

    fetchNotifications();
    fetchUnreadCount();

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.emit('join-user', user._id || user.id);

    socket.on('notification', (notification) => {
      setNotifications(prev => [notification, ...prev].slice(0, 50));
      setUnreadCount(prev => prev + 1);

      // Show toast for security alerts
      if (notification.type === 'security_alert') {
        toast.error(notification.title, { duration: 5000 });
      } else if (notification.type === 'risk_alert') {
        toast(notification.title, { icon: '\u26a0\ufe0f', duration: 4000 });
      } else {
        toast(notification.title, { duration: 3000 });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
};

export default useNotifications;
