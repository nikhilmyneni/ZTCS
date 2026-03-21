import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, LogOut, HardDrive, Settings, History, Menu, X, ChevronRight, Monitor, BarChart3, Download, Upload, AlertTriangle, Wifi, Loader2 } from 'lucide-react';
import FileManager from '../components/files/FileManager';
import RiskCurveGraph from '../components/dashboard/RiskCurveGraph';
import StepUpModal from '../components/auth/StepUpModal';
import SecuritySettings from '../components/dashboard/SecuritySettings';
import LoginHistory from '../components/dashboard/LoginHistory';
import ActiveSessions from '../components/dashboard/ActiveSessions';
import ActivityTimeline from '../components/dashboard/ActivityTimeline';
import api, { stepUpEvents } from '../utils/api';
import toast from 'react-hot-toast';
import NotificationBell from '../components/common/NotificationBell';
import { generateUserActivityPDF } from '../utils/pdfExport';

const DashboardPage = () => {
  const { user, logout, isAdmin, riskAssessment } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('files');
  const [showStepUp, setShowStepUp] = useState(false);
  const [stepUpOk, setStepUpOk] = useState(false);
  const [stepUpChallenges, setStepUpChallenges] = useState([]);
  const [stepUpReason, setStepUpReason] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [activitySummary, setActivitySummary] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);

  useEffect(() => {
    api.get('/files').then(({ data }) => {
      const files = data.data.files || data.data;
      setFileCount(Array.isArray(files) ? files.length : (data.data.count || 0));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/stepup/status').then(({ data }) => {
      const s = data.data;
      if (s.required && !s.verified) {
        setStepUpChallenges(s.requiredChallenges || []);
        setStepUpReason(s.challengeReason || '');
        setShowStepUp(true);
      }
      if (s.verified) setStepUpOk(true);
      setStatusChecked(true);
    }).catch(() => { setStatusChecked(true); });
  }, []);

  // Subscribe to step-up events from api interceptor (e.g. 403 during file ops)
  useEffect(() => {
    const handleStepUp = ({ requiredChallenges, challengeReason }) => {
      if (!stepUpOk) {
        setStepUpChallenges(requiredChallenges || []);
        setStepUpReason(challengeReason || '');
        setShowStepUp(true);
      }
    };
    stepUpEvents.on(handleStepUp);
    return () => stepUpEvents.off(handleStepUp);
  }, [stepUpOk]);

  // Only check riskAssessment after status has been fetched to avoid race condition
  useEffect(() => {
    if (statusChecked && riskAssessment?.level === 'medium' && !stepUpOk) setShowStepUp(true);
  }, [riskAssessment, stepUpOk, statusChecked]);

  // Close sidebar on tab change (mobile)
  const switchTab = (id) => {
    setTab(id);
    setSidebarOpen(false);
  };

  // Display the user's historical average risk score (from riskHistory on server)
  // riskAssessment is only used for session-level step-up gating, not display
  const rs = user?.avgRiskScore ?? 0;
  const rl = user?.avgRiskLevel ?? 'low';
  const rc = rl === 'high' ? 'var(--red)' : rl === 'medium' ? 'var(--amber)' : 'var(--green)';

  // Fetch activity summary when activity tab is selected
  useEffect(() => {
    if (tab === 'activity' && !activitySummary) {
      setActivityLoading(true);
      api.get('/auth/activity-summary')
        .then(({ data }) => setActivitySummary(data.data))
        .catch(() => {})
        .finally(() => setActivityLoading(false));
    }
  }, [tab, activitySummary]);

  const downloadMyReport = async () => {
    setReportGenerating(true);
    try {
      const [summaryRes, logsRes] = await Promise.all([
        activitySummary ? Promise.resolve({ data: { data: activitySummary } }) : api.get('/auth/activity-summary'),
        api.get('/auth/activity-timeline'),
      ]);
      const summary = summaryRes.data.data;
      const timeline = logsRes.data.data.timeline || [];
      generateUserActivityPDF({
        user: { email: user.email, name: user.name, role: user.role || 'user', createdAt: user.createdAt },
        activity: summary,
        riskHistory: summary.riskHistory || [],
        recentLogs: timeline.map(t => ({ action: t.action, ipAddress: t.ipAddress, riskScore: t.riskScore, riskLevel: t.riskLevel, time: t.time })),
      });
    } catch { toast.error('Failed to generate report.'); }
    finally { setReportGenerating(false); }
  };

  const navItems = [
    { id: 'files', label: 'Files', icon: HardDrive },
    { id: 'activity', label: 'Activity', icon: BarChart3 },
    { id: 'timeline', label: 'Timeline', icon: History },
    { id: 'sessions', label: 'Sessions', icon: Monitor },
    { id: 'history', label: 'Login Log', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Panel', icon: Shield }] : []),
  ];

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden glass-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative z-50 lg:z-auto
        w-[var(--sidebar)] h-full flex-shrink-0 flex flex-col
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{
        background: 'rgba(12,12,20,0.95)', backdropFilter: 'blur(24px)',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Logo */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
              background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)',
              boxShadow: '0 0 20px rgba(6,182,212,0.08)',
            }}>
              <Shield className="w-4.5 h-4.5" style={{ color: 'var(--cyan)' }} />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight">ZTCS</span>
              <span className="text-[8px] ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 600 }}>SECURE</span>
            </div>
          </div>
          <button className="lg:hidden icon-btn" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <div className="px-3 mt-2">
          <p className="label px-2.5 mb-2">Navigation</p>
          <nav className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon }) => (
              <div key={id} className={`sidebar-item ${tab === id ? 'active' : ''}`} onClick={() => switchTab(id)}>
                <Icon className="w-4 h-4" /><span>{label}</span>
              </div>
            ))}
          </nav>
        </div>

        {/* Risk Card */}
        <div className="mx-3 mt-auto mb-3">
          <div style={{
            background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '0.85rem',
          }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="label">Risk Score</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: rc, fontFamily: 'var(--mono)' }}>{rs}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(rs, 100)}%`, background: rc }} />
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{fileCount} files</span>
              <span className={rl === 'low' ? 'risk-low' : rl === 'medium' ? 'risk-medium' : 'risk-high'}>{rl}</span>
            </div>
          </div>
        </div>

        {/* User */}
        <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold" style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.08))',
              color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.1)',
            }}>
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{user?.email}</p>
            </div>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="icon-btn" aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[var(--header)] flex items-center justify-between px-4 sm:px-6 flex-shrink-0" style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(12,12,20,0.6)', backdropFilter: 'blur(16px)',
        }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-semibold">
              {tab === 'files' && 'My Files'}
              {tab === 'activity' && 'Activity Overview'}
              {tab === 'timeline' && 'Activity Timeline'}
              {tab === 'sessions' && 'Sessions & Devices'}
              {tab === 'history' && 'Login Log'}
              {tab === 'settings' && 'Account Settings'}
              {tab === 'admin' && 'Admin Panel'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="flex items-center gap-2">
              <div className="dot-pulse" style={{ background: 'var(--green)' }} />
              <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 600 }}>SECURE</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {tab === 'files' && <FileManager />}
          {tab === 'activity' && (
            <div className="animate-in space-y-5">
              {activityLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--muted)' }} /></div>
              ) : activitySummary ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: 'Total Logins', value: activitySummary.totalLogins, icon: Monitor, color: 'var(--cyan)' },
                      { label: 'Files Uploaded', value: activitySummary.fileUploads, icon: Upload, color: 'var(--green)' },
                      { label: 'Files Downloaded', value: activitySummary.fileDownloads, icon: Download, color: 'var(--violet)' },
                      { label: 'Security Events', value: activitySummary.securityEvents, icon: AlertTriangle, color: 'var(--amber)' },
                      { label: 'Avg Risk Score', value: activitySummary.avgRiskScore, icon: Shield, color: activitySummary.avgRiskScore > 60 ? 'var(--red)' : activitySummary.avgRiskScore > 30 ? 'var(--amber)' : 'var(--green)' },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="card p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="w-4 h-4" style={{ color }} />
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</span>
                        </div>
                        <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--mono)', color }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Details Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="card p-4">
                      <span className="label">Logins This Week</span>
                      <p className="text-lg font-bold mt-1" style={{ fontFamily: 'var(--mono)' }}>{activitySummary.loginsThisWeek}</p>
                    </div>
                    <div className="card p-4">
                      <span className="label">Known Devices</span>
                      <p className="text-lg font-bold mt-1" style={{ fontFamily: 'var(--mono)' }}>{activitySummary.activeDevices}</p>
                    </div>
                    <div className="card p-4">
                      <span className="label">Known IPs</span>
                      <p className="text-lg font-bold mt-1" style={{ fontFamily: 'var(--mono)' }}>{activitySummary.knownIPs}</p>
                    </div>
                  </div>

                  {/* Download Report Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={downloadMyReport}
                      disabled={reportGenerating}
                      className="btn-primary flex items-center gap-2 px-4 py-2.5 text-xs"
                    >
                      {reportGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {reportGenerating ? 'Generating...' : 'Download Activity Report'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-16">
                  <BarChart3 className="w-12 h-12 mb-3" style={{ color: 'var(--muted2)' }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Failed to load activity data.</p>
                </div>
              )}
            </div>
          )}
          {tab === 'timeline' && (
            <div className="animate-in flex flex-col xl:flex-row gap-5" style={{ height: 'calc(100vh - var(--header) - 3rem)' }}>
              {/* Timeline — scrollable event list */}
              <div className="card flex flex-col min-h-0 flex-1 xl:flex-[2]" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="px-4 sm:px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <h3 className="text-sm font-semibold">Recent Security Events</h3>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Last 30 events across all activity</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ActivityTimeline />
                </div>
              </div>
              {/* Risk graph sidebar — scrolls independently on xl, stacks below on mobile */}
              <div className="xl:flex-1 xl:min-h-0 xl:overflow-y-auto flex-shrink-0">
                <div className="card sticky top-0" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="px-4 sm:px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h3 className="text-sm font-semibold">Risk Trend</h3>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Your session risk scores over time</p>
                  </div>
                  <div className="p-3">
                    <RiskCurveGraph />
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === 'sessions' && <ActiveSessions />}
          {tab === 'history' && <LoginHistory />}
          {tab === 'settings' && <SecuritySettings />}
          {tab === 'admin' && (
            <div className="flex flex-col items-center justify-center py-12 sm:py-20 animate-in">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{
                background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.15)',
                boxShadow: '0 0 40px rgba(6,182,212,0.08)',
              }}>
                <Shield className="w-8 h-8" style={{ color: 'var(--cyan)' }} />
              </div>
              <h2 className="text-lg sm:text-xl font-bold mb-2">Security Command Center</h2>
              <p className="text-xs sm:text-sm mb-6 text-center max-w-sm" style={{ color: 'var(--muted)' }}>Monitor threats, manage users, and review audit logs in real-time</p>
              <button onClick={() => navigate('/admin')} className="btn-primary flex items-center gap-2 px-6 py-3 text-sm">
                <Shield className="w-4 h-4" /> Open Admin Dashboard <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </main>

      <StepUpModal
        isOpen={showStepUp}
        onClose={() => setShowStepUp(false)}
        onVerified={() => { setShowStepUp(false); setStepUpOk(true); }}
        secretQuestion={user?.secretQuestion}
        requiredChallenges={stepUpChallenges}
        challengeReason={stepUpReason}
      />
    </div>
  );
};

export default DashboardPage;
