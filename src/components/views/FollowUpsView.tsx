import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, IndianRupee, PhoneCall, Plus, Search } from 'lucide-react';
import { motion } from 'motion/react';
import {
  EnrichedParty,
  FollowUp,
  FOLLOW_UP_STATUS_OPTIONS,
  User,
} from '../../types';
import { formatDateDisplay, formatINR } from '../../utils/formatters';
import { EmptyState, PaginationBar, StatusText } from '../ui/CommonUI';
import { EASE_OUT_EXPO, MotionCard } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface FollowUpsViewProps {
  followUps: FollowUp[];
  parties: EnrichedParty[];
  users: User[];
  isAdmin: boolean;
  onAddFollowUp: (party?: EnrichedParty) => void;
  onSelectPartyByCode: (partyCode: string) => void;
}

const PAGE_SIZE = 10;

export function FollowUpsView({
  followUps,
  parties,
  users,
  isAdmin,
  onAddFollowUp,
  onSelectPartyByCode,
}: FollowUpsViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...followUps]
      .filter((f) => {
        if (
          q &&
          !f.partyName.toLowerCase().includes(q) &&
          !f.partyCode.toLowerCase().includes(q) &&
          !f.discussionNotes.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (statusFilter !== 'ALL' && f.status !== statusFilter) return false;
        if (userFilter !== 'ALL' && f.userId !== userFilter) return false;
        if (dateFilter && f.followUpDate !== dateFilter) return false;
        return true;
      })
      .sort((a, b) =>
        `${b.followUpDate} ${b.followUpTime}`.localeCompare(
          `${a.followUpDate} ${a.followUpTime}`
        )
      );
  }, [followUps, search, statusFilter, userFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const statusTone = (status: FollowUp['status']) => {
    if (
      status === 'Full Payment Received' ||
      status === 'Part Payment Received'
    )
      return 'success';
    if (status === 'Payment Promised') return 'info';
    if (
      status === 'Payment Dispute' ||
      status === 'Not Connected' ||
      status === 'Call Not Answered'
    )
      return 'danger';
    return 'warning';
  };

  const summaryStats = useMemo(() => {
    const followedUpPartyKeys = new Set(
      followUps.map((f) => f.partyName.trim().toLowerCase()).filter(Boolean)
    );
    const outstandingParties = parties.filter((p) => p.totalOutstanding > 0);
    const pendingFollowUpParties = outstandingParties.filter(
      (p) =>
        (p.sheetFollowUpCount || 0) === 0 &&
        !followedUpPartyKeys.has(p.partyName.trim().toLowerCase())
    );
    const donePartiesCount = outstandingParties.length - pendingFollowUpParties.length;
    const recoveredParties = parties.filter((p) => p.totalRecovered > 0);
    const totalRecoveredAmt = recoveredParties.reduce((s, p) => s + p.totalRecovered, 0);
    const scheduledCount = followUps.filter(
      (f) => Boolean(f.nextFollowUpDate || f.nextPaymentDate)
    ).length;
    const committedAmt = followUps.reduce((s, f) => s + (f.commitmentAmount || 0), 0);

    return {
      pendingCount: pendingFollowUpParties.length,
      outstandingCount: outstandingParties.length,
      donePartiesCount,
      totalLogsCount: followUps.length,
      recoveredPartiesCount: recoveredParties.length,
      totalRecoveredAmt,
      scheduledCount,
      committedAmt,
    };
  }, [followUps, parties]);

  return (
    <div className="space-y-4">
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Payment Follow-up Management
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Track customer outreach, discussion notes, and promised payment dates
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
          onClick={() => onAddFollowUp()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-xl shadow-[0_6px_14px_-6px_rgba(234,88,12,0.5)] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Follow-up</span>
        </motion.button>
      </MotionCard>

      {/* 4 Small Summary Count Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MotionCard
          delay={0.02}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-4 shadow-[0_4px_16px_-12px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">
              Follow-up Pending
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center ring-1 ring-black/5">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
            {summaryStats.pendingCount}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            of {summaryStats.outstandingCount} outstanding parties
          </p>
        </MotionCard>

        <MotionCard
          delay={0.05}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-4 shadow-[0_4px_16px_-12px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">
              Follow-up Done
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center ring-1 ring-black/5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-stone-900">
            {summaryStats.donePartiesCount}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            parties · {summaryStats.totalLogsCount} total call logs
          </p>
        </MotionCard>

        <MotionCard
          delay={0.08}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-4 shadow-[0_4px_16px_-12px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">
              Payment Recovered
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center ring-1 ring-black/5">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {summaryStats.recoveredPartiesCount}
          </p>
          <p className="mt-1 text-[11px] text-stone-500 truncate">
            parties · {formatINR(summaryStats.totalRecoveredAmt)}
          </p>
        </MotionCard>

        <MotionCard
          delay={0.11}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-4 shadow-[0_4px_16px_-12px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500">
              Scheduled / Promised
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center ring-1 ring-black/5">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
            {summaryStats.scheduledCount}
          </p>
          <p className="mt-1 text-[11px] text-stone-500 truncate">
            Committed: {formatINR(summaryStats.committedAmt)}
          </p>
        </MotionCard>
      </div>

      <MotionCard delay={0.05} className="bg-white border border-[#EAE2D9] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search party, code, or discussion notes..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
          />
        </div>

        <PremiumSelect
          ariaLabel="Filter follow-up status"
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
          className="min-w-[190px]"
          options={[
            { value: 'ALL', label: 'All Follow-up Statuses' },
            ...FOLLOW_UP_STATUS_OPTIONS.map((opt) => ({ value: opt, label: opt })),
          ]}
        />

        {isAdmin && (
          <PremiumSelect
            ariaLabel="Filter by officer"
            value={userFilter}
            onChange={(val) => {
              setUserFilter(val);
              setPage(1);
            }}
            className="min-w-[165px]"
            options={[
              { value: 'ALL', label: 'All Officers' },
              ...users.map((u) => ({ value: u.id, label: u.name, subLabel: u.role })),
            ]}
          />
        )}

        <input
          type="date"
          aria-label="Filter by date"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs border border-[#E2D8CE] rounded-lg bg-white focus:outline-none focus:border-[#EA580C]"
        />
        {dateFilter && (
          <button
            type="button"
            onClick={() => setDateFilter('')}
            className="text-xs text-[#C2410C] hover:underline"
          >
            Clear date
          </button>
        )}
      </MotionCard>

      {paged.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No follow-ups match your filters"
          description="Log a new customer follow-up or adjust your status and date filters."
          actionLabel="Log Follow-up"
          onAction={() => onAddFollowUp()}
        />
      ) : (
        <MotionCard delay={0.1} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Date & Time</th>
                  <th className="text-left px-4 py-3 font-semibold">Party</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Discussion Notes</th>
                  <th className="text-right px-4 py-3 font-semibold">Commitment</th>
                  <th className="text-left px-4 py-3 font-semibold">Promised Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Next Follow-up</th>
                  <th className="text-left px-4 py-3 font-semibold">Officer</th>
                  <th className="text-right px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECE3]">
                {paged.map((f) => {
                  const matchedParty = parties.find(
                    (p) =>
                      p.customerCode === f.partyCode ||
                      p.partyName.trim().toLowerCase() === f.partyName.trim().toLowerCase()
                  );
                  return (
                  <tr
                    key={f.id}
                    onClick={() => onSelectPartyByCode(f.partyCode)}
                    className="hover:bg-orange-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-stone-900">
                        {formatDateDisplay(f.followUpDate)}
                      </div>
                      <div className="text-[11px] font-mono text-stone-400">
                        {f.followUpTime}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900">
                        {f.partyName}
                      </div>
                      <div className="text-[11px] font-mono text-stone-400">
                        {f.partyCode} · {f.contactPerson}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusText label={f.status} tone={statusTone(f.status)} />
                    </td>
                    <td className="px-4 py-3 max-w-xs text-stone-700">
                      <p className="line-clamp-2">{f.discussionNotes}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-stone-900 whitespace-nowrap">
                      {f.commitmentAmount > 0 ? formatINR(f.commitmentAmount) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {formatDateDisplay(f.nextPaymentDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#C2410C] font-medium">
                      {formatDateDisplay(f.nextFollowUpDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {userMap.get(f.userId) || f.userId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddFollowUp(matchedParty);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#C2410C] bg-orange-50 hover:bg-[#EA580C] hover:text-white border border-orange-200 rounded-lg transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Follow-up</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </MotionCard>
      )}
    </div>
  );
}
