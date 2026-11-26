import React, { useState } from 'react';
import {
  CalendarClock,
  IndianRupee,
  MapPin,
  Percent,
  Phone,
  PhoneCall,
  Plus,
  UserCheck,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CreditNoteRecord,
  DerivedCommitment,
  EnrichedParty,
  FollowUp,
  InterestUpdateEntry,
  InvoiceRecord,
  PaymentReceipt,
  User,
} from '../../types';
import {
  formatDateDisplay,
  formatINR,
  formatShortDate,
} from '../../utils/formatters';
import {
  buildPartyTimelineEntry,
  computePartyFifoLedger,
} from '../../services/recoveryEngine';
import { StatusText } from '../ui/CommonUI';
import { EASE_OUT_EXPO } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface PartyDetailDrawerProps {
  party: EnrichedParty | null;
  onClose: () => void;
  followUps: FollowUp[];
  payments: PaymentReceipt[];
  commitments: DerivedCommitment[];
  invoices?: InvoiceRecord[];
  creditNotes?: CreditNoteRecord[];
  interestUpdates?: InterestUpdateEntry[];
  users: User[];
  currentUser: User;
  onAddFollowUp: (party: EnrichedParty) => void;
  onRecordPayment: (party: EnrichedParty) => void;
  onReassignParty: (partyCode: string, newUserId: string) => void;
  onUpdateInterest?: (vchNo: string, party?: EnrichedParty) => void;
}

