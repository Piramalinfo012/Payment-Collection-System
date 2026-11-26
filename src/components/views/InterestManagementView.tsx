import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  ChevronDown,
  Edit3,
  FileSpreadsheet,
  IndianRupee,
  Percent,
  Plus,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  CreditNoteRecord,
  EnrichedParty,
  InterestRateBasis,
  InterestUpdateEntry,
  InvoiceRecord,
  User,
} from '../../types';
import { calculateInterestAmount } from '../../services/googleSheetsService';
import { formatDateDisplay, formatINR } from '../../utils/formatters';
import { EmptyState, StatusText } from '../ui/CommonUI';
import {
  AnimatedNumber,
  EASE_OUT_EXPO,
  MotionCard,
  SlidingTabs,
} from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface InterestManagementViewProps {
  interestUpdates: InterestUpdateEntry[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
  parties: EnrichedParty[];
  currentUser: User;
  isLiveSheet: boolean;
  initialVoucherNo?: string;
  onClearInitialVoucher?: () => void;
  onSaveInterest: (
    draft: Omit<
      InterestUpdateEntry,
      'id' | 'calculatedInterest' | 'totalPayableWithInterest' | 'timestamp'
    >,
    updateRowIndex?: number
  ) => void;
  onSelectPartyByCode: (code: string) => void;
}

export function InterestManagementView({
  interestUpdates,
  invoices,
  creditNotes,
  parties,
  currentUser,
  isLiveSheet,
  initialVoucherNo,
  onClearInitialVoucher,
  onSaveInterest,
  onSelectPartyByCode,
}: InterestManagementViewProps) {
  const [activeTab, setActiveTab] = useState<'latest' | 'history' | 'credit_notes'>(
    'latest'
  );
  const [search, setSearch] = useState('');

  // Form state
  const [vchNo, setVchNo] = useState('');
  const [selectedPartyCode, setSelectedPartyCode] = useState('');
  const [partyName, setPartyName] = useState('');
  const [ratePct, setRatePct] = useState('1');
  const [rateBasis, setRateBasis] = useState<InterestRateBasis>('monthly');
  const [numberOfDays, setNumberOfDays] = useState('30');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [editingRowIndex, setEditingRowIndex] = useState<number | undefined>(undefined);
  const [invoiceDropdownOpen, setInvoiceDropdownOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [partyQuery, setPartyQuery] = useState('');

  // Pre-fill when navigated from Party Detail Drawer
  useEffect(() => {
    if (!initialVoucherNo) return;
    const inv = invoices.find(
      (i) => i.vchNo.toLowerCase() === initialVoucherNo.toLowerCase()
    );
    const existing = [...interestUpdates]
      .reverse()
      .find((u) => u.vchNo.toLowerCase() === initialVoucherNo.toLowerCase());

    setVchNo(initialVoucherNo);
    if (inv) {
      setSelectedPartyCode(inv.partyCode);
      setPartyName(inv.partyName);
      setInvoiceAmount(String(inv.amount || inv.pendingAmount || ''));
    }
    if (existing) {
      setRatePct(String(existing.ratePct || 1));
      setRateBasis(existing.rateBasis);
      setNumberOfDays(String(existing.numberOfDays || 30));
      if (!inv) {
        setSelectedPartyCode(existing.partyCode || '');
        setPartyName(existing.partyName || '');
        setInvoiceAmount(String(existing.invoiceAmount || ''));
      }
      setEditingRowIndex(existing.sheetRowIndex);
    }
    onClearInitialVoucher?.();
  }, [initialVoucherNo, invoices, interestUpdates, onClearInitialVoucher]);

  const handleSelectInvoice = (selectedVch: string) => {
    setVchNo(selectedVch);
    setEditingRowIndex(undefined);
    const inv = invoices.find((i) => i.vchNo === selectedVch);
    if (inv) {
      setSelectedPartyCode(inv.partyCode);
      setPartyName(inv.partyName);
      setInvoiceAmount(String(inv.pendingAmount || inv.amount || ''));
    }
    const existing = [...interestUpdates]
      .reverse()
      .find((u) => u.vchNo.toLowerCase() === selectedVch.toLowerCase());
    if (existing) {
      setRatePct(String(existing.ratePct || 1));
      setRateBasis(existing.rateBasis);
      setNumberOfDays(String(existing.numberOfDays || 30));
      if (existing.invoiceAmount > 0 && !inv) {
        setInvoiceAmount(String(existing.invoiceAmount));
      }
    }
  };

  const handleSelectParty = (code: string) => {
    setSelectedPartyCode(code);
    const p = parties.find((item) => item.customerCode === code);
    if (p) {
      setPartyName(p.partyName);
      if (!invoiceAmount) {
        setInvoiceAmount(String(p.totalOutstanding || p.overdueAmount || ''));
      }
    }
  };

  const handleEditEntry = (entry: InterestUpdateEntry) => {
    setVchNo(entry.vchNo);
    setSelectedPartyCode(entry.partyCode || '');
    setPartyName(entry.partyName || '');
    setRatePct(String(entry.ratePct));
    setRateBasis(entry.rateBasis);
    setNumberOfDays(String(entry.numberOfDays));
    setInvoiceAmount(String(entry.invoiceAmount));
    setRemarks(entry.remarks || '');
    setEditingRowIndex(entry.sheetRowIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setVchNo('');
    setSelectedPartyCode('');
    setPartyName('');
    setRatePct('1');
    setRateBasis('monthly');
    setNumberOfDays('30');
    setInvoiceAmount('');
    setRemarks('');
    setEditingRowIndex(undefined);
  };

  const numericAmount = Number(invoiceAmount) || 0;
  const numericRate = Number(ratePct) || 0;
  const numericDays = Number(numberOfDays) || 0;

  const previewInterest = useMemo(
    () =>
      calculateInterestAmount(numericAmount, numericRate, rateBasis, numericDays),
    [numericAmount, numericRate, rateBasis, numericDays]
  );
  const previewTotal = numericAmount + previewInterest;

  const formattedRateLabel =
    rateBasis === 'monthly' ? `${numericRate}% per month` : `${numericRate}%`;

  const handleSubmit = (e: React.FormEvent, asNewAppend = false) => {
    e.preventDefault();
    if (!vchNo.trim() || numericAmount <= 0 || numericRate <= 0 || numericDays <= 0) {
      return;
    }

    onSaveInterest(
      {
        vchNo: vchNo.trim(),
        partyCode: selectedPartyCode || undefined,
        partyName: partyName.trim() || undefined,
        interestRateRaw: formattedRateLabel,
        ratePct: numericRate,
        rateBasis,
        numberOfDays: numericDays,
        invoiceAmount: numericAmount,
        updatedBy: currentUser.name,
        remarks: remarks.trim() || undefined,
      },
      asNewAppend ? undefined : editingRowIndex
    );
    resetForm();
  };

  // Deduplicate latest entry per Vch No. (preserving latest timestamp / row order)
  const latestByVoucher = useMemo(() => {
    const map = new Map<string, InterestUpdateEntry>();
    interestUpdates.forEach((entry) => {
      map.set(entry.vchNo.trim().toLowerCase(), entry);
    });
    return Array.from(map.values()).reverse();
  }, [interestUpdates]);

  const allHistoryRows = useMemo(
    () => [...interestUpdates].reverse(),
    [interestUpdates]
  );

  const q = search.trim().toLowerCase();

  const filteredLatest = useMemo(
    () =>
      latestByVoucher.filter(
        (item) =>
          !q ||
          item.vchNo.toLowerCase().includes(q) ||
          (item.partyName || '').toLowerCase().includes(q)
      ),
    [latestByVoucher, q]
  );

  const filteredHistory = useMemo(
    () =>
      allHistoryRows.filter(
        (item) =>
          !q ||
          item.vchNo.toLowerCase().includes(q) ||
          (item.partyName || '').toLowerCase().includes(q)
      ),
    [allHistoryRows, q]
  );

  const filteredCreditNotes = useMemo(
    () =>
      creditNotes.filter(
        (cn) =>
          !q ||
          cn.vchNo.toLowerCase().includes(q) ||
          cn.partyName.toLowerCase().includes(q)
      ),
    [creditNotes, q]
  );

  // Totals from latest per voucher
  const summaryStats = useMemo(() => {
    const totalPrincipal = latestByVoucher.reduce((s, e) => s + e.invoiceAmount, 0);
    const totalInterest = latestByVoucher.reduce((s, e) => s + e.calculatedInterest, 0);
    const totalPayable = totalPrincipal + totalInterest;
    const creditNoteTotal = creditNotes.reduce((s, c) => s + c.amount, 0);
    return {
      vouchersTracked: latestByVoucher.length,
      totalPrincipal,
      totalInterest,
      totalPayable,
      creditNoteTotal,
    };
  }, [latestByVoucher, creditNotes]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MotionCard
          delay={0}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>Vouchers Under Interest</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center ring-1 ring-black/5">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber
              value={summaryStats.vouchersTracked}
              formatter={(n) => String(Math.round(n))}
            />
          </p>
          <p className="mt-2.5 pt-2.5 border-t border-[#F4ECE3] text-[11px] text-stone-500">
            {interestUpdates.length} total log(s) · {invoices.length} sheet invoices
          </p>
        </MotionCard>

        <MotionCard
          delay={0.04}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>Principal Invoice Value</span>
            <div className="w-8 h-8 rounded-xl bg-[#F3ECE4] text-stone-700 flex items-center justify-center ring-1 ring-black/5">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber
              value={summaryStats.totalPrincipal}
              formatter={(n) => formatINR(Math.round(n))}
            />
          </p>
          <p className="mt-2.5 pt-2.5 border-t border-[#F4ECE3] text-[11px] text-stone-500">
            Active principal covered by interest rules
          </p>
        </MotionCard>

        <MotionCard
          delay={0.08}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>Total Calculated Interest</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center ring-1 ring-black/5">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-amber-700">
            <AnimatedNumber
              value={summaryStats.totalInterest}
              formatter={(n) => formatINR(Math.round(n))}
            />
          </p>
          <p className="mt-2.5 pt-2.5 border-t border-[#F4ECE3] text-[11px] text-stone-500">
            Computed from rate, basis &amp; overdue days
          </p>
        </MotionCard>

        <MotionCard
          delay={0.12}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>Total Payable w/ Interest</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center ring-1 ring-black/5">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            <AnimatedNumber
              value={summaryStats.totalPayable}
              formatter={(n) => formatINR(Math.round(n))}
            />
          </p>
          <p className="mt-2.5 pt-2.5 border-t border-[#F4ECE3] text-[11px] text-stone-500">
            Credit Notes on record: {formatINR(summaryStats.creditNoteTotal)}
          </p>
        </MotionCard>
      </div>

      {/* Interest Update / Calculator Form */}
      <MotionCard
        delay={0.06}
        className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)] space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">
                {editingRowIndex
                  ? `Update Interest Row #${editingRowIndex} (${vchNo})`
                  : 'Set or Update Voucher / Party Interest Rate'}
              </h2>
              <p className="text-xs text-stone-500">
                {isLiveSheet
                  ? 'Updates sync directly to the "Interest Update" sheet tab (Vch No. · Timestamp · Interest Rate · Number Of Days · Invoice Amount)'
                  : 'Configure custom monthly or annual interest percentage and overdue days per invoice voucher'}
              </p>
            </div>
          </div>

          {editingRowIndex && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-[#E2D8CE] rounded-lg text-stone-600 hover:bg-[#FAF6F1] self-start sm:self-auto"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Searchable Invoice Picker */}
            <div className="relative">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Pick from Sheet Invoices (Optional)
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={
                    invoiceDropdownOpen
                      ? invoiceQuery
                      : vchNo && invoices.some((i) => i.vchNo === vchNo)
                      ? `${vchNo}${partyName ? ` · ${partyName}` : ''}`
                      : invoiceQuery
                  }
                  onFocus={() => {
                    setInvoiceDropdownOpen(true);
                    setInvoiceQuery('');
                  }}
                  onBlur={() => setTimeout(() => setInvoiceDropdownOpen(false), 160)}
                  onChange={(e) => {
                    setInvoiceQuery(e.target.value);
                    setInvoiceDropdownOpen(true);
                  }}
                  placeholder="Search Vch No. or Party..."
                  className="w-full pl-8 pr-8 py-2 text-xs border border-[#E2D8CE] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C]"
                />
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {invoiceDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#EAE2D9] rounded-xl shadow-xl max-h-64 overflow-y-auto z-30 divide-y divide-[#F4ECE3]">
                  {(() => {
                    const iq = invoiceQuery.trim().toLowerCase();
                    const pNorm = partyName.trim().toLowerCase();
                    const matches = invoices
                      .filter((inv) => {
                        const matchesParty =
                          !selectedPartyCode ||
                          inv.partyCode === selectedPartyCode ||
                          (pNorm && inv.partyName.trim().toLowerCase() === pNorm);
                        const matchesQuery =
                          !iq ||
                          inv.vchNo.toLowerCase().includes(iq) ||
                          inv.partyName.toLowerCase().includes(iq);
                        return matchesParty && matchesQuery;
                      })
                      .slice(0, 60);

                    if (matches.length === 0) {
                      return (
                        <div className="px-3 py-4 text-xs text-stone-500 text-center">
                          No matching invoices found.
                        </div>
                      );
                    }

                    return matches.map((inv) => (
                      <button
                        key={inv.id}
                        type="button"
                        onMouseDown={() => {
                          handleSelectInvoice(inv.vchNo);
                          setInvoiceQuery('');
                          setInvoiceDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-orange-50/80 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-semibold text-stone-900 truncate">
                            {inv.vchNo}
                          </p>
                          <p className="text-[11px] text-stone-500 truncate">
                            {inv.partyName} · {formatDateDisplay(inv.date)}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-semibold text-[#C2410C] shrink-0">
                          {formatINR(inv.amount)}
                        </span>
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Vch No */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Vch No. / Invoice Reference *
              </label>
              <input
                type="text"
                required
                value={vchNo}
                onChange={(e) => setVchNo(e.target.value)}
                placeholder="e.g. PPPL/0949/25-26"
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C]"
              />
            </div>

            {/* Searchable Party selector */}
            <div className="relative">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Party / Customer Name
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={partyDropdownOpen ? partyQuery : partyName}
                  onFocus={() => {
                    setPartyDropdownOpen(true);
                    setPartyQuery('');
                  }}
                  onBlur={() => setTimeout(() => setPartyDropdownOpen(false), 160)}
                  onChange={(e) => {
                    setPartyQuery(e.target.value);
                    setPartyDropdownOpen(true);
                  }}
                  placeholder="Search Party Name or Code..."
                  className="w-full pl-8 pr-8 py-2 text-xs border border-[#E2D8CE] rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C]"
                />
                {partyName && !partyDropdownOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPartyCode('');
                      setPartyName('');
                      setPartyQuery('');
                    }}
                    aria-label="Clear party"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                )}
              </div>

              {partyDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#EAE2D9] rounded-xl shadow-xl max-h-64 overflow-y-auto z-30 divide-y divide-[#F4ECE3]">
                  {(() => {
                    const pq = partyQuery.trim().toLowerCase();
                    const matches = parties
                      .filter(
                        (p) =>
                          !pq ||
                          p.partyName.toLowerCase().includes(pq) ||
                          p.customerCode.toLowerCase().includes(pq)
                      )
                      .slice(0, 60);

                    if (matches.length === 0) {
                      return (
                        <div className="px-3 py-4 text-xs text-stone-500 text-center">
                          No matching parties found.
                        </div>
                      );
                    }

                    return matches.map((p) => (
                      <button
                        key={p.customerCode}
                        type="button"
                        onMouseDown={() => {
                          handleSelectParty(p.customerCode);
                          setPartyQuery('');
                          setPartyDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-orange-50/80 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-stone-900 truncate">
                            {p.partyName}
                          </p>
                          <p className="text-[11px] font-mono text-stone-500">
                            {p.customerCode}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-stone-600 shrink-0">
                          {formatINR(p.totalOutstanding)}
                        </span>
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Invoice Amount */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Invoice Amount (₹) *
              </label>
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                placeholder="425259"
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            {/* Interest Rate + Basis */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Interest Rate (%) & Basis *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step="0.1"
                  required
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  className="w-24 px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
                <PremiumSelect
                  value={rateBasis}
                  onChange={(val) => setRateBasis(val as InterestRateBasis)}
                  searchable={false}
                  className="flex-1"
                  options={[
                    { value: 'monthly', label: '% per month (÷ 30 days)' },
                    { value: 'annual', label: '% per annum (÷ 365 days)' },
                  ]}
                />
              </div>
            </div>

            {/* Number of days */}
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Number Of Days *
              </label>
              <input
                type="number"
                min={1}
                max={3650}
                required
                value={numberOfDays}
                onChange={(e) => setNumberOfDays(e.target.value)}
                placeholder="25"
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>
          </div>

          {/* Live Calculation Preview & Submit */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FAF6F1] via-[#FFFBF7] to-orange-50/50 border border-[#EAE2D9] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              <div className="px-3 py-2 rounded-xl bg-white/80 border border-[#EAE2D9]/80">
                <span className="text-[11px] text-stone-500 block">Sheet Rate String</span>
                <span className="text-xs font-mono font-semibold text-stone-900 mt-0.5 block">
                  {formattedRateLabel}
                </span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/80 border border-[#EAE2D9]/80">
                <span className="text-[11px] text-stone-500 block">Principal</span>
                <span className="text-xs font-mono font-semibold text-stone-900 tabular-nums mt-0.5 block">
                  {formatINR(numericAmount)}
                </span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-orange-50/80 border border-orange-200/80">
                <span className="text-[11px] text-[#C2410C] block">Interest ({numericDays}d)</span>
                <span className="text-xs font-mono font-bold text-[#C2410C] tabular-nums mt-0.5 block">
                  +{formatINR(previewInterest)}
                </span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/80">
                <span className="text-[11px] text-emerald-800 block">Total Payable</span>
                <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums mt-0.5 block">
                  {formatINR(previewTotal)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {editingRowIndex && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-stone-700 bg-white border border-[#E2D8CE] hover:bg-[#FAF6F1] rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save as New Log Row</span>
                </button>
              )}
              <motion.button
                type="submit"
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-xl shadow-[0_8px_18px_-6px_rgba(234,88,12,0.5)] transition-colors"
              >
                <Percent className="w-3.5 h-3.5" />
                <span>
                  {editingRowIndex
                    ? `Update Row #${editingRowIndex}`
                    : 'Save Interest Update'}
                </span>
              </motion.button>
            </div>
          </div>
        </form>
      </MotionCard>

      {/* Tables & Tabs */}
      <MotionCard
        delay={0.1}
        className="bg-white border border-[#EAE2D9] rounded-2xl overflow-hidden shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
      >
        <div className="px-5 py-4 border-b border-[#EAE2D9] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SlidingTabs
            layoutId="interest-view-tabs"
            options={[
              { id: 'latest', label: `Latest by Voucher (${latestByVoucher.length})` },
              { id: 'history', label: `All Sheet Logs (${interestUpdates.length})` },
              { id: 'credit_notes', label: `Credit Notes (${creditNotes.length})` },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Vch No. or Party..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
            />
          </div>
        </div>

        {(activeTab === 'latest' || activeTab === 'history') && (
          <div className="overflow-x-auto">
            {(activeTab === 'latest' ? filteredLatest : filteredHistory).length ===
            0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Percent}
                  title="No Interest Updates Found"
                  description="Add an interest rate entry above to compute overdue interest and sync it to your Interest Update sheet."
                />
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Vch No.</th>
                    <th className="text-left px-4 py-3 font-semibold">Party Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
                    <th className="text-left px-4 py-3 font-semibold">Interest Rate</th>
                    <th className="text-right px-4 py-3 font-semibold">Days</th>
                    <th className="text-right px-4 py-3 font-semibold">Invoice Amount</th>
                    <th className="text-right px-4 py-3 font-semibold">Interest (₹)</th>
                    <th className="text-right px-4 py-3 font-semibold">Total Payable</th>
                    <th className="text-right px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECE3]">
                  {(activeTab === 'latest' ? filteredLatest : filteredHistory).map(
                    (entry) => (
                      <tr key={entry.id} className="hover:bg-orange-50/45">
                        <td className="px-4 py-3 font-mono font-semibold text-stone-900 whitespace-nowrap">
                          {entry.vchNo}
                        </td>
                        <td className="px-4 py-3">
                          {entry.partyCode ? (
                            <button
                              type="button"
                              onClick={() => onSelectPartyByCode(entry.partyCode!)}
                              className="text-[#C2410C] hover:underline font-medium text-left"
                            >
                              {entry.partyName || entry.partyCode}
                            </button>
                          ) : (
                            <span className="text-stone-700">
                              {entry.partyName || '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-stone-500 whitespace-nowrap">
                          {entry.timestamp
                            ? entry.timestamp.includes('T')
                              ? formatDateDisplay(entry.timestamp.slice(0, 10))
                              : entry.timestamp
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusText
                            label={`${entry.interestRateRaw} (${
                              entry.rateBasis === 'monthly' ? 'Monthly' : 'Annual'
                            })`}
                            tone="warning"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {entry.numberOfDays} days
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-stone-800">
                          {formatINR(entry.invoiceAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#C2410C]">
                          +{formatINR(entry.calculatedInterest)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatINR(entry.totalPayableWithInterest)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleEditEntry(entry)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 border border-orange-200 bg-orange-50/70 rounded-lg text-[11px] font-semibold text-[#C2410C] hover:bg-[#EA580C] hover:text-white transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Update</span>
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'credit_notes' && (
          <div className="overflow-x-auto">
            {filteredCreditNotes.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Receipt}
                  title="No Credit Notes Recorded"
                  description="Credit notes from the CREDIT NOTE sheet tab will appear here once synced."
                />
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Credit Note Vch No.</th>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Party Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Remarks</th>
                    <th className="text-right px-4 py-3 font-semibold">Credit Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECE3]">
                  {filteredCreditNotes.map((cn) => (
                    <tr key={cn.id} className="hover:bg-orange-50/45">
                      <td className="px-4 py-3 font-mono font-semibold text-stone-900">
                        {cn.vchNo}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDateDisplay(cn.date)}
                      </td>
                      <td className="px-4 py-3">
                        {cn.partyCode ? (
                          <button
                            type="button"
                            onClick={() => onSelectPartyByCode(cn.partyCode)}
                            className="text-[#C2410C] hover:underline font-medium text-left"
                          >
                            {cn.partyName}
                          </button>
                        ) : (
                          <span>{cn.partyName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{cn.remarks}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#C2410C]">
                        {formatINR(cn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </MotionCard>
    </div>
  );
}
