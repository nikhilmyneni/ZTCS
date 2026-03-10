import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Shield, User, Mail, Key, Monitor, Globe, Clock, ArrowLeft,
  ShieldCheck, Activity, LogIn
} from 'lucide-react';
import api from '../utils/api';
import { SkeletonLine } from '../components/common/Skeleton';

const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me'),
      api.get('/auth/trusted-devices'),
    ])
      .then(([meRes, devRes]) => {
        setProfile(meRes.data.data.user);
        setDevices(devRes.data.data.devices || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rs = profile?.avgRiskScore ?? 0;
  const rl = profile?.avgRiskLevel ?? 'low';
  const rc = rl === 'high' ? 'var(--red)' : rl === 'medium' ? 'var(--amber)' : 'var(--green)';

  if (loading) {
    return (
      <div className="min-h-screen p-6" style={{ background: 'var(--bg)' }}>
        <div className="max-w-2xl mx-auto space-y-4 pt-12">
          <SkeletonLine width="200px" height="24px" />
          <SkeletonLine width="100%" height="180px" />
          <SkeletonLine width="100%" height="120px" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg)' }}>
      <div className="auth-bg" />
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 space-y-5 animate-in">
        {/* Back button */}
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-xs font-medium transition-colors" style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </button>

        {/* Profile Header */}
        <div className="card-elevated text-center py-8">
          <div
            className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.1))',
              color: 'var(--cyan)',
              border: '1px solid rgba(6,182,212,0.15)',
              boxShadow: '0 0 40px rgba(6,182,212,0.1)',
            }}
          >
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <h1 className="text-xl font-bold mb-1">{profile?.name}</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>{profile?.email}</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="text-[10px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider" style={{
              background: profile?.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(6,182,212,0.1)',
              color: profile?.role === 'admin' ? 'var(--violet)' : 'var(--cyan)',
              border: `1px solid ${profile?.role === 'admin' ? 'rgba(139,92,246,0.12)' : 'rgba(6,182,212,0.12)'}`,
            }}>
              {profile?.role}
            </span>
            {profile?.totpEnabled && (
              <span className="text-[10px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wider" style={{
                background: 'rgba(34,197,94,0.1)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.12)',
              }}>
                2FA Enabled
              </span>
            )}
          </div>
        </div>

        {/* Security Score */}
        <div style={{ ...glass, padding: '1.25rem' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: `${rc}15`, border: `1px solid ${rc}25`,
            }}>
              <Activity size={18} style={{ color: rc }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Security Score</h3>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Average across all login sessions</p>
            </div>
            <div className="ml-auto text-right">
              <span className="text-2xl font-black" style={{ color: rc, fontFamily: 'var(--mono)' }}>{rs}</span>
              <span className="text-[10px] block" style={{ color: 'var(--muted)' }}>/ 100</span>
            </div>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(rs, 100)}%`, background: rc }} />
          </div>
        </div>

        {/* Account Details */}
        <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold">Account Details</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[
              { icon: User, label: 'Name', value: profile?.name },
              { icon: Mail, label: 'Email', value: profile?.email },
              { icon: Key, label: 'Secret Question', value: profile?.secretQuestion },
              { icon: LogIn, label: 'Total Logins', value: profile?.baselineProfile?.loginCount || 0 },
              { icon: Clock, label: 'Last Login', value: profile?.baselineProfile?.lastLoginAt ? new Date(profile.baselineProfile.lastLoginAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never' },
              { icon: Globe, label: 'Known IPs', value: profile?.baselineProfile?.knownIPCount || 0 },
              { icon: Monitor, label: 'Known Devices', value: profile?.baselineProfile?.knownDeviceCount || 0 },
              { icon: ShieldCheck, label: 'Trusted Devices', value: devices.filter(d => d.isTrusted).length },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <Icon size={14} style={{ color: 'var(--muted)' }} />
                <span className="text-xs flex-1" style={{ color: 'var(--muted)' }}>{label}</span>
                <span className="text-xs font-medium" style={{ fontFamily: 'var(--mono)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
