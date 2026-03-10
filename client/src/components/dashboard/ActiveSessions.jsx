import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Tablet, Globe, Clock, LogOut, ShieldCheck, Loader2, RefreshCw, Wifi } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../common/ConfirmModal';
import EmptyState from '../common/EmptyState';
import { SkeletonCard } from '../common/Skeleton';

const DeviceIcon = ({ type }) => {
  const t = (type || '').toLowerCase();
  if (t.includes('mobile') || t.includes('android') || t.includes('ios')) return <Smartphone className="w-4 h-4" />;
  if (t.includes('tablet') || t.includes('ipad')) return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
};

const formatTime = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  const diffHr = Math.floor((now - d) / 3600000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' }) + ', ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

const ActiveSessions = () => {
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sessRes, devRes] = await Promise.all([
        api.get('/auth/sessions'),
        api.get('/auth/trusted-devices'),
      ]);
      setSessions(sessRes.data.data.sessions || []);
      setDevices(devRes.data.data.devices || []);
    } catch {
      toast.error('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const revokeSession = async (fp) => {
    setRevoking(fp);
    try {
      await api.delete(`/auth/sessions/${fp}`);
      toast.success('Session revoked.');
      fetchData();
    } catch { toast.error('Failed to revoke session.'); }
    finally { setRevoking(null); }
  };

  const revokeTrust = async (fp) => {
    try {
      await api.delete(`/auth/trusted-devices/${fp}`);
      toast.success('Device trust revoked.');
      fetchData();
    } catch { toast.error('Failed to revoke trust.'); }
  };

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'revoke-session') revokeSession(confirmAction.fp);
    else if (confirmAction.type === 'revoke-trust') revokeTrust(confirmAction.fp);
    setConfirmAction(null);
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const trustedDevices = devices.filter(d => d.isTrusted);

  // ─── Session Card (responsive — used for both mobile and desktop) ───
  const SessionCard = ({ s }) => {
    const isCurrent = s.isCurrent;
    return (
      <div
        className="rounded-xl p-3.5 transition-all hover:translate-y-[-1px]"
        style={{
          background: isCurrent ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isCurrent ? 'rgba(6,182,212,0.12)' : 'var(--border)'}`,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
            background: isCurrent ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isCurrent ? 'rgba(6,182,212,0.15)' : 'var(--border)'}`,
            color: isCurrent ? 'var(--cyan)' : 'var(--muted)',
          }}>
            <DeviceIcon type={s.deviceInfo?.deviceType || s.deviceInfo?.os} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold truncate">
                {s.deviceInfo?.browser || 'Unknown'} on {s.deviceInfo?.os || 'Unknown'}
              </span>
              {isCurrent && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold tracking-wide" style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan)' }}>
                  CURRENT
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[10px] flex items-center gap-1" style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                <Globe className="w-3 h-3 flex-shrink-0" /> {s.ipAddress || '\u2014'}
              </span>
              <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <Clock className="w-3 h-3 flex-shrink-0" /> {formatTime(s.lastActive)}
              </span>
            </div>
          </div>
        </div>
        {!isCurrent && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setConfirmAction({ type: 'revoke-session', fp: s.fingerprint, title: 'Revoke Session', message: 'The device will be logged out immediately.' })}
              disabled={revoking === s.fingerprint}
              className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: 'var(--red)' }}
            >
              {revoking === s.fingerprint ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
              Revoke Session
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Device Card ───
  const DeviceCard = ({ d }) => (
    <div
      className="rounded-xl p-3.5 flex items-center gap-3 transition-all hover:translate-y-[-1px]"
      style={{
        background: d.isTrusted ? 'rgba(34,197,94,0.03)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${d.isTrusted ? 'rgba(34,197,94,0.1)' : 'var(--border)'}`,
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
        background: d.isTrusted ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${d.isTrusted ? 'rgba(34,197,94,0.12)' : 'var(--border)'}`,
        color: d.isTrusted ? 'var(--green)' : 'var(--muted)',
      }}>
        <DeviceIcon type={d.deviceInfo?.deviceType || d.deviceInfo?.os} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold truncate">
            {d.deviceInfo?.browser || 'Unknown'} {'\u00b7'} {d.deviceInfo?.os || 'Unknown'}
          </span>
          {d.isCurrent && <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)' }}>YOU</span>}
          {d.isTrusted && <span className="text-[8px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>TRUSTED</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{d.ipAddress || '\u2014'}</span>
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{formatTime(d.lastSeen)}</span>
        </div>
      </div>
      {d.isTrusted && (
        <button
          onClick={() => setConfirmAction({ type: 'revoke-trust', fp: d.fingerprint, title: 'Revoke Device Trust', message: 'This device will require step-up verification on next login.' })}
          className="text-[10px] px-2.5 py-1.5 rounded-lg transition-colors font-medium flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: 'var(--red)' }}
        >
          Revoke
        </button>
      )}
    </div>
  );

  return (
    <div className="animate-in">
      {/* Stats — sticky header */}
      <div className="sticky top-0 z-10 pb-5" style={{ background: 'var(--bg)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Sessions', value: sessions.length, color: 'var(--cyan)' },
            { label: 'Trusted Devices', value: trustedDevices.length, color: 'var(--green)' },
            { label: 'Known Devices', value: devices.length, color: 'var(--text2)' },
            { label: 'Current', value: sessions.filter(s => s.isCurrent).length ? 'Online' : 'Offline', color: sessions.some(s => s.isCurrent) ? 'var(--green)' : 'var(--muted)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="stat-card text-center">
              <p className="text-lg font-bold" style={{ color, fontFamily: 'var(--mono)' }}>{value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Active Sessions — card grid */}
      <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.12)' }}>
              <Wifi className="w-4 h-4" style={{ color: 'var(--cyan)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Active Sessions</h3>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} across all devices</p>
            </div>
          </div>
          <button onClick={fetchData} className="icon-btn" title="Refresh" aria-label="Refresh sessions">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {sessions.length === 0 ? (
          <EmptyState icon="security" title="No active sessions" description="Your sessions will appear here after you log in." />
        ) : (
          <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {sessions.map((s, i) => <SessionCard key={s.fingerprint || i} s={s} />)}
          </div>
        )}
      </div>

      {/* Trusted Devices — card grid */}
      <div className="mt-5" style={{ ...glass, padding: 0, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Trusted Devices</h3>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {trustedDevices.length > 0 ? `${trustedDevices.length} trusted \u2014 skip step-up for 30 days` : 'Check "Trust this device" during step-up verification'}
              </p>
            </div>
          </div>
        </div>

        {devices.length === 0 ? (
          <EmptyState icon="security" title="No known devices" description="Devices appear here after you log in." />
        ) : (
          <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {devices.map((d, i) => <DeviceCard key={d.fingerprint || i} d={d} />)}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        title={confirmAction?.title || 'Confirm'}
        message={confirmAction?.message || 'Are you sure?'}
        confirmText={confirmAction?.type === 'revoke-session' ? 'Revoke Session' : 'Revoke Trust'}
        variant="danger"
      />
    </div>
  );
};

export default ActiveSessions;
