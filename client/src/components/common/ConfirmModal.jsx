import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * Glassmorphism confirmation modal.
 * Replaces window.confirm() with a styled, accessible modal.
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onConfirm - Called when user confirms
 * @param {function} onCancel - Called when user cancels
 * @param {string} title - Modal title
 * @param {string} message - Modal description
 * @param {string} confirmText - Text for confirm button (default: "Confirm")
 * @param {string} variant - "danger" | "warning" | "info" (default: "danger")
 */
export default function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      confirmRef.current?.focus();
      const handleEsc = (e) => { if (e.key === 'Escape') onCancel(); };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const colors = {
    danger: { icon: 'var(--red)', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.15)' },
    warning: { icon: 'var(--amber)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.15)' },
    info: { icon: 'var(--cyan)', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.15)' },
  }[variant];

  const Icon = variant === 'danger' ? Trash2 : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div
        className="card-elevated max-w-sm w-full space-y-5 animate-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 icon-btn"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        {/* Icon */}
        <div
          className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
        >
          <Icon size={22} style={{ color: colors.icon }} />
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 id="confirm-title" className="text-base font-bold mb-1.5" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1">
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 font-semibold text-sm py-2 px-4 rounded-lg transition-all ${
              variant === 'danger' ? 'btn-danger' : 'btn-primary'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
