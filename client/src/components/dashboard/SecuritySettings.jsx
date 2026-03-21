import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  User, Key, Loader2, Check, BadgeCheck, Shield, ShieldCheck,
  Globe, Clock, Monitor, Fingerprint, AlertTriangle, Mail
} from 'lucide-react';
import TOTPSetup from '../auth/TOTPSetup';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

const SectionHeader = ({ icon: Icon, title, subtitle, color, bgColor, action }) => (
  <div className="flex items-center justify-between px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bgColor, border: `1px solid ${color}20` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
    </div>
    {action && action}
  </div>
);

const InfoRow = ({ icon: Icon, label, value, color, mono }) => (
  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors"
    style={{ background: 'transparent' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
  >
    <div className="flex items-center gap-2.5">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: color || 'var(--muted)' }} />
      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</span>
    </div>
    <span className="text-[11px] font-medium" style={{ color: color || 'var(--text2)', fontFamily: mono ? 'var(--mono)' : 'inherit' }}>{value}</span>
  </div>
);

const SecuritySettings = () => {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const saveName = async () => {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    try {
      await api.patch('/auth/profile', { name: name.trim() });
      updateUser({ name: name.trim() });
      toast.success('Name updated.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (newPw.length < 8) return toast.error('Password must be at least 8 characters.');
    if (newPw !== confPw) return toast.error('Passwords don\'t match.');
    setChangingPw(true);
    try {
      await api.patch('/auth/change-password', { currentPassword: curPw, newPassword: newPw });
      toast.success('Password changed.');
      setCurPw(''); setNewPw(''); setConfPw('');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Password change failed.');
    } finally {
      setChangingPw(false);
    }
  };

  const pwStrength = newPw.length === 0 ? null
    : newPw.length < 8 ? { label: 'Weak', color: 'var(--red)', pct: 25 }
    : /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/.test(newPw) ? { label: 'Strong', color: 'var(--green)', pct: 100 }
    : /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPw) ? { label: 'Good', color: 'var(--cyan)', pct: 75 }
    : { label: 'Fair', color: 'var(--amber)', pct: 50 };

  const loginCount = user?.baselineProfile?.loginCount || 0;
  const lastLogin = user?.baselineProfile?.lastLoginAt;
  const knownDevices = user?.baselineProfile?.knownDeviceCount || 0;
  const knownIPs = user?.baselineProfile?.knownIPCount || 0;

  return (
    <div className="space-y-5 animate-in">
      {/* Top row: Profile + Security Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Profile Card */}
        <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
          <SectionHeader icon={User} title="Profile" subtitle="Your account information" color="var(--cyan)" bgColor="rgba(6,182,212,0.1)" />
          <div className="p-4 sm:p-5 space-y-4">
            {/* Account info */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0" style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.1))',
                color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.12)',
              }}>
                {user?.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user?.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  <span className="text-[11px] truncate" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{user?.email}</span>
                  <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--green)' }} />
                </div>
              </div>
              <span className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex-shrink-0" style={{
                background: user?.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(6,182,212,0.1)',
                color: user?.role === 'admin' ? 'var(--violet)' : 'var(--cyan)',
                border: `1px solid ${user?.role === 'admin' ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.15)'}`,
              }}>
                {user?.role || 'user'}
              </span>
            </div>

            {/* Edit name */}
            <div>
              <label className="label block mb-2">Display Name</label>
              <div className="flex gap-2">
                <input value={name} onChange={e => setName(e.target.value)} className="flex-1" />
                <button onClick={saveName} disabled={saving || !name.trim() || name === user?.name} className="btn-primary flex items-center gap-1.5 text-xs px-4 flex-shrink-0">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security Overview */}
        <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
          <SectionHeader icon={Shield} title="Security Overview" subtitle="Your account security status" color="var(--green)" bgColor="rgba(16,185,129,0.1)" />
          <div className="p-4 sm:p-5">
            {/* Security status badges */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {[
                {
                  label: '2FA Status',
                  value: user?.totpEnabled ? 'Enabled' : 'Disabled',
                  icon: ShieldCheck,
                  color: user?.totpEnabled ? 'var(--green)' : 'var(--amber)',
                  bg: user?.totpEnabled ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                  border: user?.totpEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                },
                {
                  label: 'Risk Level',
                  value: (user?.avgRiskLevel || 'low').toUpperCase(),
                  icon: AlertTriangle,
                  color: user?.avgRiskLevel === 'high' ? 'var(--red)' : user?.avgRiskLevel === 'medium' ? 'var(--amber)' : 'var(--green)',
                  bg: user?.avgRiskLevel === 'high' ? 'rgba(239,68,68,0.06)' : user?.avgRiskLevel === 'medium' ? 'rgba(245,158,11,0.06)' : 'rgba(16,185,129,0.06)',
                  border: user?.avgRiskLevel === 'high' ? 'rgba(239,68,68,0.12)' : user?.avgRiskLevel === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <s.icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: s.color }} />
                  <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Account details */}
            <div className="space-y-0.5">
              <InfoRow icon={Clock} label="Total Logins" value={loginCount} mono />
              <InfoRow icon={Clock} label="Last Login" value={lastLogin ? new Date(lastLogin).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'} />
              <InfoRow icon={Monitor} label="Known Devices" value={knownDevices} mono />
              <InfoRow icon={Globe} label="Known IPs" value={knownIPs} mono />
              <InfoRow icon={Fingerprint} label="Account ID" value={user?.id?.slice(-8) || '\u2014'} mono color="var(--muted)" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Password + TOTP side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Change Password */}
        <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
          <SectionHeader icon={Key} title="Change Password" subtitle="Keep your account secure" color="var(--amber)" bgColor="rgba(245,158,11,0.1)" />
          <form onSubmit={changePw} className="p-4 sm:p-5 space-y-3">
            <div>
              <label className="label block mb-2">Current Password</label>
              <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Enter current password" required />
            </div>
            <div>
              <label className="label block mb-2">New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" required />
              {pwStrength && (
                <div className="mt-2">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pwStrength.pct}%`, background: pwStrength.color }} />
                  </div>
                  <p className="text-[10px] mt-1 font-medium" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
                </div>
              )}
            </div>
            <div>
              <label className="label block mb-2">Confirm Password</label>
              <input type="password" value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Re-enter new password" required />
              {confPw && newPw !== confPw && (
                <p className="text-[10px] font-medium mt-1.5 flex items-center gap-1" style={{ color: 'var(--red)' }}>
                  <AlertTriangle className="w-3 h-3" /> Passwords don't match
                </p>
              )}
              {confPw && newPw === confPw && confPw.length >= 8 && (
                <p className="text-[10px] font-medium mt-1.5 flex items-center gap-1" style={{ color: 'var(--green)' }}>
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>
            <div className="pt-1">
              <button type="submit" disabled={changingPw || !curPw || !newPw || newPw !== confPw} className="btn-primary flex items-center gap-1.5 text-xs w-full sm:w-auto justify-center">
                {changingPw ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                {changingPw ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>

        {/* TOTP */}
        <div className="flex flex-col">
          <TOTPSetup onComplete={() => {}} />
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
