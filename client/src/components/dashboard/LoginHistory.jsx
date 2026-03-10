import { useState, useEffect } from 'react';
import { History, Globe, CheckCircle, XCircle, Loader2, RefreshCw, MapPin } from 'lucide-react';
import api from '../../utils/api';
import EmptyState from '../common/EmptyState';
import { SkeletonCard, SkeletonTable } from '../common/Skeleton';

const RiskBadge = ({ score, level }) => {
  if (!level) return <span className="text-[10px]" style={{ color: 'var(--muted2)' }}>{'\u2014'}</span>;
  const colors = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)' };
  const c = colors[level] || 'var(--muted)';
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{
      background: `${c}12`, color: c, border: `1px solid ${c}20`,
    }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {score ?? level}
    </span>
  );
};

const FlagBadge = ({ label, color }) => (
  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{
    background: `${color}15`, color, border: `1px solid ${color}20`,
  }}>{label}</span>
);

const formatTime = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' }) + ', ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

const LoginHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/login-history');
      setHistory(data.data.history);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchHistory(); }, []);

  if (loading) {
    return (
      <div className="space-y-5 animate-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  const successCount = history.filter(h => h.success).length;
  const failedCount = history.filter(h => !h.success).length;
  const flaggedCount = history.filter(h => h.isNewIP || h.isNewDevice || h.isNewCountry).length;
  const avgRisk = history.length > 0 ? Math.round(history.reduce((s, h) => s + (h.riskScore || 0), 0) / history.length) : 0;

  return (
    <div className="animate-in flex flex-col" style={{ height: 'calc(100vh - var(--header) - 3rem)' }}>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-5 flex-shrink-0">
        {[
          { label: 'Successful', value: successCount, color: 'var(--green)' },
          { label: 'Failed', value: failedCount, color: 'var(--red)' },
          { label: 'Flagged', value: flaggedCount, color: 'var(--amber)' },
          { label: 'Avg Risk', value: avgRisk, color: avgRisk > 60 ? 'var(--red)' : avgRisk > 30 ? 'var(--amber)' : 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card text-center">
            <p className="text-lg font-bold" style={{ color, fontFamily: 'var(--mono)' }}>{value}</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* History card — fills remaining height, scrolls internally */}
      <div className="flex flex-col min-h-0 flex-1" style={{ ...glass, padding: 0, overflow: 'hidden' }}>
        {/* Card header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.12)' }}>
              <History className="w-4 h-4" style={{ color: 'var(--cyan)' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Login History</h3>
              <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Last {history.length} login attempts</p>
            </div>
          </div>
          <button onClick={fetchHistory} className="icon-btn" aria-label="Refresh history"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>

        {history.length === 0 ? (
          <EmptyState icon="history" title="No login history" description="Your login attempts will appear here." />
        ) : (
          <>
            {/* Desktop table — thead fixed, tbody scrolls */}
            <div className="hidden lg:flex flex-col min-h-0 flex-1">
              {/* Fixed thead */}
              <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>IP Address</th>
                      <th>Location</th>
                      <th className="text-center">Risk</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                </table>
              </div>
              {/* Scrollable tbody */}
              <div className="flex-1 overflow-y-auto">
                <table className="data-table">
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} style={!h.success ? { background: 'rgba(239,68,68,0.02)' } : {}}>
                        <td style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                          {formatTime(h.time)}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: h.success ? 'var(--green)' : 'var(--red)' }}>
                            {h.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {h.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text2)' }}>{h.ipAddress || '\u2014'}</td>
                        <td style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                          {h.geoInfo && !h.geoInfo.is_private ? `${h.geoInfo.city}, ${h.geoInfo.country}` : '\u2014'}
                        </td>
                        <td className="text-center"><RiskBadge score={h.riskScore} level={h.riskLevel} /></td>
                        <td>
                          <div className="flex gap-1 flex-wrap">
                            {h.isNewIP && <FlagBadge label="New IP" color="var(--amber)" />}
                            {h.isNewDevice && <FlagBadge label="New Device" color="var(--violet)" />}
                            {h.isNewCountry && <FlagBadge label="New Country" color="var(--red)" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card view for mobile & tablet */}
            <div className="lg:hidden flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {history.map(h => (
                  <div key={h.id} className="rounded-xl p-3.5 transition-all" style={{
                    background: !h.success ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${!h.success ? 'rgba(239,68,68,0.1)' : 'var(--border)'}`,
                  }}>
                    {/* Row 1: Status + Risk */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: h.success ? 'var(--green)' : 'var(--red)' }}>
                        {h.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {h.success ? 'Success' : 'Failed'}
                      </span>
                      <RiskBadge score={h.riskScore} level={h.riskLevel} />
                    </div>

                    {/* Row 2: IP + Location */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[10px] flex items-center gap-1" style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                        <Globe className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                        {h.ipAddress || '\u2014'}
                      </span>
                      {h.geoInfo && !h.geoInfo.is_private && (
                        <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                          <MapPin className="w-3 h-3" />
                          {h.geoInfo.city}, {h.geoInfo.country}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Flags + Time */}
                    <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <div className="flex gap-1 flex-wrap">
                        {h.isNewIP && <FlagBadge label="New IP" color="var(--amber)" />}
                        {h.isNewDevice && <FlagBadge label="New Device" color="var(--violet)" />}
                        {h.isNewCountry && <FlagBadge label="New Country" color="var(--red)" />}
                        {!h.isNewIP && !h.isNewDevice && !h.isNewCountry && (
                          <span className="text-[9px]" style={{ color: 'var(--muted2)' }}>No flags</span>
                        )}
                      </div>
                      <span className="text-[9px] flex-shrink-0" style={{ fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>
                        {formatTime(h.time)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginHistory;
