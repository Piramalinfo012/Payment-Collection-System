import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  PhoneCall,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  DerivedCommitment,
  EnrichedParty,
  FollowUp,
  PaymentReceipt,
  User,
} from '../../types';
import {
  addDaysISO,
  formatDateDisplay,
  formatINR,
  formatINRCompact,
} from '../../utils/formatters';
import { EASE_OUT_EXPO, MotionCard, SlidingTabs } from '../ui/MotionPrimitives';

interface CalendarViewProps {
  todayISO: string;
  parties: EnrichedParty[];
  followUps: FollowUp[];
  commitments: DerivedCommitment[];
  payments: PaymentReceipt[];
  users: User[];
  onSelectParty: (party: EnrichedParty) => void;
}

type ScheduleBucket =
  | 'today'
  | 'tomorrow'
  | 'next_7'
  | 'next_30'
  | 'missed'
  | 'commitments';

interface CalendarItem {
  id: string;
  date: string;
  kind:
    | 'Follow-up Scheduled'
    | 'Payment Promised'
    | 'Payment Received'
    | 'Overdue Commitment'
    | 'Missed Follow-up';
  partyCode: string;
  partyName: string;
  officerName: string;
  outstanding: number;
  promisedAmount?: number;
  receivedAmount?: number;
}

