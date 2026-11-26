import React, { useMemo, useState } from 'react';
import { CalendarCheck, IndianRupee, Search } from 'lucide-react';
import { motion } from 'motion/react';
import {
  CommitmentStatus,
  DerivedCommitment,
  EnrichedParty,
  User,
} from '../../types';
import { formatDateDisplay, formatINR } from '../../utils/formatters';
import { EmptyState, StatusText } from '../ui/CommonUI';
import {
  AnimatedNumber,
  EASE_OUT_EXPO,
  MotionCard,
  SlidingTabs,
} from '../ui/MotionPrimitives';

interface CommitmentsViewProps {
  commitments: DerivedCommitment[];
  parties: EnrichedParty[];
  users: User[];
  canRecordPayment: boolean;
  onSelectPartyByCode: (partyCode: string) => void;
  onRecordPaymentForParty: (party: EnrichedParty) => void;
}

export function CommitmentsView({
  commitments,
  parties,
  users,
  canRecordPayment,
  onSelectPartyByCode,
  onRecordPaymentForParty,
}: CommitmentsViewProps) {
  const [filterTab, setFilterTab] = useState<
    'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'FULFILLED'
  >('ALL');
  const [search, setSearch] = useState('');

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const partyMap = new Map(parties.map((p) => [p.customerCode, p]));

  const summary = useMemo(() => {
    const overdue = commitments.filter((c) => c.status === 'Overdue');
    const dueToday = commitments.filter((c) => c.status === 'Due Today');
    const upcoming = commitments.filter(
      (c) => c.status === 'Upcoming' || c.status === 'Partially Fulfilled'
    );
    const fulfilled = commitments.filter((c) => c.status === 'Fulfilled');
    return {
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, c) => s + (c.promisedAmount - c.actualReceived), 0),
      dueTodayCount: dueToday.length,
      dueTodayAmount: dueToday.reduce((s, c) => s + c.promisedAmount, 0),
      upcomingCount: upcoming.length,
      upcomingAmount: upcoming.reduce((s, c) => s + c.promisedAmount, 0),
      fulfilledCount: fulfilled.length,
      fulfilledAmount: fulfilled.reduce((s, c) => s + c.actualReceived, 0),
    };
  }, [commitments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return commitments.filter((c) => {
      if (
        q &&
        !c.partyName.toLowerCase().includes(q) &&
        !c.partyCode.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filterTab === 'OVERDUE') return c.status === 'Overdue';
      if (filterTab === 'DUE_TODAY') return c.status === 'Due Today';
      if (filterTab === 'UPCOMING')
        return c.status === 'Upcoming' || c.status === 'Partially Fulfilled';
      if (filterTab === 'FULFILLED') return c.status === 'Fulfilled';
      return true;
    });
  }, [commitments, filterTab, search]);

  const statusTone = (status: CommitmentStatus) => {
    if (status === 'Fulfilled') return 'success';
    if (status === 'Overdue') return 'danger';
    if (status === 'Due Today' || status === 'Partially Fulfilled')
      return 'warning';
    return 'info';
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MotionCard delay={0} className="bg-white border border-red-200 rounded-xl p-4">
          <span className="text-xs font-medium text-red-700">
            Overdue Commitments
          </span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-red-700">
            <AnimatedNumber value={summary.overdueAmount} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {summary.overdueCount} missed due date(s)
          </p>
        </MotionCard>
        <MotionCard delay={0.04} className="bg-white border border-amber-200 rounded-xl p-4">
          <span className="text-xs font-medium text-amber-700">
            Due Today
          </span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-700">
            <AnimatedNumber value={summary.dueTodayAmount} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {summary.dueTodayCount} scheduled for today
          </p>
        </MotionCard>
        <MotionCard delay={0.08} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs font-medium text-[#C2410C]">
            Upcoming Commitments
          </span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber value={summary.upcomingAmount} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {summary.upcomingCount} scheduled future dates
          </p>
        </MotionCard>
        <MotionCard delay={0.12} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs font-medium text-emerald-700">
            Fulfilled Commitments
          </span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-700">
            <AnimatedNumber value={summary.fulfilledAmount} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {summary.fulfilledCount} matched with actual receipts
          </p>
        </MotionCard>
      </div>

      {/* Controls */}
      <MotionCard delay={0.14} className="bg-white border border-[#EAE2D9] rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <SlidingTabs
          layoutId="commitments-filter"
          value={filterTab}
          onChange={setFilterTab}
          options={[
            { id: 'ALL', label: 'All Commitments' },
            { id: 'OVERDUE', label: 'Overdue' },
            { id: 'DUE_TODAY', label: 'Due Today' },
            { id: 'UPCOMING', label: 'Upcoming' },
            { id: 'FULFILLED', label: 'Fulfilled' },
          ]}
        />

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search party or code..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
          />
        </div>
      </MotionCard>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No payment commitments found"
          description="Commitments appear automatically whenever a follow-up logs a promised payment amount and date."
        />
      ) : (
        <MotionCard delay={0.18} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Promised Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Party Name</th>
                  <th className="text-right px-4 py-3 font-semibold">Party Outstanding</th>
                  <th className="text-right px-4 py-3 font-semibold">Promised Amount</th>
                  <th className="text-right px-4 py-3 font-semibold">Actual Received</th>
                  <th className="text-left px-4 py-3 font-semibold">Officer</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECE3]">
                {filtered.map((c) => {
                  const party = partyMap.get(c.partyCode);
                  const isOverdue = c.status === 'Overdue';
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectPartyByCode(c.partyCode)}
                      className={`cursor-pointer transition-colors ${
                        isOverdue
                          ? 'bg-red-50/40 hover:bg-red-50/70'
                          : 'hover:bg-orange-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div
                          className={`font-semibold ${
                            isOverdue ? 'text-red-700' : 'text-stone-900'
                          }`}
                        >
                          {formatDateDisplay(c.promisedDate)}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          Logged {formatDateDisplay(c.followUpDate)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">
                          {c.partyName}
                        </div>
                        <div className="text-[11px] font-mono text-stone-400">
                          {c.partyCode}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-stone-700 whitespace-nowrap">
                        {formatINR(c.partyOutstanding)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-stone-900 whitespace-nowrap">
                        {formatINR(c.promisedAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                        {formatINR(c.actualReceived)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                        {userMap.get(c.userId) || c.userId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusText label={c.status} tone={statusTone(c.status)} />
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canRecordPayment && c.status !== 'Fulfilled' && party && (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                            onClick={() => onRecordPaymentForParty(party)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md"
                          >
                            <IndianRupee className="w-3 h-3" />
                            <span>Record Receipt</span>
                          </motion.button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </MotionCard>
      )}
    </div>
  );
}