export function PartyDetailDrawer({
  party,
  onClose,
  followUps,
  payments,
  commitments,
  invoices = [],
  creditNotes = [],
  interestUpdates = [],
  users,
  currentUser,
  onAddFollowUp,
  onRecordPayment,
  onReassignParty,
  onUpdateInterest,
}: PartyDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<
    'invoices' | 'timeline' | 'followUps' | 'payments' | 'commitments'
  >('invoices');
  const [billFilter, setBillFilter] = useState<
    'all' | 'overdue' | 'pending' | 'paid'
  >('all');

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const normPartyName = (party?.partyName || '').trim().toLowerCase();

  const partyFollowUps = party
    ? followUps
        .filter(
          (f) =>
            f.partyCode === party.customerCode ||
            (normPartyName && f.partyName.trim().toLowerCase() === normPartyName)
        )
        .sort((a, b) =>
          `${b.followUpDate} ${b.followUpTime}`.localeCompare(
            `${a.followUpDate} ${a.followUpTime}`
          )
        )
    : [];

  const partyPayments = party
    ? payments
        .filter(
          (p) =>
            p.partyCode === party.customerCode ||
            (normPartyName && p.partyName.trim().toLowerCase() === normPartyName)
        )
        .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
    : [];

  const partyCommitments = party
    ? commitments
        .filter((c) => c.partyCode === party.customerCode)
        .sort((a, b) => b.promisedDate.localeCompare(a.promisedDate))
    : [];

  const partyInvoices = party
    ? invoices
        .filter(
          (inv) =>
            inv.partyCode === party.customerCode ||
            (normPartyName && inv.partyName.trim().toLowerCase() === normPartyName)
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const partyCreditNotes = party
    ? creditNotes.filter(
        (cn) =>
          cn.partyCode === party.customerCode ||
          (normPartyName && cn.partyName.trim().toLowerCase() === normPartyName)
      )
    : [];

  const latestInterestByVch = new Map<string, InterestUpdateEntry>();
  interestUpdates.forEach((entry) => {
    latestInterestByVch.set(entry.vchNo.trim().toLowerCase(), entry);
  });

  const totalSalesAmount = partyInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalCreditNoteAmount = partyCreditNotes.reduce((sum, cn) => sum + cn.amount, 0);
  const totalReceivedAmount = partyPayments.reduce((sum, p) => sum + p.receivedAmount, 0);
  const totalInterestAmount = partyInvoices.reduce((sum, inv) => {
    const intRule = latestInterestByVch.get(inv.vchNo.trim().toLowerCase());
    return sum + (intRule?.calculatedInterest || 0);
  }, 0);

  const fifoLedger = computePartyFifoLedger(
    partyInvoices,
    totalReceivedAmount,
    totalCreditNoteAmount,
    party?.creditDays ?? 30
  );

  const filteredFifoItems = fifoLedger.items.filter((item) => {
    if (billFilter === 'overdue') return item.isOverdue;
    if (billFilter === 'pending') return item.pendingAmount > 0;
    if (billFilter === 'paid') return item.pendingAmount <= 0;
    return true;
  });

  const canRecordPayment =
    currentUser.role === 'Admin' || currentUser.canRecordPayment;

  const statusTone =
    party?.paymentStatus === 'Settled'
      ? 'success'
      : party?.paymentStatus === 'Critical' || party?.paymentStatus === 'Disputed'
      ? 'danger'
      : party?.paymentStatus === 'Overdue'
      ? 'warning'
      : 'info';

  // Combined chronological timeline (calls + receipts)
  const timelineItems = [
    ...partyFollowUps.map((f) => ({
      id: f.id,
      sortKey: `${f.followUpDate} ${f.followUpTime}`,
      type: 'call' as const,
      headline: buildPartyTimelineEntry(
        f,
        userMap.get(f.userId) || 'Collection Officer'
      ),
      detail: f.discussionNotes,
      sub: f.remarks,
      date: f.followUpDate,
    })),
    ...partyPayments.map((p) => ({
      id: p.id,
      sortKey: `${p.receivedDate} 23:59`,
      type: 'payment' as const,
      headline: `${formatShortDate(p.receivedDate)} – Payment Received – ${formatINR(
        p.receivedAmount
      )} (${p.paymentMode})`,
      detail: `UTR / Ref: ${p.utrNumber} · ${p.bankDetails}`,
      sub: `Source: ${p.source} · ${p.remarks}`,
      date: p.receivedDate,
    })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return (
    <AnimatePresence>
      {party && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-40 flex justify-end bg-stone-950/45 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl bg-white h-full shadow-2xl border-l border-[#EAE2D9] flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 bg-[#1C1917] text-white flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-stone-300">
                  <span className="font-mono">{party.customerCode}</span>
                  <span aria-hidden="true">·</span>
                  <span>{party.city}</span>
                  <span aria-hidden="true">·</span>
                  <span>{party.status}</span>
                </div>
                <h2 className="text-xl font-bold text-white mt-1 truncate">
                  {party.partyName}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-300">
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-orange-400" />
                    {party.contactPerson}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-orange-400" />
                    {party.mobileNumber || '—'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-400" />
                    Assigned: {party.assignedUserName}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-orange-300 font-mono text-[11px]">
                    Credit Period: {party.creditDays} Days
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-stone-300 hover:text-white rounded-lg hover:bg-white/10"
                aria-label="Close party profile"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Strip */}
            <div className="px-6 py-3 bg-[#FAF6F1] border-b border-[#EAE2D9] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusText label={party.paymentStatus} tone={statusTone} />
                {party.hasOverdueCommitment && (
                  <>
                    <span className="text-stone-300">|</span>
                    <StatusText label="Overdue Commitment" tone="danger" />
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {currentUser.role === 'Admin' && (
                  <PremiumSelect
                    ariaLabel="Reassign party owner"
                    value={party.assignedUserId}
                    onChange={(val) => onReassignParty(party.customerCode, val)}
                    className="min-w-[180px]"
                    options={users
                      .filter((u) => u.active)
                      .map((u) => ({
                        value: u.id,
                        label: `Assign: ${u.name}`,
                        subLabel: u.role,
                      }))}
                  />
                )}

                <button
                  type="button"
                  onClick={() => onAddFollowUp(party)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Follow-up</span>
                </button>

                {onUpdateInterest && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateInterest(partyInvoices[0]?.vchNo || '', party)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#C2410C] bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg transition-colors"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>Set Interest</span>
                  </button>
                )}

                {canRecordPayment && (
                  <button
                    type="button"
                    onClick={() => onRecordPayment(party)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                  >
                    <IndianRupee className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Financial & Call Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white">
                  <span className="text-xs text-stone-500">Total Outstanding</span>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-stone-900">
                    {formatINR(party.totalOutstanding)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white">
                  <span className="text-xs text-stone-500">Overdue Amount</span>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-red-700">
                    {formatINR(party.overdueAmount)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white">
                  <span className="text-xs text-stone-500">Total Recovered</span>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700">
                    {formatINR(party.totalRecovered)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white">
                  <span className="text-xs text-stone-500">Total Commitments</span>
                  <p className="mt-1 text-lg font-bold font-mono tabular-nums text-[#C2410C]">
                    {formatINR(party.totalCommitted)}
                  </p>
                </div>
              </div>

              {/* Aging & Call Telemetry */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[#EAE2D9] bg-[#FAF6F1]">
                  <h4 className="text-xs font-semibold text-stone-700 mb-3">
                    Overdue Aging Breakdown
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div className="text-stone-600">0–30 Days (Current)</div>
                    <div className="text-right font-mono tabular-nums font-medium text-stone-900">
                      {formatINR(party.aging.days0_30)}
                    </div>
                    <div className="text-stone-600">31–60 Days</div>
                    <div className="text-right font-mono tabular-nums font-medium text-amber-700">
                      {formatINR(party.aging.days31_60)}
                    </div>
                    <div className="text-stone-600">61–90 Days</div>
                    <div className="text-right font-mono tabular-nums font-medium text-[#EA580C]">
                      {formatINR(party.aging.days61_90)}
                    </div>
                    <div className="text-stone-600">90+ Days Critical</div>
                    <div className="text-right font-mono tabular-nums font-medium text-red-700">
                      {formatINR(party.aging.days90Plus)}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-[#EAE2D9] bg-[#FAF6F1]">
                  <h4 className="text-xs font-semibold text-stone-700 mb-3">
                    Call & Follow-up Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div className="text-stone-600">Total Calls Made</div>
                    <div className="text-right font-mono tabular-nums font-semibold text-stone-900">
                      {party.totalCalls} ({party.successfulCalls} connected ·{' '}
                      {party.unansweredCalls} missed)
                    </div>
                    <div className="text-stone-600">First Follow-up</div>
                    <div className="text-right font-medium text-stone-900">
                      {formatDateDisplay(party.firstFollowUpDate)}
                    </div>
                    <div className="text-stone-600">Last Follow-up</div>
                    <div className="text-right font-medium text-stone-900">
                      {formatDateDisplay(party.lastFollowUpDate)}
                    </div>
                    <div className="text-stone-600">Next Follow-up</div>
                    <div className="text-right font-medium text-[#C2410C]">
                      {formatDateDisplay(party.nextFollowUpDate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div>
                <div className="flex items-center gap-1 p-1 bg-[#F3ECE4] rounded-lg w-fit max-w-full overflow-x-auto">
                  {(
                    [
                      ['invoices', `Invoice Details (${partyInvoices.length})`],
                      ['timeline', `Timeline (${timelineItems.length})`],
                      ['followUps', `Follow-ups (${partyFollowUps.length})`],
                      ['payments', `Receipts (${partyPayments.length})`],
                      ['commitments', `Commitments (${partyCommitments.length})`],
                    ] as const
                  ).map(([key, label]) => {
                    const isTabActive = activeTab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key)}
                        className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          isTabActive
                            ? 'text-[#C2410C]'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {isTabActive && (
                          <motion.span
                            layoutId="party-drawer-tab"
                            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                            className="absolute inset-0 bg-white rounded-md shadow-sm"
                          />
                        )}
                        <span className="relative z-10">{label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4">
                  {activeTab === 'timeline' && (
                    <div className="space-y-3">
                      {timelineItems.length === 0 ? (
                        <p className="text-sm text-stone-500 py-6 text-center border border-dashed border-[#E2D8CE] rounded-xl">
                          No call or payment timeline entries recorded yet.
                        </p>
                      ) : (
                        timelineItems.map((item) => (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white flex items-start gap-3"
                          >
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                item.type === 'payment'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-orange-50 text-[#EA580C]'
                              }`}
                            >
                              {item.type === 'payment' ? (
                                <IndianRupee className="w-4 h-4" />
                              ) : (
                                <PhoneCall className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-stone-900">
                                {item.headline}
                              </p>
                              <p className="text-xs text-stone-600 mt-1">
                                {item.detail}
                              </p>
                              {item.sub && (
                                <p className="text-xs text-stone-400 mt-1">
                                  {item.sub}
                                </p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'followUps' && (
                    <div className="space-y-2.5">
                      {partyFollowUps.length === 0 ? (
                        <p className="text-sm text-stone-500 py-6 text-center border border-dashed border-[#E2D8CE] rounded-xl">
                          No follow-ups logged for this party.
                        </p>
                      ) : (
                        partyFollowUps.map((f) => (
                          <div
                            key={f.id}
                            className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-stone-900">
                                {formatDateDisplay(f.followUpDate)} · {f.followUpTime} ·{' '}
                                {userMap.get(f.userId) || f.userId}
                              </span>
                              <span className="font-medium text-[#C2410C]">
                                {f.status}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs text-stone-700">
                              {f.discussionNotes}
                            </p>
                            {f.commitmentAmount > 0 && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-amber-800 font-medium">
                                <CalendarClock className="w-3.5 h-3.5" />
                                <span>
                                  Promised {formatINR(f.commitmentAmount)} on{' '}
                                  {formatDateDisplay(f.nextPaymentDate)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'payments' && (
                    <div className="border border-[#EAE2D9] rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                          <tr>
                            <th className="text-left px-3 py-2.5 font-medium">Date</th>
                            <th className="text-left px-3 py-2.5 font-medium">Voucher / UTR</th>
                            <th className="text-left px-3 py-2.5 font-medium">Mode</th>
                            <th className="text-left px-3 py-2.5 font-medium">Source</th>
                            <th className="text-right px-3 py-2.5 font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4ECE3]">
                          {partyPayments.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-6 text-center text-stone-500"
                              >
                                No actual payment receipts recorded yet.
                              </td>
                            </tr>
                          ) : (
                            partyPayments.map((p) => (
                              <tr key={p.id}>
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {formatDateDisplay(p.receivedDate)}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-stone-700">
                                  <div>{p.voucherRef}</div>
                                  <div className="text-stone-400">{p.utrNumber}</div>
                                </td>
                                <td className="px-3 py-2.5">{p.paymentMode}</td>
                                <td className="px-3 py-2.5">{p.source}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                  {formatINR(p.receivedAmount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activeTab === 'commitments' && (
                    <div className="space-y-2.5">
                      {partyCommitments.length === 0 ? (
                        <p className="text-sm text-stone-500 py-6 text-center border border-dashed border-[#EAE2D9] rounded-xl">
                          No payment commitments recorded for this party.
                        </p>
                      ) : (
                        partyCommitments.map((c) => (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-xl border border-[#EAE2D9] bg-white flex items-center justify-between gap-4"
                          >
                            <div>
                              <div className="text-xs text-stone-500">
                                Promised for {formatDateDisplay(c.promisedDate)} · Logged{' '}
                                {formatShortDate(c.followUpDate)}
                              </div>
                              <div className="text-sm font-semibold font-mono tabular-nums text-stone-900 mt-0.5">
                                {formatINR(c.promisedAmount)}
                              </div>
                              <div className="text-xs text-stone-600 mt-0.5">
                                Actual received against commitment:{' '}
                                <span className="font-mono font-medium text-emerald-700">
                                  {formatINR(c.actualReceived)}
                                </span>
                              </div>
                            </div>
                            <StatusText
                              label={c.status}
                              tone={
                                c.status === 'Fulfilled'
                                  ? 'success'
                                  : c.status === 'Overdue'
                                  ? 'danger'
                                  : c.status === 'Due Today'
                                  ? 'warning'
                                  : 'info'
                              }
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'invoices' && (
                    <div className="space-y-4">
                      {/* Sheet-style INVOICE DETAILS + FIFO Summary Bar */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/70">
                          <span className="text-[11px] font-semibold text-amber-900 block">
                            Total Sales ({partyInvoices.length} Bills)
                          </span>
                          <p className="mt-1 text-sm font-bold font-mono tabular-nums text-stone-900">
                            {formatINR(totalSalesAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
                          <span className="text-[11px] font-semibold text-stone-700 block">
                            Credit Note
                          </span>
                          <p className="mt-1 text-sm font-bold font-mono tabular-nums text-stone-900">
                            {formatINR(totalCreditNoteAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/80">
                          <span className="text-[11px] font-semibold text-emerald-900 block">
                            Bulk Received (FIFO)
                          </span>
                          <p className="mt-1 text-sm font-bold font-mono tabular-nums text-emerald-800">
                            {formatINR(totalReceivedAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-[#EAE2D9] bg-[#FAF6F1]">
                          <span className="text-[11px] font-semibold text-stone-700 block">
                            FIFO Bill Status
                          </span>
                          <p className="mt-1 text-xs font-bold font-mono text-stone-900">
                            <span className="text-emerald-700">{fifoLedger.paidBillsCount} Paid</span>
                            {' · '}
                            <span className="text-red-700">{fifoLedger.overdueBillsCount} Due</span>
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-red-200 bg-red-50">
                          <span className="text-[11px] font-semibold text-red-800 block">
                            Overdue (&gt; {party.creditDays}d)
                          </span>
                          <p className="mt-1 text-sm font-bold font-mono tabular-nums text-red-700">
                            {formatINR(fifoLedger.overdueAmount)}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl border border-orange-200 bg-orange-50/80">
                          <span className="text-[11px] font-semibold text-[#C2410C] block">
                            Total Interest Amt
                          </span>
                          <p className="mt-1 text-sm font-bold font-mono tabular-nums text-[#C2410C]">
                            {formatINR(totalInterestAmount)}
                          </p>
                        </div>
                      </div>

                      {/* FIFO Bill Filter Pills */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ['all', `All Bills (${fifoLedger.items.length})`],
                              ['overdue', `Overdue > ${party.creditDays}d (${fifoLedger.overdueBillsCount})`],
                              ['pending', `Unpaid / Pending (${fifoLedger.unpaidBillsCount})`],
                              ['paid', `Paid via FIFO (${fifoLedger.paidBillsCount})`],
                            ] as const
                          ).map(([fKey, fLabel]) => (
                            <button
                              key={fKey}
                              type="button"
                              onClick={() => setBillFilter(fKey)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                billFilter === fKey
                                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                  : 'bg-white text-stone-600 border-[#E2D8CE] hover:bg-[#FAF6F1]'
                              }`}
                            >
                              {fLabel}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] text-stone-500">
                          FIFO Rule: Oldest bills adjusted first against bulk payments &amp; credit notes
                        </span>
                      </div>

                      <div className="border border-[#EAE2D9] rounded-xl overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-[#5C1919] text-white">
                            <tr>
                              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Date</th>
                              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Vch No.</th>
                              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Bill Amt</th>
                              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Paid (FIFO)</th>
                              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Pending Amt</th>
                              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Age / Credit ({party.creditDays}d)</th>
                              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Status</th>
                              <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Update</th>
                              <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Interest Amt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F4ECE3] bg-white">
                            {filteredFifoItems.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="px-3 py-6 text-center text-stone-500"
                                >
                                  No vouchers match this filter.
                                </td>
                              </tr>
                            ) : (
                              filteredFifoItems.map((item) => {
                                const inv = item.invoice;
                                const intRule = latestInterestByVch.get(
                                  inv.vchNo.trim().toLowerCase()
                                );
                                return (
                                  <tr
                                    key={inv.id}
                                    className={`transition-colors ${
                                      item.fifoStatus === 'Paid'
                                        ? 'bg-emerald-50/25 hover:bg-emerald-50/50'
                                        : item.isOverdue
                                        ? 'bg-red-50/20 hover:bg-red-50/40'
                                        : 'hover:bg-orange-50/40'
                                    }`}
                                  >
                                    <td className="px-3 py-2.5 whitespace-nowrap font-mono text-stone-700">
                                      {formatDateDisplay(inv.date)}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono font-semibold text-stone-900 whitespace-nowrap">
                                      {inv.vchNo}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-stone-800 whitespace-nowrap">
                                      {formatINR(inv.amount)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium text-emerald-700 whitespace-nowrap">
                                      {item.paidAmount > 0 ? formatINR(item.paidAmount) : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-stone-900 whitespace-nowrap">
                                      {item.pendingAmount > 0 ? (
                                        <span className={item.isOverdue ? 'text-red-700' : 'text-stone-900'}>
                                          {formatINR(item.pendingAmount)}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-700">₹0</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      <span className="font-mono font-semibold text-stone-800">
                                        {item.ageDays}d
                                      </span>{' '}
                                      {item.pendingAmount <= 0 ? (
                                        <span className="text-[11px] text-emerald-700">· Settled</span>
                                      ) : item.isOverdue ? (
                                        <span className="text-[11px] font-semibold text-red-700">
                                          · +{item.overdueDays}d overdue
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-stone-500">
                                          · {Math.max(0, item.creditDays - item.ageDays)}d left
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      <StatusText
                                        label={item.fifoStatus}
                                        tone={
                                          item.fifoStatus === 'Paid'
                                            ? 'success'
                                            : item.fifoStatus === 'Overdue'
                                            ? 'danger'
                                            : item.fifoStatus === 'Partial'
                                            ? 'warning'
                                            : 'info'
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                      {onUpdateInterest && (
                                        <button
                                          type="button"
                                          onClick={() => onUpdateInterest(inv.vchNo, party)}
                                          className="text-[#2563EB] hover:text-[#1D4ED8] underline font-medium"
                                        >
                                          Interest Update
                                        </button>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-[#C2410C] whitespace-nowrap">
                                      {intRule ? formatINR(intRule.calculatedInterest) : '₹0'}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {partyCreditNotes.length > 0 && (
                        <div className="p-3.5 rounded-xl border border-[#EAE2D9] bg-[#FAF6F1] space-y-2">
                          <h5 className="text-xs font-semibold text-stone-800">
                            Credit Notes ({partyCreditNotes.length})
                          </h5>
                          {partyCreditNotes.map((cn) => (
                            <div
                              key={cn.id}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="font-mono text-stone-700">
                                {cn.vchNo} · {formatDateDisplay(cn.date)}
                              </span>
                              <span className="font-mono font-semibold text-[#C2410C]">
                                -{formatINR(cn.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
