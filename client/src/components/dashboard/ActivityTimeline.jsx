import { useState, useEffect } from 'react';
import {
  LogIn, LogOut, ShieldAlert, Shield, Upload, Download, Trash2,
  Key, Smartphone, Clock, AlertTriangle
} from 'lucide-react';
import api from '../../utils/api';
import EmptyState from '../common/EmptyState';
import { SkeletonLine } from '../common/Skeleton';

const actionConfig = {
  login_success: { icon: LogIn, color: 'var(--green)', label: 'Logged in' },
  login_failed: { icon: AlertTriangle, color: 'var(--red)', label: 'Failed login' },
  login_blocked: { icon: ShieldAlert, color: 'var(--red)', label: 'Login blocked' },
  login_initiated: { icon: Shield, color: 'var(--amber)', label: 'Step-up required' },
  step_up_success: { icon: Shield, color: 'var(--green)', label: 'Step-up completed' },
  step_up_failed: { icon: Shield, color: 'var(--red)', label: 'Step-up failed' },
  step_up_triggered: { icon: Shield, color: 'var(--amber)', label: 'Step-up triggered' },
  file_upload: { icon: Upload, color: 'var(--cyan)', label: 'Uploaded file' },
  file_download: { icon: Download, color: 'var(--blue)', label: 'Downloaded file' },
  file_delete: { icon: Trash2, color: 'var(--red)', label: 'Deleted file' },
  password_change: { icon: Key, color: 'var(--violet)', label: 'Changed password' },
  password_reset_completed: { icon: Key, color: 'var(--violet)', label: 'Reset password' },
  device_trust_revoked: { icon: Smartphone, color: 'var(--amber)', label: 'Revoked device trust' },
  session_revoked: { icon: LogOut, color: 'var(--amber)', label: 'Revoked session' },
};

const formatRelative = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
};

export default function ActivityTimeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/activity-timeline')
      .then(res => setEvents(res.data.data.timeline || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonLine width="32px" height="32px" />
            <div className="flex-1 space-y-1.5">
              <SkeletonLine width="60%" height="12px" />
              <SkeletonLine width="30%" height="10px" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState icon="history" title="No activity yet" description="Your security events will appear here." />;
  }

  return (
    <div className="p-2 sm:p-3 space-y-0.5">
      {events.map((event, i) => {
        const config = actionConfig[event.action] || { icon: Clock, color: 'var(--muted)', label: event.action };
        const Icon = config.icon;

        return (
          <div
            key={event.id}
            className="flex items-start gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2.5 rounded-lg transition-colors stagger-item"
            style={{
              animationDelay: `${i * 40}ms`,
              background: 'transparent',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center pt-0.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: `${config.color}15`,
                  border: `1px solid ${config.color}25`,
                }}
              >
                <Icon size={13} style={{ color: config.color }} />
              </div>
              {i < events.length - 1 && (
                <div className="w-px flex-1 mt-1 min-h-[12px]" style={{ background: 'var(--border)' }} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                  {config.label}
                </span>
                <span className="text-[9px] sm:text-[10px] flex-shrink-0" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {formatRelative(event.time)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {event.ipAddress && (
                  <span className="text-[9px] sm:text-[10px] truncate" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {event.ipAddress}
                  </span>
                )}
                {event.riskScore > 0 && (
                  <span
                    className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                    style={{
                      background: event.riskLevel === 'high' ? 'rgba(239,68,68,0.1)' : event.riskLevel === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                      color: event.riskLevel === 'high' ? 'var(--red)' : event.riskLevel === 'medium' ? 'var(--amber)' : 'var(--green)',
                    }}
                  >
                    {event.riskScore}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
