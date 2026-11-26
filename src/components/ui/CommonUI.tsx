import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ConfirmationDialogState, ToastMessage } from '../../types';
import { EASE_OUT_EXPO } from './MotionPrimitives';

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function StatusText({
  label,
  tone,
}: {
  label: string;
  tone: SemanticTone;
}) {
  const styles: Record<SemanticTone, { text: string; Icon: React.ElementType }> = {
    success: { text: 'text-emerald-700', Icon: CheckCircle2 },
    warning: { text: 'text-amber-700', Icon: Clock },
    danger: { text: 'text-red-700', Icon: AlertCircle },
    info: { text: 'text-[#C2410C]', Icon: Info },
    neutral: { text: 'text-stone-600', Icon: Info },
  };
  const { text, Icon } = styles[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${text}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function ConfirmationModal({
  state,
  onClose,
}: {
  state: ConfirmationDialogState;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await state.onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {state.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
            className="w-full max-w-md bg-white border border-[#EAE2D9] rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-6 pt-5 pb-4 border-b border-[#F2EAE1] flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    state.variant === 'danger'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-orange-50 text-[#EA580C]'
                  }`}
                >
                  {state.variant === 'danger' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3
                    id="confirm-dialog-title"
                    className="text-base font-semibold text-stone-900"
                  >
                    {state.title}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                    {state.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-md"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {state.details && state.details.length > 0 && (
              <div className="px-6 py-3 bg-[#FAF6F1] border-b border-[#F2EAE1]">
                <ul className="space-y-1 text-xs text-stone-600">
                  {state.details.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#EA580C]">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="px-6 py-4 flex items-center justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-[#E2D8CE] rounded-lg hover:bg-[#FAF6F1] transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-60 ${
                  state.variant === 'danger'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-[#EA580C] hover:bg-[#C2410C]'
                }`}
              >
                {submitting ? 'Processing...' : state.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const iconMap = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
            error: <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
            info: <Info className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />,
          };
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              className="pointer-events-auto bg-white border border-[#EAE2D9] rounded-xl shadow-lg p-3.5 flex items-start gap-3"
            >
              {iconMap[t.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-stone-600 mt-0.5 leading-snug">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="text-stone-400 hover:text-stone-600 p-0.5"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
      className="py-12 px-6 text-center bg-white border border-[#EAE2D9] rounded-xl"
    >
      <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
      <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg transition-colors"
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
      <div className="divide-y divide-[#F4ECE3]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex items-center gap-4">
            {Array.from({ length: cols }).map((__, c) => (
              <div
                key={c}
                className="h-4 bg-[#F4ECE3] rounded animate-pulse flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (totalItems === 0) return null;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[#EAE2D9] bg-white text-xs text-stone-600">
      <span className="tabular-nums">
        Showing <strong className="text-stone-900">{startItem}</strong>–
        <strong className="text-stone-900">{endItem}</strong> of{' '}
        <strong className="text-stone-900">{totalItems}</strong> records
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#E2D8CE] rounded-md text-stone-700 hover:bg-[#FAF6F1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>
        <span className="px-2 tabular-nums font-medium text-stone-800">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#E2D8CE] rounded-md text-stone-700 hover:bg-[#FAF6F1] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
