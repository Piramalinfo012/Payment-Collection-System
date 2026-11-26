import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  EnrichedParty,
  PaymentMode,
  PAYMENT_MODES,
  PaymentReceipt,
  User,
} from '../../types';
import { formatINR, getLocalTodayISO } from '../../utils/formatters';
import { EASE_OUT_EXPO } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface PaymentRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: EnrichedParty[];
  initialParty?: EnrichedParty | null;
  currentUser: User;
  users: User[];
  onSave: (
    receipt: Omit<PaymentReceipt, 'id' | 'createdAt' | 'source'>
  ) => void;
}

export function PaymentRecoveryModal({
  isOpen,
  onClose,
  parties,
  initialParty,
  currentUser,
  users,
  onSave,
}: PaymentRecoveryModalProps) {
  const todayISO = getLocalTodayISO();
  const [partyCode, setPartyCode] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayISO);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('NEFT');
  const [utrNumber, setUtrNumber] = useState('');
  const [bankDetails, setBankDetails] = useState('HDFC Bank – Corporate Collection');
  const [remarks, setRemarks] = useState('');
  const [recordedByUserId, setRecordedByUserId] = useState(currentUser.id);
  const [error, setError] = useState<string | null>(null);

  const selectedParty =
    parties.find((p) => p.customerCode === partyCode) || null;

  useEffect(() => {
    if (!isOpen) return;
    const target = initialParty || parties[0] || null;
    setPartyCode(target?.customerCode || '');
    setReceivedDate(getLocalTodayISO());
    setReceivedAmount('');
    setPaymentMode('NEFT');
    setUtrNumber('');
    setBankDetails('HDFC Bank – Corporate Collection');
    setRemarks('');
    setRecordedByUserId(currentUser.id);
    setError(null);
  }, [isOpen, initialParty, parties, currentUser.id]);

  const amountNum = Number(receivedAmount) || 0;
  const remainingAfter = selectedParty
    ? Math.max(0, selectedParty.totalOutstanding - amountNum)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedParty) {
      setError('Please select a customer party.');
      return;
    }
    if (amountNum <= 0) {
      setError('Payment Received Amount must be greater than ₹0.');
      return;
    }
    if (!utrNumber.trim()) {
      setError('Transaction / UTR Number is required to prevent duplicate entries.');
      return;
    }

    onSave({
      voucherRef: `MAN/${receivedDate.slice(2, 7).replace('-', '')}/${utrNumber.trim().slice(-6).toUpperCase()}`,
      partyCode: selectedParty.customerCode,
      partyName: selectedParty.partyName,
      receivedDate,
      receivedAmount: amountNum,
      paymentMode,
      utrNumber: utrNumber.trim(),
      bankDetails: bankDetails.trim(),
      remarks: remarks.trim(),
      recordedByUserId,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            className="w-full max-w-xl bg-white border border-[#EAE2D9] rounded-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
          >
        <div className="px-6 py-4 border-b border-[#EAE2D9] flex items-center justify-between bg-[#1C1917] text-white">
          <div>
            <h3 className="text-base font-semibold">Record Payment Recovery</h3>
            <p className="text-xs text-stone-300 mt-0.5">
              Actual receipt entry updates party balance and commitment fulfilment
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-300 hover:text-white p-1 rounded-md"
            aria-label="Close payment modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Party Name
              </label>
              <PremiumSelect
                value={partyCode}
                onChange={setPartyCode}
                disabled={Boolean(initialParty)}
                searchPlaceholder="Search party name or code..."
                options={parties.map((p) => ({
                  value: p.customerCode,
                  label: p.partyName,
                  subLabel: p.customerCode,
                  badge: formatINR(p.totalOutstanding),
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Received Date
              </label>
              <input
                type="date"
                required
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Received Amount (₹)
              </label>
              <input
                type="number"
                required
                min={1}
                step={1}
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                placeholder="e.g. 200000"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Mode
              </label>
              <PremiumSelect
                value={paymentMode}
                onChange={(val) => setPaymentMode(val as PaymentMode)}
                searchable={false}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Transaction / UTR Number
              </label>
              <input
                type="text"
                required
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                placeholder="e.g. HDFCR52026112200912"
                className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Bank Details
              </label>
              <input
                type="text"
                required
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Recorded By
              </label>
              <PremiumSelect
                value={recordedByUserId}
                onChange={setRecordedByUserId}
                disabled={currentUser.role !== 'Admin'}
                options={
                  currentUser.role === 'Admin'
                    ? users
                        .filter((u) => u.active)
                        .map((u) => ({ value: u.id, label: u.name, subLabel: u.role }))
                    : [{ value: currentUser.id, label: currentUser.name }]
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Remarks
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Invoice reference or settlement notes"
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>
          </div>

          {selectedParty && (
            <div className="p-3.5 rounded-lg bg-[#FAF6F1] border border-[#EAE2D9] grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-stone-500 block">Current Outstanding</span>
                <span className="font-mono font-semibold text-stone-900 tabular-nums mt-0.5 block">
                  {formatINR(selectedParty.totalOutstanding)}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Receipt Applied</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5 block">
                  − {formatINR(amountNum)}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Outstanding After</span>
                <span className="font-mono font-semibold text-[#C2410C] tabular-nums mt-0.5 block">
                  {formatINR(remainingAfter)}
                </span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-[#EAE2D9] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-[#E2D8CE] rounded-lg hover:bg-[#FAF6F1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Record Payment
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
