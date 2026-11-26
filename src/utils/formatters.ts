import { DateFilterPreset, FollowUpStatus } from '../types';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return inrFormatter.format(safe);
}

export function formatINRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  }
  return formatINR(amount);
}

export function getLocalTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatDateTimeDisplay(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return '—';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return isoTimestamp;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resolveDateRange(
  preset: DateFilterPreset,
  todayISO: string,
  customStart?: string,
  customEnd?: string
): { start: string; end: string; label: string } {
  const [y, m, d] = todayISO.split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);

  switch (preset) {
    case 'today':
      return { start: todayISO, end: todayISO, label: 'Today' };
    case 'yesterday': {
      const yest = addDaysISO(todayISO, -1);
      return { start: yest, end: yest, label: 'Yesterday' };
    }
    case 'this_week': {
      const dayOfWeek = todayDate.getDay(); // 0=Sun
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const start = addDaysISO(todayISO, diffToMonday);
      return { start, end: todayISO, label: 'This Week' };
    }
    case 'this_month': {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start, end, label: 'This Month' };
    }
    case 'previous_month': {
      const prevMonthDate = new Date(y, m - 2, 1);
      const py = prevMonthDate.getFullYear();
      const pm = prevMonthDate.getMonth() + 1;
      const start = `${py}-${String(pm).padStart(2, '0')}-01`;
      const lastDay = new Date(py, pm, 0).getDate();
      const end = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start, end, label: 'Previous Month' };
    }
    case 'custom':
    default: {
      const s = customStart || `${y}-${String(m).padStart(2, '0')}-01`;
      const e = customEnd || todayISO;
      return { start: s <= e ? s : e, end: e >= s ? e : s, label: 'Custom Range' };
    }
  }
}

export function isDateInRange(dateISO: string, startISO: string, endISO: string): boolean {
  if (!dateISO) return false;
  const d = dateISO.slice(0, 10);
  return d >= startISO && d <= endISO;
}

const UNANSWERED_STATUSES: ReadonlySet<FollowUpStatus> = new Set([
  'Not Connected',
  'Call Not Answered',
  'Busy',
]);

export function isSuccessfulCall(status: FollowUpStatus): boolean {
  return !UNANSWERED_STATUSES.has(status);
}

export function isUnansweredCall(status: FollowUpStatus): boolean {
  return UNANSWERED_STATUSES.has(status);
}
