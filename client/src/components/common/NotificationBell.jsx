import { useState, useRef, useEffect } from 'react';
import { Bell, Shield, AlertTriangle, Monitor, Settings, FileText, Check, CheckCheck } from 'lucide-react';
import useNotifications from '../../hooks/useNotifications';

const typeConfig = {
  security_alert: { icon: Shield, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  risk_alert: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  session_event: { icon: Monitor, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  admin_action: { icon: Settings, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  file_activity: { icon: FileText, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
};

const timeAgo = (date) => {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const NotificationBell = () => {
  const { notifications, unreadCount, markRead, markAllRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-all hover:bg-white/5"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" style={{ color: 'var(--text2)' }} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
            style={{ background: '#ef4444' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] max-h-[440px] flex flex-col z-50 animate-scale"
          style={{
            background: 'rgba(12,12,20,0.98)',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-all hover:bg-white/5"
                style={{ color: 'var(--cyan)' }}
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--muted)', borderTopColor: 'transparent' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <Bell className="w-8 h-8 mb-2" style={{ color: 'var(--muted2)' }} />
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.type] || typeConfig.security_alert;
                const Icon = config.icon;
                return (
                  <div
                    key={n._id || n.id}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-white/[0.03]"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: n.read ? 'transparent' : 'rgba(139,92,246,0.03)',
                    }}
                    onClick={() => {
                      if (!n.read) markRead(n._id || n.id);
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: config.bg, border: `1px solid ${config.color}18` }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{n.title}</p>
                        {!n.read && (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--cyan)' }} />
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--muted)' }}>{n.message}</p>
                      <p className="text-[9px] mt-1" style={{ color: 'var(--muted2)', fontFamily: 'var(--mono)' }}>
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
