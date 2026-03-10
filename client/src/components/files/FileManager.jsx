import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, Loader2, RefreshCw, Grid, List, Search, FolderOpen, X, Eye, ExternalLink, Calendar, HardDrive, Hash } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const fmtB = b => {
  if (!b) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
};

const fColor = f => ({
  pdf: '#ef4444', png: '#06b6d4', jpg: '#06b6d4', jpeg: '#06b6d4', gif: '#ec4899', webp: '#06b6d4',
  doc: '#3b82f6', docx: '#3b82f6', xls: '#10b981', xlsx: '#10b981', csv: '#10b981',
  txt: '#6b6b80', json: '#f59e0b', zip: '#6b6b80',
})[f] || '#45455a';

const fExt = n => {
  const e = n?.split('.').pop()?.toLowerCase();
  return e?.length <= 5 ? e : '';
};

const isPdf = f => f.format === 'pdf' || fExt(f.name) === 'pdf';
const isImg = f => {
  if (isPdf(f)) return false;
  return f.type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(f.format) || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fExt(f.name));
};
const getColor = f => fColor(f.format || fExt(f.name));

const glass = {
  background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(16px)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};

const FileManager = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/files');
      setFiles(data.data.files || data.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const upload = async (sels) => {
    if (!sels?.length) return;
    setUploading(true);
    for (const f of sels) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: too large`); continue; }
      const fd = new FormData();
      fd.append('file', f);
      try {
        const { data } = await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success(`Uploaded ${f.name}`);
        setFiles(p => [data.data.file, ...p]);
      } catch (e) {
        toast.error(e.response?.data?.message || `Failed: ${f.name}`);
      }
    }
    setUploading(false);
  };

  const dl = async (f) => {
    try {
      const { data } = await api.get(`/files/${f.id}/download`);
      const url = data.data.url;
      // Fetch the file as blob and trigger a real download
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = data.data.name || f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setFiles(p => p.map(x => x.id === f.id ? { ...x, downloads: (x.downloads || 0) + 1 } : x));
      toast.success(`Downloaded ${f.name}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Download failed.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/files/${deleteTarget.id}`);
      setFiles(p => p.filter(x => x.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.name}`);
      if (preview?.id === deleteTarget.id) setPreview(null);
    } catch { toast.error('Delete failed.'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const Badge = ({ file, size = 'sm' }) => {
    const ext = fExt(file.name) || '?';
    const color = getColor(file);
    const cls = size === 'lg' ? 'w-16 h-16 text-2xl rounded-xl' : size === 'md' ? 'w-10 h-10 text-sm rounded-lg' : 'w-8 h-8 text-[9px] rounded-lg';
    return <div className={`${cls} flex items-center justify-center font-bold uppercase flex-shrink-0`} style={{ background: `${color}12`, color, border: `1px solid ${color}18` }}>{ext}</div>;
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..." className="pl-9 pr-3 py-2 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setView(view === 'grid' ? 'list' : 'grid')} className="icon-btn" aria-label={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}>
            {view === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </button>
          <button onClick={fetchFiles} className="icon-btn" aria-label="Refresh files"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className="rounded-xl border-2 border-dashed mb-4 cursor-pointer transition-all"
        style={{
          borderColor: dragOver ? 'var(--cyan)' : 'var(--border)',
          background: dragOver ? 'rgba(6,182,212,0.04)' : 'rgba(255,255,255,0.015)',
          backdropFilter: 'blur(12px)',
          boxShadow: dragOver ? '0 0 30px rgba(6,182,212,0.08)' : 'none',
        }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(Array.from(e.dataTransfer.files)); }}
        onClick={() => document.getElementById('fu').click()}
      >
        <input id="fu" type="file" multiple className="hidden" onChange={e => { upload(Array.from(e.target.files)); e.target.value = ''; }} />
        <div className="flex flex-col items-center py-6">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin mb-2" style={{ color: 'var(--cyan)' }} /> : <Upload className="w-6 h-6 mb-2" style={{ color: dragOver ? 'var(--cyan)' : 'var(--muted)' }} />}
          <p className="text-xs font-medium" style={{ color: 'var(--text2)' }}>{uploading ? 'Uploading...' : 'Drop files or click to upload'}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>Max 10 MB per file</p>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <FolderOpen className="w-12 h-12 mb-3" style={{ color: 'var(--muted2)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{search ? 'No matches.' : 'No files yet. Upload something.'}</p>
          </div>
        ) : view === 'list' ? (
          <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
            <div className="hidden sm:flex items-center px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>
              <span className="flex-1">Name</span><span className="w-16 text-right">Size</span><span className="w-24 text-right">Date</span><span className="w-20" />
            </div>
            {filtered.map(f => (
              <div key={f.id} className="file-row group" onClick={() => setPreview(f)}>
                <Badge file={f} />
                <span className="flex-1 text-xs truncate font-medium">{f.name}</span>
                <span className="hidden sm:inline w-16 text-right text-[11px]" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{fmtB(f.size)}</span>
                <span className="hidden sm:inline w-24 text-right text-[11px]" style={{ color: 'var(--muted)' }}>{new Date(f.uploadedAt).toLocaleDateString()}</span>
                <div className="w-20 flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.stopPropagation(); dl(f); }} className="icon-btn p-1.5" style={{ color: 'var(--cyan)' }} title="Download"><Download className="w-3.5 h-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(f); }} className="icon-btn p-1.5" style={{ color: 'var(--red)' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {filtered.map(f => (
              <div key={f.id} className="overflow-hidden cursor-pointer group hover-lift" style={{ ...glass, padding: 0 }} onClick={() => setPreview(f)}>
                <div className="h-20 flex items-center justify-center" style={{ background: `${getColor(f)}06` }}>
                  {isImg(f) ? <img src={f.publicUrl || f.url} alt={f.name} className="w-full h-full object-cover" /> : <span className="text-xl font-bold uppercase" style={{ color: `${getColor(f)}40` }}>{fExt(f.name)}</span>}
                </div>
                <div className="p-2.5">
                  <p className="text-[11px] truncate font-medium">{f.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{fmtB(f.size)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Panel */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col sm:flex-row glass-overlay">
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8" onClick={() => setPreview(null)}>
            <div onClick={e => e.stopPropagation()} className="max-w-3xl max-h-[60vh] sm:max-h-[75vh] w-full flex items-center justify-center">
              {isImg(preview) ? (
                <img src={preview.publicUrl || preview.url} alt={preview.name} className="max-w-full max-h-[55vh] sm:max-h-[70vh] rounded-xl object-contain" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
              ) : (
                <div className="flex flex-col items-center py-12 sm:py-16 px-8 sm:px-12 text-center animate-scale" style={{
                  background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px',
                  boxShadow: '0 16px 64px rgba(0,0,0,0.4)',
                }}>
                  <Badge file={preview} size="lg" />
                  <p className="text-base font-semibold mt-4 mb-1">{preview.name}</p>
                  <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>{fmtB(preview.size)} · {(preview.format || fExt(preview.name) || 'unknown').toUpperCase()}</p>
                  <div className="flex gap-2">
                    <button onClick={() => dl(preview)} className="btn-primary flex items-center gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> Download</button>
                    {isPdf(preview) && <button onClick={() => window.open(preview.publicUrl || preview.url, '_blank')} className="btn-secondary flex items-center gap-1.5 text-xs"><ExternalLink className="w-3.5 h-3.5" /> Open</button>}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Side Info - hidden on small screens, shown bottom on medium */}
          <div className="w-full sm:w-[280px] flex-shrink-0 flex flex-col" style={{
            background: 'rgba(12,12,20,0.95)', backdropFilter: 'blur(16px)',
            borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)',
          }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-xs font-semibold truncate pr-2">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="icon-btn p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="hidden sm:block px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-full h-28 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: `${getColor(preview)}06`, border: '1px solid var(--border)' }}>
                {isImg(preview) ? <img src={preview.publicUrl || preview.url} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold uppercase" style={{ color: `${getColor(preview)}30` }}>{fExt(preview.name)}</span>}
              </div>
            </div>
            <div className="px-4 py-4 flex-1 overflow-auto">
              <h4 className="label mb-3">Details</h4>
              <div className="space-y-3">
                {[
                  { icon: FileText, label: 'Type', value: (preview.format || fExt(preview.name) || '?').toUpperCase() },
                  { icon: HardDrive, label: 'Size', value: fmtB(preview.size) },
                  { icon: Calendar, label: 'Uploaded', value: new Date(preview.uploadedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) },
                  { icon: Hash, label: 'Downloads', value: preview.downloads || 0 },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{label}</span>
                      <span className="text-[11px] font-medium" style={{ fontFamily: 'var(--mono)' }}>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => dl(preview)} className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button onClick={() => setDeleteTarget(preview)} className="btn-danger px-3 py-2.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 glass-overlay">
          <div className="w-full max-w-sm animate-scale" style={{
            background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px',
            boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
            padding: 0,
          }}>
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <Trash2 className="w-4.5 h-4.5" style={{ color: 'var(--red)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Delete File</h3>
                  <p className="text-[11px]" style={{ color: 'var(--muted)' }}>This action cannot be undone</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Badge file={deleteTarget} />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{deleteTarget.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{fmtB(deleteTarget.size)}</p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn-secondary flex-1 py-2.5 text-xs">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all" style={{ background: 'var(--red)', color: '#fff' }}>
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
