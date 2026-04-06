import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, Activity, Lock, Unlock, Download, RefreshCw,
  ChevronLeft, ChevronRight, X, Wifi, WifiOff, LogOut, LayoutDashboard,
  ScrollText, Globe, Radio, ShieldAlert, FolderOpen, Menu, Mail, Smartphone,
  Loader2, CheckCircle, AlertTriangle, ShieldCheck, TrendingUp,
  Clock, BarChart3, Sun, Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts';
import RiskCurveGraph from '../components/dashboard/RiskCurveGraph';
import { io } from 'socket.io-client';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/common/ConfirmModal';
import NotificationBell from '../components/common/NotificationBell';
import { RiskBadge, Spark, CTip, glass, SectionHeader, getEventLabel } from '../components/common/UIHelpers';
import { generateAuditPDF, generateUserActivityPDF } from '../utils/pdfExport';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [nav, setNav] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [lp, setLp] = useState(1);
  const [lps, setLps] = useState(1);
  const [lf, setLf] = useState({ action: '', riskLevel: '' });
  const [ipList, setIpList] = useState({ blacklisted: [], whitelisted: [] });
  const [newIP, setNewIP] = useState('');
  const [live, setLive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Action Center state
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblockStep, setUnblockStep] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [acLoading, setAcLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [adminConfirm, setAdminConfirm] = useState(null);

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  useEffect(() => {
    const s = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000');
    s.emit('join-admin');
    s.on('login-event', e => {
      setLive(p => [{ ...e, action: 'login' }, ...p].slice(0, 100));
      if (e.riskLevel === 'high') toast.error(`High risk: ${e.email}`);
      fetchS();
    });
    s.on('session-blocked', e => { setLive(p => [{ ...e, action: 'blocked' }, ...p].slice(0, 100)); fetchS(); });
    s.on('user-auto-blocked', e => {
      setLive(p => [{ ...e, action: 'auto_blocked', riskLevel: 'high' }, ...p].slice(0, 100));
      toast.error(`Auto-blocked: ${e.email} (Score: ${e.riskScore})`);
      fetchBlocked();
      fetchU();
      fetchS();
    });
    s.on('risk-update', e => {
      setLive(p => [{ ...e, action: e.action || 'file_op' }, ...p].slice(0, 100));
    });
    s.on('bulk-download', e => {
      setLive(p => [{ ...e, action: 'bulk_download', riskLevel: 'high' }, ...p].slice(0, 100));
    });
    s.on('step-up-triggered', e => {
      setStats(prev => prev ? { ...prev, stepUps: (prev.stepUps || 0) + 1 } : prev);
      setLive(p => [{ ...e, action: 'step_up_triggered' }, ...p].slice(0, 100));
    });
    s.on('session-revoked', e => {
      setLive(p => [{ ...e, action: 'session_revoked', riskLevel: 'low' }, ...p].slice(0, 100));
    });
    s.on('user-status-change', () => { fetchU(); fetchBlocked(); });
    s.on('security-alert', a => {
      const id = Date.now() + Math.random();
      setAlerts(p => [{ ...a, id }, ...p].slice(0, 5));
      setTimeout(() => setAlerts(p => p.filter(x => x.id !== id)), 10000);

    });
    return () => s.disconnect();
  }, []);

  const [requires2FA, setRequires2FA] = useState(false);
  const fetchS = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/stats');
      setStats(data.data);
    } catch (e) {
      if (e.response?.data?.code === 'ADMIN_2FA_REQUIRED') setRequires2FA(true);
    }
  }, []);
  const fetchU = useCallback(async () => { try { const { data } = await api.get('/admin/users'); setUsers(data.data.users); } catch {} }, []);
  const fetchL = useCallback(async () => {
    const p = new URLSearchParams({ page: lp, limit: 30 });
    if (lf.action) p.set('action', lf.action);
    if (lf.riskLevel) p.set('riskLevel', lf.riskLevel);
    try { const { data } = await api.get(`/admin/audit-logs?${p}`); setLogs(data.data.logs); setLps(data.data.pages); } catch {}
  }, [lp, lf]);
  const fetchIP = useCallback(async () => { try { const { data } = await api.get('/admin/ip-list'); setIpList(data.data); } catch {} }, []);
  const fetchBlocked = useCallback(async () => { try { const { data } = await api.get('/admin/action-center/blocked'); setBlockedUsers(data.data.users); } catch {} }, []);

  useEffect(() => { Promise.all([fetchS(), fetchU(), fetchIP(), fetchBlocked()]).then(() => setLoading(false)); }, []);
  useEffect(() => { const id = setInterval(fetchS, 60000); return () => clearInterval(id); }, [fetchS]);
  useEffect(() => { if (nav === 'audit') fetchL(); }, [fetchL, nav]);

  const toggleBlock = async id => { try { const { data } = await api.patch(`/admin/users/${id}/toggle-block`); toast.success(data.message); fetchU(); fetchBlocked(); } catch { toast.error('Failed'); } };
  const resetTOTP = async (id, email) => { try { const { data } = await api.patch(`/admin/users/${id}/reset-totp`); toast.success(data.message); fetchU(); } catch (e) { toast.error(e.response?.data?.message || 'Failed'); } };
  const addIP = async type => { if (!newIP.trim()) return; try { await api.post('/admin/ip-list/add', { ip: newIP.trim(), listType: type }); setNewIP(''); fetchIP(); toast.success('Added'); } catch {} };
  const removeIP = async (ip, type) => { try { await api.post('/admin/ip-list/remove', { ip, listType: type }); fetchIP(); } catch {} };
  const exportCSV = async () => {
    try {
      const p = new URLSearchParams();
      if (lf.action) p.set('action', lf.action);
      if (lf.riskLevel) p.set('riskLevel', lf.riskLevel);
      const { data } = await api.get(`/admin/audit-logs/export?${p}`, { responseType: 'blob' });
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('CSV exported.');
    } catch {
      toast.error('CSV export failed.');
    }
  };

  // Action Center handlers
  const startUnblock = (u) => {
    setUnblockTarget(u);
    setUnblockStep(1);
    setOtpSent(false);
    setOtpCode('');
    setTotpCode('');
  };

  const sendAdminOTP = async () => {
    setAcLoading(true);
    try {
      await api.post('/admin/action-center/send-otp');
      setOtpSent(true);
      setCountdown(60);
      toast.success('OTP sent to your email.');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to send OTP.'); }
    finally { setAcLoading(false); }
  };

  const proceedToTOTP = () => {
    if (otpCode.length !== 6) return;
    setUnblockStep(2);
  };

  const verifyUnblock = async () => {
    if (totpCode.length !== 6) return;
    setAcLoading(true);
    try {
      const { data } = await api.post('/admin/action-center/verify-unblock', {
        userId: unblockTarget.id,
        otp: otpCode,
        totpCode,
      });
      toast.success(data.message);
      setUnblockStep(0);
      setUnblockTarget(null);
      fetchBlocked();
      fetchU();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Verification failed.');
    } finally { setAcLoading(false); }
  };

  const switchNav = (id) => { setNav(id); setSidebarOpen(false); };

  const sp1 = [{ v: 2 }, { v: 3 }, { v: 5 }, { v: 4 }, { v: 6 }, { v: stats?.totalUsers || 7 }];
  const sp2 = [{ v: 1 }, { v: 4 }, { v: 2 }, { v: 5 }, { v: stats?.recentLogins || 4 }];
  const sp3 = [{ v: 0 }, { v: 1 }, { v: 0 }, { v: 2 }, { v: stats?.blockedSessions || 0 }];

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'audit', label: 'Audit Logs', icon: ScrollText },
    { id: 'action', label: 'Action Center', icon: ShieldCheck },
    { id: 'ip', label: 'IP Control', icon: Globe },
    { id: 'live', label: 'Live Feed', icon: Radio },
  ];

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 lg:hidden glass-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Left Sidebar */}
      <aside className={`
        fixed lg:relative z-50 lg:z-auto
        w-[240px] h-full flex-shrink-0 flex flex-col
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{
        background: 'var(--panel-bg)', backdropFilter: 'blur(24px)',
        borderRight: '1px solid var(--border)',
      }}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <ShieldAlert className="w-4 h-4" style={{ color: 'var(--red)' }} />
            </div>
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>ZTCS Admin</span>
          </div>
          <button className="lg:hidden icon-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 mb-1">
          <p className="label px-1 mb-2">QUICK LINKS</p>
          <div className="sidebar-item" onClick={() => navigate('/dashboard')}>
            <FolderOpen className="w-4 h-4" /><span>My Cloud</span>
          </div>
        </div>

        <div className="px-4 mt-3">
          <p className="label px-1 mb-2">SECURITY</p>
          <nav className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon }) => (
              <div key={id} className={`sidebar-item ${nav === id ? 'active' : ''}`} onClick={() => switchNav(id)}>
                <Icon className="w-4 h-4" /><span>{label}</span>
                {id === 'action' && blockedUsers.length > 0 && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--red)' }}>{blockedUsers.length}</span>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.08))',
              color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.1)',
            }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.name}</p>
              <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{user?.email}</p>
            </div>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="icon-btn" aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Center */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-[56px] flex items-center justify-between px-4 sm:px-6 flex-shrink-0" style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-bg-soft)', backdropFilter: 'blur(16px)',
        }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin</span>
              <span>/</span>
              <span className="capitalize" style={{ color: 'var(--text)' }}>{nav === 'action' ? 'Action Center' : nav}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="icon-btn" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <NotificationBell />
            <div className="flex items-center gap-2">
              <div className="dot-pulse" style={{ background: 'var(--red)' }} />
              <span className="text-[10px] hidden sm:inline" style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }}>MONITORING</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20 animate-in">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--cyan)' }} />
            </div>
          )}

          {/* Admin 2FA required */}
          {!loading && requires2FA && (
            <div className="flex flex-col items-center justify-center py-20 animate-in">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
              }}>
                <Shield className="w-8 h-8" style={{ color: 'var(--amber)' }} />
              </div>
              <h2 className="text-lg font-bold mb-2">2FA Required</h2>
              <p className="text-xs text-center max-w-sm mb-6" style={{ color: 'var(--muted)' }}>
                Admin accounts must have TOTP authenticator enabled to access the dashboard. Set up 2FA in your account settings first.
              </p>
              <button onClick={() => navigate('/dashboard')} className="btn-primary flex items-center gap-2 text-xs px-5 py-2.5">
                <Shield className="w-4 h-4" /> Go to Settings
              </button>
            </div>
          )}

          {/* OVERVIEW */}
          {!loading && nav === 'overview' && stats && (
            <div className="space-y-5 animate-in">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { l: 'Users', v: stats.totalUsers, c: 'var(--cyan)', icon: Users, sp: sp1 },
                  { l: 'Logins 24h', v: stats.recentLogins, c: 'var(--green)', icon: TrendingUp, sp: sp2 },
                  { l: 'Step-Ups', v: stats.stepUps, c: 'var(--amber)', icon: Shield, sp: [{ v: 0 }, { v: 2 }, { v: 1 }, { v: 3 }, { v: stats.stepUps }] },
                  { l: 'Blocked', v: stats.blockedSessions, c: 'var(--red)', icon: ShieldAlert, sp: sp3 },
                ].map(({ l, v, c, icon: StatIcon, sp }) => (
                  <div key={l} className="stat-card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
                        background: `${c}12`, border: `1px solid ${c}20`,
                      }}>
                        <StatIcon className="w-4 h-4" style={{ color: c }} />
                      </div>
                      <Spark data={sp} color={c} />
                    </div>
                    <span className="text-xl sm:text-2xl font-extrabold" style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{v?.toLocaleString()}</span>
                    <p className="label mt-1">{l}</p>
                  </div>
                ))}
              </div>

              {/* Risk Trend */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={TrendingUp} title="Risk Score Trend" subtitle="All users · live updates" color="var(--red)" bgColor="rgba(239,68,68,0.1)"
                  action={
                    <div className="flex items-center gap-1.5">
                      <div className="dot-pulse" style={{ background: 'var(--red)' }} />
                      <span className="text-[10px]" style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 600 }}>LIVE</span>
                    </div>
                  }
                />
                <div className="p-4">
                  <RiskCurveGraph height={260} isAdmin showTitle={false} />
                </div>
              </div>

              {/* Charts row */}
              <div>
                {/* Hourly Logins */}
                <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                  <SectionHeader icon={BarChart3} title="Hourly Logins" subtitle="Last 24 hours" color="var(--cyan)" bgColor="rgba(6,182,212,0.1)" />
                  <div className="p-4">
                    {(() => {
                      const hourMap = {};
                      (stats.hourlyLogins || []).forEach(h => { hourMap[h.hour] = h.logins; });
                      const IST_OFFSET = 5.5;
                      const full24 = Array.from({ length: 24 }, (_, utcH) => {
                        const istH = (utcH + IST_OFFSET) % 24;
                        const displayH = Math.floor(istH);
                        const ampm = displayH >= 12 ? 'PM' : 'AM';
                        const h12 = displayH % 12 || 12;
                        return {
                          hour: `${h12}${ampm}`,
                          logins: hourMap[utcH] || 0,
                          _utcH: utcH,
                        };
                      });
                      const istMidnightUTC = Math.floor((24 - IST_OFFSET) % 24);
                      const startIdx = full24.findIndex(h => h._utcH === istMidnightUTC);
                      const chartData = startIdx >= 0 ? [...full24.slice(startIdx), ...full24.slice(0, startIdx)] : full24;
                      const totalLogins = chartData.reduce((s, d) => s + d.logins, 0);

                      return totalLogins > 0 ? (
                        <div style={{ width: '100%', height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                              <XAxis dataKey="hour" stroke="var(--muted2)" tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={2} />
                              <YAxis stroke="var(--muted2)" tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                              <Tooltip content={<CTip />} />
                              <Bar dataKey="logins" fill="var(--cyan)" radius={[4, 4, 0, 0]} barSize={14} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10">
                          <Activity className="w-6 h-6 mb-2" style={{ color: 'var(--muted2)' }} />
                          <p className="text-xs" style={{ color: 'var(--muted)' }}>No logins in the last 24 hours</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Overview fallback when stats failed to load */}
          {!loading && nav === 'overview' && !stats && (
            <div className="flex flex-col items-center justify-center py-20 animate-in">
              <ShieldAlert className="w-10 h-10 mb-4" style={{ color: 'var(--muted)' }} />
              <p className="text-sm font-medium mb-1">Failed to load dashboard</p>
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>Could not fetch admin stats</p>
              <button onClick={async () => { setLoading(true); await fetchS(); setLoading(false); }} className="btn-primary flex items-center gap-2 text-xs px-4 py-2">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {/* USERS */}
          {!loading && nav === 'users' && (
            <div className="animate-in space-y-4">
              {/* Desktop table */}
              <div className="hidden md:block" style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={Users} title="Users" subtitle={`${users.length} registered \u2014 ${users.filter(u => u.isBlocked).length} blocked \u2014 ${users.filter(u => u.totpEnabled).length} with TOTP`} color="var(--cyan)" bgColor="rgba(6,182,212,0.1)"
                  action={<button onClick={fetchU} className="icon-btn" aria-label="Refresh users"><RefreshCw className="w-4 h-4" /></button>}
                />
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr>
                      <th>User</th><th>Role</th><th className="text-center">Logins</th><th>Last IP</th><th className="text-center">Risk</th><th className="text-center">TOTP</th><th className="text-center">Status</th><th className="text-center">Actions</th>
                    </tr></thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} style={u.isBlocked ? { background: 'rgba(239,68,68,0.03)' } : {}}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{
                                background: u.isBlocked ? 'rgba(239,68,68,0.08)' : 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(139,92,246,0.06))',
                                color: u.isBlocked ? 'var(--red)' : 'var(--cyan)',
                                border: `1px solid ${u.isBlocked ? 'rgba(239,68,68,0.12)' : 'rgba(6,182,212,0.1)'}`,
                              }}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                              <div className="min-w-0">
                                <p className="font-medium text-xs truncate">{u.name}</p>
                                <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                              background: u.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
                              color: u.role === 'admin' ? 'var(--violet)' : 'var(--muted)',
                              border: `1px solid ${u.role === 'admin' ? 'rgba(139,92,246,0.12)' : 'var(--border)'}`,
                            }}>{u.role}</span>
                          </td>
                          <td className="text-center" style={{ fontFamily: 'var(--mono)' }}>{u.loginCount}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: '0.68rem' }}>{u.lastLoginIP || '\u2014'}</td>
                          <td className="text-center"><RiskBadge level={u.currentRiskLevel} /></td>
                          <td className="text-center">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{
                              background: u.totpEnabled ? 'rgba(34,197,94,0.08)' : 'transparent',
                              color: u.totpEnabled ? 'var(--green)' : 'var(--muted)',
                            }}>{u.totpEnabled ? 'ON' : '\u2014'}</span>
                          </td>
                          <td className="text-center">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{
                              background: u.isBlocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.08)',
                              color: u.isBlocked ? 'var(--red)' : 'var(--green)',
                            }}>{u.isBlocked ? 'Blocked' : 'Active'}</span>
                          </td>
                          <td>
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => toggleBlock(u.id)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all" title={u.isBlocked ? 'Unblock' : 'Block'} style={{
                                background: u.isBlocked ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                                border: `1px solid ${u.isBlocked ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
                                color: u.isBlocked ? 'var(--green)' : 'var(--red)',
                              }}>
                                {u.isBlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                <span className="hidden lg:inline">{u.isBlocked ? 'Unblock' : 'Block'}</span>
                              </button>
                              {u.totpEnabled && <button onClick={() => setAdminConfirm({ action: 'resetTOTP', id: u.id, email: u.email, title: `Reset authenticator for ${u.email}?`, message: 'The user will need to set up their authenticator again.' })} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all" title="Reset Authenticator" style={{
                                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)', color: 'var(--amber)',
                              }}>
                                <Smartphone className="w-3 h-3" />
                                <span className="hidden lg:inline">Reset</span>
                              </button>}
                              <button onClick={async () => {
                                try {
                                  const { data } = await api.get(`/admin/users/${u.id}/report`);
                                  generateUserActivityPDF(data.data);
                                  toast.success('Report downloaded');
                                } catch { toast.error('Failed to generate report'); }
                              }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all" title="Download Report" style={{
                                background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.12)', color: 'var(--cyan)',
                              }}>
                                <Download className="w-3 h-3" />
                                <span className="hidden lg:inline">Report</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.15)' }}>
                      <Users className="w-4 h-4" style={{ color: 'var(--cyan)' }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Users</h3>
                      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{users.length} registered</p>
                    </div>
                  </div>
                  <button onClick={fetchU} className="icon-btn" aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
                </div>
                {users.map(u => (
                  <div key={u.id} className="rounded-xl overflow-hidden" style={{
                    background: u.isBlocked ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${u.isBlocked ? 'rgba(239,68,68,0.1)' : 'var(--border)'}`,
                  }}>
                    <div className="p-3.5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0" style={{
                          background: u.isBlocked ? 'rgba(239,68,68,0.08)' : 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(139,92,246,0.06))',
                          color: u.isBlocked ? 'var(--red)' : 'var(--cyan)',
                          border: `1px solid ${u.isBlocked ? 'rgba(239,68,68,0.12)' : 'rgba(6,182,212,0.1)'}`,
                        }}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{u.name}</p>
                          <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{u.email}</p>
                        </div>
                        <RiskBadge level={u.currentRiskLevel} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{
                          background: u.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
                          color: u.role === 'admin' ? 'var(--violet)' : 'var(--muted)',
                        }}>{u.role}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{
                          background: u.isBlocked ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.08)',
                          color: u.isBlocked ? 'var(--red)' : 'var(--green)',
                        }}>{u.isBlocked ? 'Blocked' : 'Active'}</span>
                        {u.totpEnabled && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.08)', color: 'var(--green)' }}>TOTP</span>}
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{u.loginCount} logins</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{u.lastLoginIP || 'No login yet'}</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => toggleBlock(u.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium" style={{
                            background: u.isBlocked ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${u.isBlocked ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
                            color: u.isBlocked ? 'var(--green)' : 'var(--red)',
                          }}>
                            {u.isBlocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {u.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                          {u.totpEnabled && <button onClick={() => setAdminConfirm({ action: 'resetTOTP', id: u.id, email: u.email, title: `Reset authenticator for ${u.email}?`, message: 'The user will need to set up their authenticator again.' })} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium" style={{
                            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)', color: 'var(--amber)',
                          }}>
                            <Smartphone className="w-3 h-3" /> Reset
                          </button>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AUDIT */}
          {nav === 'audit' && (() => {
            const actionLabels = {
              login_success: 'Login Success', login_failed: 'Login Failed', login_blocked: 'Login Blocked',
              login_initiated: 'Step-Up Required', step_up_success: 'Step-Up Passed', step_up_failed: 'Step-Up Failed',
              step_up_triggered: 'Step-Up Triggered', step_up_triggered_ueba_down: 'Step-Up (UEBA Down)',
              file_upload: 'File Upload', file_download: 'File Download', file_delete: 'File Delete',
              bulk_download_detected: 'Bulk Download', restricted_access_attempt: 'Restricted Access',
              session_terminated: 'Session Blocked', access_denied: 'Access Denied',
              password_change: 'Password Changed', password_reset_completed: 'Password Reset',
              device_trust_revoked: 'Device Revoked', session_revoked: 'Session Revoked',
              user_blocked: 'User Blocked', user_unblocked: 'User Unblocked',
              ip_blacklisted: 'IP Blacklisted', ip_whitelisted: 'IP Whitelisted',
              admin_unblock_verified: 'Admin Unblock', admin_dismiss_block: 'Block Dismissed',
              admin_escalate_block: 'Block Escalated', totp_reset: 'TOTP Reset',
              account_locked: 'Account Locked', geo_country_blocked: 'Geo Blocked', geo_country_allowed: 'Geo Allowed',
            };

            const actionCategories = [
              { label: 'Authentication', actions: ['login_success', 'login_failed', 'login_blocked', 'login_initiated', 'account_locked'] },
              { label: 'Step-Up', actions: ['step_up_success', 'step_up_failed', 'step_up_triggered', 'step_up_triggered_ueba_down'] },
              { label: 'Files', actions: ['file_upload', 'file_download', 'file_delete', 'bulk_download_detected'] },
              { label: 'Sessions', actions: ['session_terminated', 'access_denied', 'device_trust_revoked', 'session_revoked'] },
              { label: 'Account', actions: ['password_change', 'password_reset_completed'] },
              { label: 'Admin', actions: ['user_blocked', 'user_unblocked', 'ip_blacklisted', 'ip_whitelisted', 'admin_unblock_verified', 'admin_dismiss_block', 'admin_escalate_block', 'totp_reset', 'geo_country_blocked', 'geo_country_allowed'] },
            ];

            const actionColor = (action) => {
              if (['login_success', 'step_up_success', 'admin_unblock_verified', 'user_unblocked', 'geo_country_allowed'].includes(action)) return 'var(--green)';
              if (['login_failed', 'step_up_failed', 'login_blocked', 'session_terminated', 'access_denied', 'account_locked', 'admin_escalate_block', 'geo_country_blocked'].includes(action)) return 'var(--red)';
              if (['login_initiated', 'step_up_triggered', 'step_up_triggered_ueba_down', 'bulk_download_detected', 'device_trust_revoked', 'user_blocked', 'ip_blacklisted'].includes(action)) return 'var(--amber)';
              if (['file_upload', 'file_download'].includes(action)) return 'var(--cyan)';
              return 'var(--text2)';
            };

            const riskDots = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)' };

            const fmtTime = (iso) => {
              const d = new Date(iso);
              return d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' }) + '  ' +
                d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
            };

            return (
            <div className="animate-in space-y-4">
              {/* Filters card */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={ScrollText} title="Audit Logs" subtitle="Security event history across all users" color="var(--violet)" bgColor="rgba(139,92,246,0.1)"
                  action={
                    <div className="flex items-center gap-1.5">
                      <button onClick={exportCSV} className="btn-secondary text-[10px] py-1.5 px-3 flex items-center gap-1.5"><Download className="w-3 h-3" />CSV</button>
                      <button onClick={() => generateAuditPDF({ stats, logs, users })} className="btn-secondary text-[10px] py-1.5 px-3 flex items-center gap-1.5"><Download className="w-3 h-3" />PDF</button>
                    </div>
                  }
                />
                <div className="px-4 sm:px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="label" style={{ fontSize: '0.55rem' }}>Event</span>
                      <select
                        value={lf.action}
                        onChange={e => { setLf(f => ({ ...f, action: e.target.value })); setLp(1); }}
                        className="text-[11px] py-1.5 px-2.5 w-auto"
                        style={{ minWidth: '150px' }}
                      >
                        <option value="">All Events</option>
                        {actionCategories.map(cat => (
                          <optgroup key={cat.label} label={`\u2500\u2500 ${cat.label}`}>
                            {cat.actions.map(a => (
                              <option key={a} value={a}>{actionLabels[a] || a}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="label" style={{ fontSize: '0.55rem' }}>Risk</span>
                      <div className="flex items-center gap-1">
                        {[
                          { value: '', label: 'All' },
                          { value: 'low', label: 'Low', color: 'var(--green)' },
                          { value: 'medium', label: 'Med', color: 'var(--amber)' },
                          { value: 'high', label: 'High', color: 'var(--red)' },
                        ].map(r => (
                          <button
                            key={r.value}
                            onClick={() => { setLf(f => ({ ...f, riskLevel: r.value })); setLp(1); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all"
                            style={{
                              background: lf.riskLevel === r.value ? (r.color ? `${r.color}18` : 'var(--surface3)') : 'transparent',
                              border: lf.riskLevel === r.value ? `1px solid ${r.color || 'var(--border2)'}30` : '1px solid transparent',
                              color: lf.riskLevel === r.value ? (r.color || 'var(--text)') : 'var(--muted)',
                            }}
                          >
                            {r.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.color }} />}
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block" style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '140px' }}>Timestamp</th>
                        <th>User</th>
                        <th>Event</th>
                        <th>IP Address</th>
                        <th className="text-center" style={{ width: '70px' }}>Risk</th>
                        <th className="text-center" style={{ width: '50px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => {
                        const ac = actionColor(l.action);
                        return (
                          <tr key={l.id}>
                            <td style={{ color: 'var(--muted)', fontSize: '0.65rem', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                              {fmtTime(l.createdAt)}
                            </td>
                            <td>
                              <span className="text-xs" style={{ color: 'var(--text2)' }}>{l.user?.email || '\u2014'}</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ac }} />
                                <span className="text-xs font-medium" style={{ color: ac }}>
                                  {actionLabels[l.action] || l.action.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </td>
                            <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: '0.65rem' }}>
                              {l.ipAddress || '\u2014'}
                            </td>
                            <td className="text-center">
                              {l.riskLevel ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{
                                  background: `${riskDots[l.riskLevel] || 'var(--muted)'}12`,
                                  color: riskDots[l.riskLevel] || 'var(--muted)',
                                  border: `1px solid ${riskDots[l.riskLevel] || 'var(--muted)'}20`,
                                }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: riskDots[l.riskLevel] }} />
                                  {l.riskScore || l.riskLevel}
                                </span>
                              ) : (
                                <span className="text-[10px]" style={{ color: 'var(--muted2)' }}>\u2014</span>
                              )}
                            </td>
                            <td className="text-center">
                              <span className="text-xs font-bold" style={{ color: l.success ? 'var(--green)' : 'var(--red)' }}>
                                {l.success ? '\u2713' : '\u2717'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    Page {lp} of {lps}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLp(1)} disabled={lp <= 1} className="icon-btn p-1 disabled:opacity-20" aria-label="First page"><ChevronLeft className="w-3 h-3" /><ChevronLeft className="w-3 h-3 -ml-2" /></button>
                    <button onClick={() => setLp(p => Math.max(1, p - 1))} disabled={lp <= 1} className="icon-btn p-1 disabled:opacity-20" aria-label="Previous page"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span className="text-[10px] px-2 font-medium" style={{ fontFamily: 'var(--mono)' }}>{lp}</span>
                    <button onClick={() => setLp(p => Math.min(lps, p + 1))} disabled={lp >= lps} className="icon-btn p-1 disabled:opacity-20" aria-label="Next page"><ChevronRight className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setLp(lps)} disabled={lp >= lps} className="icon-btn p-1 disabled:opacity-20" aria-label="Last page"><ChevronRight className="w-3 h-3" /><ChevronRight className="w-3 h-3 -ml-2" /></button>
                  </div>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-2">
                {logs.map(l => {
                  const ac = actionColor(l.action);
                  return (
                    <div key={l.id} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: ac }} />
                          <span className="text-[11px] font-semibold" style={{ color: ac }}>
                            {actionLabels[l.action] || l.action.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {l.riskLevel && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                              background: `${riskDots[l.riskLevel]}12`,
                              color: riskDots[l.riskLevel],
                            }}>
                              {l.riskScore || l.riskLevel.toUpperCase()}
                            </span>
                          )}
                          <span className="text-xs font-bold" style={{ color: l.success ? 'var(--green)' : 'var(--red)' }}>
                            {l.success ? '\u2713' : '\u2717'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text2)' }}>{l.user?.email || '\u2014'}</span>
                        <span className="text-[9px]" style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{l.ipAddress || ''}</span>
                      </div>
                      <div className="mt-1.5">
                        <span className="text-[9px]" style={{ fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>
                          {fmtTime(l.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Page {lp}/{lps}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setLp(p => Math.max(1, p - 1))} disabled={lp <= 1} className="icon-btn p-1 disabled:opacity-20" aria-label="Previous page"><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setLp(p => Math.min(lps, p + 1))} disabled={lp >= lps} className="icon-btn p-1 disabled:opacity-20" aria-label="Next page"><ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ACTION CENTER */}
          {nav === 'action' && (
            <div className="animate-in space-y-5">
              {/* Header card */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={ShieldCheck} title="Action Center" subtitle="Review blocked sessions and manage account access" color="var(--amber)" bgColor="rgba(245,158,11,0.1)"
                  action={<button onClick={fetchBlocked} className="icon-btn" aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>}
                />

                {/* Warning banner */}
                <div className="mx-4 sm:mx-5 my-3 flex items-start gap-3 px-4 py-3 rounded-xl" style={{
                  background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)',
                }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--red)' }}>High-risk logins (score &gt; 60) are automatically blocked</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>Device sessions are blocked for 1 hour. You can dismiss, unblock, or escalate to a full account block.</p>
                  </div>
                </div>

                {/* Content */}
                {blockedUsers.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--green)', opacity: 0.5 }} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>No flagged users</p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>No blocked sessions or accounts in the last 24 hours.</p>
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 space-y-3">
                    {blockedUsers.map(u => (
                      <div key={u.id} className="p-4 rounded-xl" style={{
                        background: u.blockType === 'account' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.03)',
                        border: `1px solid ${u.blockType === 'account' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'}`,
                      }}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{
                              background: u.blockType === 'account' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              color: u.blockType === 'account' ? 'var(--red)' : 'var(--amber)',
                              border: `1px solid ${u.blockType === 'account' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
                            }}>
                              {u.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-semibold">{u.name}</p>
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{
                                  background: u.blockType === 'account' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                                  color: u.blockType === 'account' ? 'var(--red)' : 'var(--amber)',
                                }}>
                                  {u.blockType === 'account' ? 'ACCOUNT BLOCKED' : 'DEVICE BLOCKED'}
                                </span>
                              </div>
                              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{u.email}</p>
                              <div className="flex flex-wrap items-center gap-3 mt-1">
                                <span className="text-[10px]" style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>Score: {u.lastRiskScore}</span>
                                <span className="text-[10px]" style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>IP: {u.lastLoginIP || '\u2014'}</span>
                                {u.blockedAt && <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{new Date(u.blockedAt).toLocaleString()}</span>}
                              </div>
                              {u.blockedFactors?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {u.blockedFactors.slice(0, 3).map((f, i) => (
                                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.06)' }}>{f}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {u.blockType === 'account' ? (
                              <button onClick={() => startUnblock(u)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all" style={{
                                background: 'rgba(16,185,129,0.08)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.15)',
                              }}>
                                <Unlock className="w-3.5 h-3.5" /> Verify & Unblock
                              </button>
                            ) : (
                              <>
                                <button onClick={async () => { try { await api.post('/admin/action-center/dismiss', { userId: u.id }); toast.success('Dismissed'); fetchBlocked(); } catch { toast.error('Failed'); } }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all" style={{
                                  background: 'rgba(255,255,255,0.04)', color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                  Dismiss
                                </button>
                                <button onClick={() => setAdminConfirm({ action: 'escalate', id: u.id, email: u.email, title: `Permanently block ${u.email}?`, message: 'This will block the entire account across all devices. The user will not be able to log in.' })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all" style={{
                                  background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.15)',
                                }}>
                                  Block Account
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* IP CONTROL */}
          {nav === 'ip' && (
            <div className="animate-in space-y-4">
              {/* Add IP card */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={Globe} title="IP Control" subtitle="Manage IP blacklist and whitelist" color="var(--blue)" bgColor="rgba(59,130,246,0.1)" />
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={newIP} onChange={e => setNewIP(e.target.value)} placeholder="Enter IP address" className="flex-1 text-xs py-2" />
                    <div className="flex gap-2">
                      <button onClick={() => addIP('blacklist')} className="btn-danger text-[11px] py-2 flex-1 sm:flex-none flex items-center justify-center gap-1"><WifiOff className="w-3 h-3" />Block</button>
                      <button onClick={() => addIP('whitelist')} className="btn-primary text-[11px] py-2 flex-1 sm:flex-none flex items-center justify-center gap-1"><Wifi className="w-3 h-3" />Allow</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* IP Lists */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { t: 'Blacklisted', l: ipList.blacklisted, tp: 'blacklist', c: 'var(--red)', I: WifiOff, bg: 'rgba(239,68,68,0.1)' },
                  { t: 'Whitelisted', l: ipList.whitelisted, tp: 'whitelist', c: 'var(--green)', I: Wifi, bg: 'rgba(16,185,129,0.1)' },
                ].map(({ t, l, tp, c, I, bg }) => (
                  <div key={tp} style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                    <SectionHeader icon={I} title={t} subtitle={`${l.length} ${l.length === 1 ? 'address' : 'addresses'}`} color={c} bgColor={bg} />
                    <div className="p-3 sm:p-4">
                      {l.length === 0 ? (
                        <p className="text-[11px] text-center py-6" style={{ color: 'var(--muted)' }}>No IPs in this list</p>
                      ) : (
                        <div className="space-y-1.5">
                          {l.map(ip => (
                            <div key={ip} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                              <span className="text-[11px]" style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{ip}</span>
                              <button onClick={() => removeIP(ip, tp)} className="icon-btn p-1" aria-label={`Remove ${ip}`}><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIVE FEED */}
          {nav === 'live' && (
            <div className="space-y-4 animate-in">
              {/* Live graph */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={TrendingUp} title="Live Risk Graph" subtitle="Real-time risk scores" color="var(--red)" bgColor="rgba(239,68,68,0.1)"
                  action={
                    <div className="flex items-center gap-1.5">
                      <div className="dot-pulse" style={{ background: 'var(--red)' }} />
                      <span className="text-[10px]" style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 600 }}>LIVE</span>
                    </div>
                  }
                />
                <div className="p-4">
                  <RiskCurveGraph key="live-feed-graph" height={200} isAdmin liveOnly showTitle={false} />
                </div>
              </div>

              {/* Live events */}
              <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={Radio} title="Live Events" subtitle={`${live.length} events captured`} color="var(--cyan)" bgColor="rgba(6,182,212,0.1)"
                  action={
                    <div className="flex items-center gap-1.5">
                      <div className="dot-pulse" style={{ background: 'var(--red)' }} />
                      <span className="text-[10px]" style={{ fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }}>LIVE</span>
                    </div>
                  }
                />
                {live.length === 0 ? (
                  <div className="text-center py-16">
                    <Radio className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--muted2)' }} />
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Waiting for events...</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--muted2)' }}>Events will appear here in real-time</p>
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 space-y-1.5 max-h-[400px] overflow-auto">
                    {live.map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-all" style={{
                        background: e.riskLevel === 'high' || e.action === 'blocked' || e.action === 'auto_blocked'
                          ? 'rgba(239,68,68,0.06)' : e.action === 'bulk_download'
                          ? 'rgba(245,158,11,0.06)' : 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                            background: e.riskLevel === 'high' ? 'var(--red)' : e.riskLevel === 'medium' ? 'var(--amber)' : 'var(--green)',
                            boxShadow: `0 0 8px ${e.riskLevel === 'high' ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                          }} />
                          <div className="min-w-0">
                            <p className="text-[11px] truncate">
                              <span className="font-medium" style={{
                                color: e.action === 'auto_blocked' ? 'var(--red)' : e.action === 'bulk_download' ? 'var(--amber)' : 'var(--text2)',
                              }}>{getEventLabel(e)}</span>
                              {' \u2014 '}<span style={{ color: 'var(--text2)' }}>{e.email}</span>
                            </p>
                            {e.geoInfo && !e.geoInfo.is_private && (
                              <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{e.geoInfo.city}, {e.geoInfo.country}</p>
                            )}
                            {e.details && <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{e.details}</p>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <RiskBadge level={e.riskLevel} />
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                            {new Date(e.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Right Sidebar */}
      <aside className="hidden xl:flex w-[250px] flex-shrink-0 overflow-auto flex-col" style={{
        background: 'var(--panel-bg)', backdropFilter: 'blur(16px)',
        borderLeft: '1px solid var(--border)',
      }}>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.12)' }}>
              <Activity className="w-3 h-3" style={{ color: 'var(--cyan)' }} />
            </div>
            <h3 className="text-xs font-bold">Notifications</h3>
          </div>
          {live.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-start gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: e.riskLevel === 'high' ? 'rgba(239,68,68,0.1)' : 'var(--surface)', border: '1px solid var(--border)' }}>
                <Activity className="w-3 h-3" style={{ color: e.riskLevel === 'high' ? 'var(--red)' : e.riskLevel === 'medium' ? 'var(--amber)' : 'var(--green)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-tight truncate">
                  {getEventLabel(e)}: <span style={{ color: 'var(--text2)' }}>{e.email?.split('@')[0]}</span>
                </p>
                <p className="text-[10px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{new Date(e.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
          {live.length === 0 && <p className="text-[11px]" style={{ color: 'var(--muted)' }}>No recent events.</p>}
        </div>

        <div className="divider mx-5" />

        <div className="px-5 py-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <Users className="w-3 h-3" style={{ color: 'var(--violet)' }} />
            </div>
            <h3 className="text-xs font-bold">Users</h3>
          </div>
          {users.slice(0, 6).map(u => (
            <div key={u.id} className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan)' }}>
                  {u.name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] truncate">{u.name}</p>
                  <p className="text-[9px] truncate" style={{ color: 'var(--muted)' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</p>
                </div>
              </div>
              <RiskBadge level={u.currentRiskLevel} />
            </div>
          ))}
        </div>

        <div className="divider mx-5" />

        <div className="px-5 py-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.12)' }}>
              <BarChart3 className="w-3 h-3" style={{ color: 'var(--green)' }} />
            </div>
            <h3 className="text-xs font-bold">Quick Stats</h3>
          </div>
          {stats && [
            ['Audit Entries', stats.totalLogs?.toLocaleString(), 'var(--text)'],
            ['Files', stats.totalFiles, 'var(--cyan)'],
            ['Step-Ups', stats.stepUps, 'var(--amber)'],
            ['Blocked Users', blockedUsers.length, blockedUsers.length > 0 ? 'var(--red)' : 'var(--text)'],
          ].map(([k, v, c]) => (
            <div key={k} className="flex items-center justify-between text-[11px] mb-2.5">
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{ fontFamily: 'var(--mono)', color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Unblock Verification Modal */}
      {unblockStep > 0 && unblockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 glass-overlay">
          <div className="w-full max-w-md animate-scale" style={{
            background: 'rgba(255,255,255,0.035)', backdropFilter: 'blur(32px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px',
            padding: '1.75rem', boxShadow: '0 16px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <ShieldAlert className="w-5 h-5" style={{ color: 'var(--red)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Verify to Unblock</h3>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Step {unblockStep} of 2 \u2014 {unblockStep === 1 ? 'Email OTP' : 'TOTP Authenticator'}</p>
                </div>
              </div>
              <button onClick={() => { setUnblockStep(0); setUnblockTarget(null); }} className="icon-btn" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex items-center gap-2.5 mb-5 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
              <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red)' }} />
              <div>
                <p className="text-[11px] font-semibold">{unblockTarget.name} \u2014 {unblockTarget.email}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Risk Score: {unblockTarget.lastRiskScore}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="w-2 h-2 rounded-full" style={{ background: unblockStep >= 1 ? 'var(--cyan)' : 'var(--bg3)', boxShadow: unblockStep === 1 ? '0 0 8px rgba(6,182,212,0.4)' : 'none' }} />
              <div className="w-8 h-[1px]" style={{ background: 'var(--border)' }} />
              <div className="w-2 h-2 rounded-full" style={{ background: unblockStep >= 2 ? 'var(--cyan)' : 'var(--bg3)', boxShadow: unblockStep === 2 ? '0 0 8px rgba(6,182,212,0.4)' : 'none' }} />
            </div>

            {unblockStep === 1 && (
              <div className="space-y-4">
                <p className="text-xs" style={{ color: 'var(--text2)' }}>Verify your admin identity with email OTP.</p>
                {!otpSent ? (
                  <button onClick={sendAdminOTP} disabled={acLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                    {acLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send OTP to My Email
                  </button>
                ) : (
                  <>
                    <input value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="text-center text-xl tracking-[0.4em]" style={{ fontFamily: 'var(--mono)' }} maxLength={6} autoFocus />
                    <button onClick={proceedToTOTP} disabled={otpCode.length !== 6} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                      <CheckCircle className="w-4 h-4" /> Next: TOTP
                    </button>
                    <button onClick={sendAdminOTP} disabled={countdown > 0 || acLoading} className="text-[11px] w-full text-center transition-colors" style={{ color: 'var(--muted)' }}>
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                    </button>
                  </>
                )}
              </div>
            )}

            {unblockStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs" style={{ color: 'var(--text2)' }}>Enter the 6-digit code from your authenticator app.</p>
                <input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="text-center text-xl tracking-[0.4em]" style={{ fontFamily: 'var(--mono)' }} maxLength={6} autoFocus />
                <button onClick={verifyUnblock} disabled={totpCode.length !== 6 || acLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                  {acLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />} Verify & Unblock
                </button>
                <button onClick={() => setUnblockStep(1)} className="text-[11px] w-full text-center transition-colors" style={{ color: 'var(--muted)' }}>
                  Back to OTP
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alert Popups */}
      {alerts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-[90vw] sm:max-w-[380px]">
          {alerts.map(a => {
            const alertColor = a.type === 'critical' ? 'var(--red)' : a.type === 'info' ? 'var(--cyan)' : 'var(--amber)';
            const alertBorder = a.type === 'critical' ? 'rgba(239,68,68,0.25)' : a.type === 'info' ? 'rgba(6,182,212,0.25)' : 'rgba(245,158,11,0.25)';
            const alertShadow = a.type === 'critical' ? '0 0 40px rgba(239,68,68,0.1)' : a.type === 'info' ? '0 0 30px rgba(6,182,212,0.08)' : '0 0 30px rgba(245,158,11,0.08)';
            return (
            <div key={a.id} className="animate-slide" style={{
              background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
              border: `1px solid ${alertBorder}`,
              borderRadius: 'var(--radius)', padding: '1rem',
              boxShadow: alertShadow,
            }}>
              <div className="flex justify-between items-start mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="dot-pulse" style={{ width: 6, height: 6, background: alertColor }} />
                  <span className="text-xs font-bold" style={{ color: alertColor }}>{a.title}</span>
                </div>
                <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} className="icon-btn p-0.5" aria-label="Dismiss alert"><X className="w-3 h-3" /></button>
              </div>
              <p className="text-xs pl-4" style={{ color: 'var(--text2)' }}>{a.message}</p>
              {a.factors?.length > 0 && <p className="text-[10px] pl-4 mt-1" style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{a.factors.slice(0, 2).join(' \u00b7 ')}</p>}
              <p className="text-[9px] pl-4 mt-1" style={{ fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>{new Date(a.timestamp).toLocaleTimeString()}</p>
            </div>
          );})}
        </div>
      )}

      <ConfirmModal
        isOpen={!!adminConfirm}
        onConfirm={async () => {
          if (!adminConfirm) return;
          if (adminConfirm.action === 'resetTOTP') {
            resetTOTP(adminConfirm.id, adminConfirm.email);
          } else if (adminConfirm.action === 'escalate') {
            try { await api.post('/admin/action-center/escalate', { userId: adminConfirm.id }); toast.success(`${adminConfirm.email} account blocked`); fetchBlocked(); fetchU(); } catch { toast.error('Failed'); }
          }
          setAdminConfirm(null);
        }}
        onCancel={() => setAdminConfirm(null)}
        title={adminConfirm?.title || 'Confirm'}
        message={adminConfirm?.message || 'Are you sure?'}
        confirmText={adminConfirm?.action === 'escalate' ? 'Block Account' : 'Reset'}
        variant="danger"
      />
    </div>
  );
};

export default AdminDashboard;
