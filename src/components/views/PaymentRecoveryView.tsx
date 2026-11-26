import React, { useMemo, useState } from 'react';
import { IndianRupee, Plus, Search } from 'lucide-react';
import { motion } from 'motion/react';
import {
  DerivedCommitment,
  PaymentMode,
  PAYMENT_MODES,
  PaymentReceipt,
  User,
} from '../../types';
import {
  formatDateDisplay,
  formatINR,
  isDateInRange,
  resolveDateRange,
} from '../../utils/formatters';
import { EmptyState, PaginationBar, StatusText } from '../ui/CommonUI';
import {
  AnimatedNumber,
  EASE_OUT_EXPO,
  MotionCard,
} from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface PaymentRecoveryViewProps {
  payments: PaymentReceipt[];
  commitments: DerivedCommitment[];
  totalOutstanding: number;
  users: User[];
  todayISO: string;
  canRecordPayment: boolean;
  onOpenRecordPayment: () => void;
  onSelectPartyByCode: (partyCode: string) => void;
}

const PAGE_SIZE = 10;

export function PaymentRecoveryView({
  payments,
  commitments,
  totalOutstanding,
  users,
  todayISO,
  canRecordPayment,
  onOpenRecordPayment,
  onSelectPartyByCode,
}: PaymentRecoveryViewProps) {
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<'ALL' | PaymentMode>('ALL');
  const [sourceFilter, setSourceFilter] = useState<
    'ALL' | 'Tally' | 'Manual' | 'Follow-up (Unverified)'
  >('ALL');
  const [page, setPage] = useState(1);

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const thisMonth = resolveDateRange('this_month', todayISO);

  const stats = useMemo(() => {
    const todayTotal = payments
      .filter((p) => p.receivedDate === todayISO)
      .reduce((s, p) => s + p.receivedAmount, 0);
    const monthTotal = payments
      .filter((p) => isDateInRange(p.receivedDate, thisMonth.start, thisMonth.end))
      .reduce((s, p) => s + p.receivedAmount, 0);

    const committedTotal = commitments.reduce((s, c) => s + c.promisedAmount, 0);
    const recoveredAgainstCommitment = commitments.reduce(
      (s, c) => s + c.actualReceived,
      0
    );
    const monthlyRecoveryPct =
      totalOutstanding + monthTotal > 0
        ? (monthTotal / (totalOutstanding + monthTotal)) * 100
        : 0;

    return {
      todayTotal,
      monthTotal,
      committedTotal,
      recoveredAgainstCommitment,
      commitmentCoveragePct:
        committedTotal > 0
          ? (recoveredAgainstCommitment / committedTotal) * 100
          : 0,
      monthlyRecoveryPct,
    };
  }, [payments, commitments, totalOutstanding, todayISO, thisMonth]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...payments]
      .filter((p) => {
        if (
          q &&
          !p.partyName.toLowerCase().includes(q) &&
          !p.partyCode.toLowerCase().includes(q) &&
          !p.utrNumber.toLowerCase().includes(q) &&
          !p.voucherRef.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (modeFilter !== 'ALL' && p.paymentMode !== modeFilter) return false;
        if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false;
        return true;
      })
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
  }, [payments, search, modeFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header + CTA */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            Payment Recovery Ledger
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Only actual receipt entries count toward recovered amounts. Tally receipt vouchers are deduplicated automatically.
          </p>
        </div>
        {canRecordPayment && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={onOpenRecordPayment}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record Payment</span>
          </motion.button>
        )}
      </MotionCard>

      {/* Recovery Calculation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MotionCard delay={0.04} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Total Recovery Today</span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-700">
            <AnimatedNumber value={stats.todayTotal} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Date: {formatDateDisplay(todayISO)}
          </p>
        </MotionCard>
        <MotionCard delay={0.08} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Total Recovery This Month</span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber value={stats.monthTotal} formatter={formatINR} />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {payments.filter((p) => isDateInRange(p.receivedDate, thisMonth.start, thisMonth.end)).length}{' '}
            verified receipt vouchers
          </p>
        </MotionCard>
        <MotionCard delay={0.12} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">
            Recovery Against Committed
          </span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-[#C2410C]">
            <AnimatedNumber
              value={stats.recoveredAgainstCommitment}
              formatter={formatINR}
            />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            {stats.commitmentCoveragePct.toFixed(1)}% of{' '}
            {formatINR(stats.committedTotal)} promised
          </p>
        </MotionCard>
        <MotionCard delay={0.16} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Monthly Recovery Rate</span>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber
              value={stats.monthlyRecoveryPct}
              formatter={(n) => `${n.toFixed(1)}%`}
            />
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Based on actual receipts vs exposure
          </p>
        </MotionCard>
      </div>

      {/* Filters */}
      <MotionCard delay={0.18} className="bg-white border border-[#EAE2D9] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search party, UTR number, or Tally voucher ref..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
          />
        </div>

        <PremiumSelect
          ariaLabel="Filter payment mode"
          value={modeFilter}
          onChange={(val) => {
            setModeFilter(val as 'ALL' | PaymentMode);
            setPage(1);
          }}
          searchable={false}
          className="min-w-[165px]"
          options={[
            { value: 'ALL', label: 'All Payment Modes' },
            ...PAYMENT_MODES.map((m) => ({ value: m, label: m })),
          ]}
        />

        <PremiumSelect
          ariaLabel="Filter receipt source"
          value={sourceFilter}
          onChange={(val) => {
            setSourceFilter(
              val as 'ALL' | 'Tally' | 'Manual' | 'Follow-up (Unverified)'
            );
            setPage(1);
          }}
          searchable={false}
          className="min-w-[185px]"
          options={[
            { value: 'ALL', label: 'All Sources' },
            { value: 'Tally', label: 'Tally Verified' },
            { value: 'Follow-up (Unverified)', label: 'Tally Unverified (Follow-up)' },
            { value: 'Manual', label: 'Manual Entry' },
          ]}
        />
      </MotionCard>

      {paged.length === 0 ? (
        <EmptyState
          icon={IndianRupee}
          title="No payment receipts found"
          description="Record an incoming customer payment or import Tally receipt entries."
          actionLabel={canRecordPayment ? 'Record Payment' : undefined}
          onAction={canRecordPayment ? onOpenRecordPayment : undefined}
        />
      ) : (
        <MotionCard delay={0.22} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Party Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Voucher / UTR</th>
                  <th className="text-left px-4 py-3 font-semibold">Mode & Bank</th>
                  <th className="text-left px-4 py-3 font-semibold">Recorded By</th>
                  <th className="text-left px-4 py-3 font-semibold">Source</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECE3]">
                {paged.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPartyByCode(p.partyCode)}
                    className="hover:bg-orange-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-stone-900">
                      {formatDateDisplay(p.receivedDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900">
                        {p.partyName}
                      </div>
                      <div className="text-[11px] font-mono text-stone-400">
                        {p.partyCode}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-700">
                      <div>{p.voucherRef}</div>
                      <div className="text-[11px] text-stone-400">
                        {p.utrNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      <div className="font-medium">{p.paymentMode}</div>
                      <div className="text-[11px] text-stone-400">
                        {p.bankDetails}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                      {userMap.get(p.recordedByUserId) || p.recordedByUserId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusText
                        label={
                          p.source === 'Tally'
                            ? 'Tally Verified'
                            : p.source === 'Follow-up (Unverified)'
                            ? 'Tally Unverified'
                            : 'Manual Entry'
                        }
                        tone={
                          p.source === 'Tally'
                            ? 'success'
                            : p.source === 'Follow-up (Unverified)'
                            ? 'warning'
                            : 'info'
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                      {formatINR(p.receivedAmount)}
                    </td>
                  </tr>
                ))}
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