export function CalendarView({
  todayISO,
  parties,
  followUps,
  commitments,
  payments,
  users,
  onSelectParty,
}: CalendarViewProps) {
  const [activeBucket, setActiveBucket] = useState<ScheduleBucket>('today');
  const [cursorMonth, setCursorMonth] = useState(() => todayISO.slice(0, 7));

  const partyMap = new Map(parties.map((p) => [p.customerCode, p]));
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const allItems: CalendarItem[] = useMemo(() => {
    const items: CalendarItem[] = [];

    // Scheduled / Missed Follow-ups
    followUps.forEach((f) => {
      if (!f.nextFollowUpDate) return;
      const party = partyMap.get(f.partyCode);
      if (!party) return;
      // Check if a newer follow-up occurred on or after nextFollowUpDate
      const hasNewerFollowUp = followUps.some(
        (other) =>
          other.partyCode === f.partyCode &&
          other.id !== f.id &&
          other.followUpDate >= f.nextFollowUpDate
      );
      const isMissed = f.nextFollowUpDate < todayISO && !hasNewerFollowUp && party.totalOutstanding > 0;
      items.push({
        id: `cal-fu-${f.id}`,
        date: f.nextFollowUpDate,
        kind: isMissed ? 'Missed Follow-up' : 'Follow-up Scheduled',
        partyCode: party.customerCode,
        partyName: party.partyName,
        officerName: userMap.get(party.assignedUserId) || 'Officer',
        outstanding: party.totalOutstanding,
        promisedAmount: f.commitmentAmount > 0 ? f.commitmentAmount : undefined,
      });
    });

    // Commitments (Upcoming / Due Today / Overdue)
    commitments.forEach((c) => {
      if (c.status === 'Fulfilled') return;
      const party = partyMap.get(c.partyCode);
      if (!party) return;
      items.push({
        id: `cal-cmt-${c.id}`,
        date: c.promisedDate,
        kind: c.status === 'Overdue' ? 'Overdue Commitment' : 'Payment Promised',
        partyCode: party.customerCode,
        partyName: party.partyName,
        officerName: userMap.get(party.assignedUserId) || 'Officer',
        outstanding: party.totalOutstanding,
        promisedAmount: c.promisedAmount,
      });
    });

    // Actual Payments Received
    payments.forEach((p) => {
      const party = partyMap.get(p.partyCode);
      if (!party) return;
      items.push({
        id: `cal-pay-${p.id}`,
        date: p.receivedDate,
        kind: 'Payment Received',
        partyCode: party.customerCode,
        partyName: party.partyName,
        officerName: userMap.get(p.recordedByUserId) || 'Officer',
        outstanding: party.totalOutstanding,
        receivedAmount: p.receivedAmount,
      });
    });

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [followUps, commitments, payments, parties, todayISO]);

  const tomorrowISO = addDaysISO(todayISO, 1);
  const in7DaysISO = addDaysISO(todayISO, 7);
  const in30DaysISO = addDaysISO(todayISO, 30);

  const bucketItems = useMemo(() => {
    switch (activeBucket) {
      case 'today':
        return allItems.filter((i) => i.date === todayISO);
      case 'tomorrow':
        return allItems.filter((i) => i.date === tomorrowISO);
      case 'next_7':
        return allItems.filter((i) => i.date >= todayISO && i.date <= in7DaysISO);
      case 'next_30':
        return allItems.filter((i) => i.date >= todayISO && i.date <= in30DaysISO);
      case 'missed':
        return allItems.filter(
          (i) =>
            i.kind === 'Missed Follow-up' || i.kind === 'Overdue Commitment'
        );
      case 'commitments':
        return allItems.filter(
          (i) =>
            i.kind === 'Payment Promised' || i.kind === 'Overdue Commitment'
        );
    }
  }, [allItems, activeBucket, todayISO, tomorrowISO, in7DaysISO, in30DaysISO]);

  // Month grid cells
  const [yr, mo] = cursorMonth.split('-').map(Number);
  const firstDayOfMonth = new Date(yr, mo - 1, 1);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const startOffset = firstDayOfMonth.getDay(); // 0=Sun

  const monthLabel = firstDayOfMonth.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const dt = new Date(yr, mo - 1 + delta, 1);
    setCursorMonth(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    );
  };

  const kindBadgeStyle = (kind: CalendarItem['kind']) => {
    switch (kind) {
      case 'Payment Received':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Payment Promised':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Overdue Commitment':
      case 'Missed Follow-up':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'Follow-up Scheduled':
      default:
        return 'bg-orange-50 text-[#9A3412] border-orange-200';
    }
  };

  const kindIcon = (kind: CalendarItem['kind']) => {
    switch (kind) {
      case 'Payment Received':
        return <CheckCircle2 className="w-3 h-3 shrink-0" />;
      case 'Payment Promised':
        return <Clock className="w-3 h-3 shrink-0" />;
      case 'Overdue Commitment':
      case 'Missed Follow-up':
        return <AlertCircle className="w-3 h-3 shrink-0" />;
      default:
        return <PhoneCall className="w-3 h-3 shrink-0" />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Legend & Tabs */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Follow-up & Commitment Schedule Calendar
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Click any scheduled follow-up or commitment entry to open the complete party profile
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1.5 text-[#C2410C]">
              <PhoneCall className="w-3.5 h-3.5" /> Follow-up Scheduled
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-700">
              <Clock className="w-3.5 h-3.5" /> Payment Promised
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Payment Received
            </span>
            <span className="inline-flex items-center gap-1.5 text-red-700">
              <AlertCircle className="w-3.5 h-3.5" /> Overdue / Missed
            </span>
          </div>
        </div>

        <SlidingTabs
          layoutId="calendar-bucket"
          value={activeBucket}
          onChange={setActiveBucket}
          options={[
            { id: 'today', label: "Today's Follow-ups" },
            { id: 'tomorrow', label: "Tomorrow's Follow-ups" },
            { id: 'next_7', label: 'Upcoming 7 Days' },
            { id: 'next_30', label: 'Upcoming 30 Days' },
            { id: 'missed', label: 'Missed / Overdue' },
            { id: 'commitments', label: 'Payment Commitments' },
          ]}
        />
      </MotionCard>

      {/* Split Layout: Schedule List + Interactive Month Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left List */}
        <MotionCard delay={0.06} className="xl:col-span-5 bg-white border border-[#EAE2D9] rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#EAE2D9] bg-[#FAF6F1] flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-800">
              Schedule Queue ({bucketItems.length})
            </span>
            <CalendarIcon className="w-4 h-4 text-stone-400" />
          </div>

          <div className="divide-y divide-[#F4ECE3] max-h-[540px] overflow-y-auto">
            {bucketItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                No scheduled follow-ups or commitments in this window.
              </div>
            ) : (
              bucketItems.map((item) => {
                const party = partyMap.get(item.partyCode);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => party && onSelectParty(party)}
                    className="w-full text-left p-4 hover:bg-orange-50/50 transition-colors flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <span className="font-mono font-medium text-stone-700">
                          {formatDateDisplay(item.date)}
                        </span>
                        <span>·</span>
                        <span>{item.officerName}</span>
                      </div>
                      <p className="text-sm font-semibold text-stone-900 mt-0.5 truncate">
                        {item.partyName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-stone-500">
                          Outstanding:{' '}
                          <strong className="font-mono text-stone-800">
                            {formatINR(item.outstanding)}
                          </strong>
                        </span>
                        {item.promisedAmount && (
                          <span className="text-amber-700">
                            Promised:{' '}
                            <strong className="font-mono">
                              {formatINR(item.promisedAmount)}
                            </strong>
                          </span>
                        )}
                        {item.receivedAmount && (
                          <span className="text-emerald-700">
                            Received:{' '}
                            <strong className="font-mono">
                              {formatINR(item.receivedAmount)}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium whitespace-nowrap shrink-0 ${kindBadgeStyle(
                        item.kind
                      )}`}
                    >
                      {kindIcon(item.kind)}
                      <span>{item.kind}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </MotionCard>

        {/* Right Month Grid */}
        <MotionCard delay={0.12} className="xl:col-span-7 bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EAE2D9] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-900">
              {monthLabel}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 border border-[#E2D8CE] rounded-lg hover:bg-[#FAF6F1] text-stone-600"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursorMonth(todayISO.slice(0, 7))}
                className="px-2.5 py-1 text-xs font-medium border border-[#E2D8CE] rounded-lg hover:bg-[#FAF6F1] text-stone-700"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 border border-[#E2D8CE] rounded-lg hover:bg-[#FAF6F1] text-stone-600"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-[#EAE2D9] bg-[#FAF6F1] text-[11px] font-semibold text-stone-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-2 py-2 text-center">
                {d}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={cursorMonth}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
              className="grid grid-cols-7 divide-x divide-y divide-[#F4ECE3]"
            >
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[86px] bg-[#FAF6F1]/50" />
              ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateISO = `${cursorMonth}-${String(dayNum).padStart(2, '0')}`;
              const dayItems = allItems.filter((i) => i.date === dateISO);
              const isToday = dateISO === todayISO;

              return (
                <div
                  key={dateISO}
                  className={`min-h-[86px] p-1.5 ${
                    isToday ? 'bg-orange-50/60' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                        isToday
                          ? 'bg-[#EA580C] text-white font-bold'
                          : 'text-stone-600'
                      }`}
                    >
                      {dayNum}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 2).map((item) => {
                      const party = partyMap.get(item.partyCode);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => party && onSelectParty(party)}
                          title={`${item.partyName} · ${item.kind}`}
                          className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] truncate block ${kindBadgeStyle(
                            item.kind
                          )}`}
                        >
                          {item.partyName.split(' ')[0]}{' '}
                          {item.promisedAmount
                            ? formatINRCompact(item.promisedAmount)
                            : item.receivedAmount
                            ? formatINRCompact(item.receivedAmount)
                            : ''}
                        </button>
                      );
                    })}
                    {dayItems.length > 2 && (
                      <div className="text-[10px] text-stone-500 px-1">
                        +{dayItems.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </motion.div>
          </AnimatePresence>
        </MotionCard>
      </div>
    </div>
  );
}
