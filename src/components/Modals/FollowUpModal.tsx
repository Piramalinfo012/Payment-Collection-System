import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  EnrichedParty,
  FollowUp,
  FollowUpStatus,
  FOLLOW_UP_STATUS_OPTIONS,
  PaymentMode,
  PAYMENT_MODES,
  User,
} from '../../types';
import { formatINR, getLocalTodayISO } from '../../utils/formatters';
import { EASE_OUT_EXPO } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: EnrichedParty[];
  initialParty?: EnrichedParty | null;
  currentUser: User;
  onSave: (followUp: Omit<FollowUp, 'id' | 'createdAt'>) => void;
}

export function FollowUpModal({
  isOpen,
  onClose,
  parties,
  initialParty,
  currentUser,
  onSave,
}: FollowUpModalProps) {
  const todayISO = getLocalTodayISO();
  const [selectedCode, setSelectedCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [followUpDate, setFollowUpDate] = useState(todayISO);
  const [followUpTime, setFollowUpTime] = useState('11:00');
  const [status, setStatus] = useState<FollowUpStatus>('Connected');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [commitmentAmount, setCommitmentAmount] = useState('');
  const [nextPaymentDate, setNextPaymentDate] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode | ''>('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedParty =
    parties.find((p) => p.customerCode === selectedCode) || null;

  useEffect(() => {
    if (!isOpen) return;
    const target = initialParty || parties[0] || null;
    if (target) {
      setSelectedCode(target.customerCode);
      setContactPerson(target.contactPerson);
      setContactNumber(target.mobileNumber);
    }
    const now = new Date();
    setFollowUpDate(getLocalTodayISO());
    setFollowUpTime(
      `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`
    );
    setStatus('Connected');
    setDiscussionNotes('');
    setCommitmentAmount('');
    setNextPaymentDate('');
    setNextFollowUpDate('');
    setPaymentMode('');
    setRemarks('');
    setError(null);
  }, [isOpen, initialParty, parties]);

  const handlePartyChange = (code: string) => {
    setSelectedCode(code);
    const p = parties.find((x) => x.customerCode === code);
    if (p) {
      setContactPerson(p.contactPerson);
      setContactNumber(p.mobileNumber);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedParty) {
      setError('Please select a customer party.');
      return;
    }

    const commitAmtNum = Number(commitmentAmount) || 0;
    if (status === 'Payment Promised' && (commitAmtNum <= 0 || !nextPaymentDate)) {
      setError(
        'When status is "Payment Promised", please enter both the Promised Commitment Amount and Next Payment Date.'
      );
      return;
    }
    if (commitAmtNum > 0 && !nextPaymentDate) {
      setError('Please specify the Next Payment Date for the committed amount.');
      return;
    }

    onSave({
      partyCode: selectedParty.customerCode,
      partyName: selectedParty.partyName,
      outstandingAtFollowUp: selectedParty.totalOutstanding,
      contactPerson: contactPerson.trim(),
      contactNumber: contactNumber.trim(),
      followUpDate,
      followUpTime,
      status,
      discussionNotes: discussionNotes.trim(),
      commitmentAmount: commitAmtNum,
      nextPaymentDate,
      nextFollowUpDate: nextFollowUpDate || nextPaymentDate,
      paymentMode,
      remarks: remarks.trim(),
      userId: currentUser.id,
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
            className="w-full max-w-2xl bg-white border border-[#EAE2D9] rounded-xl shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
          >
        <div className="px-6 py-4 border-b border-[#EAE2D9] flex items-center justify-between bg-[#1C1917] text-white">
          <div>
            <h3 className="text-base font-semibold">Log Payment Follow-up</h3>
            <p className="text-xs text-stone-300 mt-0.5">
              Commitments automatically schedule onto the Payment Commitment & Calendar tracker
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-300 hover:text-white p-1 rounded-md"
            aria-label="Close follow-up modal"
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
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Party Name (Auto-filled)
              </label>
              <PremiumSelect
                value={selectedCode}
                onChange={handlePartyChange}
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
                Outstanding Amount (Auto-filled)
              </label>
              <input
                type="text"
                readOnly
                value={
                  selectedParty
                    ? formatINR(selectedParty.totalOutstanding)
                    : '₹0'
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#EAE2D9] rounded-lg bg-[#FAF6F1] text-stone-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Contact Number
              </label>
              <input
                type="text"
                required
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Follow-up Date
              </label>
              <input
                type="date"
                required
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Follow-up Time
              </label>
              <input
                type="time"
                required
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Follow-up Status
              </label>
              <PremiumSelect
                value={status}
                onChange={(val) => setStatus(val as FollowUpStatus)}
                options={FOLLOW_UP_STATUS_OPTIONS.map((opt) => ({
                  value: opt,
                  label: opt,
                }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Discussion Notes
              </label>
              <textarea
                rows={2}
                required
                value={discussionNotes}
                onChange={(e) => setDiscussionNotes(e.target.value)}
                placeholder="Summary of call conversation, invoice references discussed, or customer feedback..."
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Commitment Amount (₹)
              </label>
              <input
                type="number"
                min={0}
                step={100}
                value={commitmentAmount}
                onChange={(e) => setCommitmentAmount(e.target.value)}
                placeholder="e.g. 200000"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Next Payment Date (Promised Date)
              </label>
              <input
                type="date"
                value={nextPaymentDate}
                onChange={(e) => setNextPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Next Follow-up Date
              </label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Payment Mode (if applicable)
              </label>
              <PremiumSelect
                value={paymentMode}
                onChange={(val) => setPaymentMode(val as PaymentMode | '')}
                searchable={false}
                options={[
                  { value: '', label: 'Not specified' },
                  ...PAYMENT_MODES.map((m) => ({ value: m, label: m })),
                ]}
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
                placeholder="Internal action items or escalation remarks"
                className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
            </div>
          </div>

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
              className="px-5 py-2 text-sm font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
            >
              Save Follow-up
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
