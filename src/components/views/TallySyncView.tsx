import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  FileUp,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  IntegrationConfig,
  Party,
  PaymentReceipt,
  TallySyncLog,
  User,
} from '../../types';
import { parseTallyExportFile } from '../../services/googleSheetsService';
import { reconcileTallySync, TallyDiffResult } from '../../services/recoveryEngine';
import { formatDateTimeDisplay } from '../../utils/formatters';
import { StatusText } from '../ui/CommonUI';
import {
  AnimatedNumber,
  EASE_OUT_EXPO,
  MotionCard,
} from '../ui/MotionPrimitives';

interface TallySyncViewProps {
  syncLogs: TallySyncLog[];
  parties: Party[];
  payments: PaymentReceipt[];
  users: User[];
  currentUser: User;
  integration: IntegrationConfig;
  isSyncing: boolean;
  onSyncFromConnectedSource: () => Promise<void>;
  onApplyTallyDiff: (diff: TallyDiffResult) => void;
  onOpenSettings: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export function TallySyncView({
  syncLogs,
  parties,
  payments,
  users,
  currentUser,
  integration,
  isSyncing,
  onSyncFromConnectedSource,
  onApplyTallyDiff,
  onOpenSettings,
  onNotify,
}: TallySyncViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewDiff, setPreviewDiff] = useState<TallyDiffResult | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  const latestSync = syncLogs[0] || null;
  const defaultAssignee =
    users.find((u) => u.active && u.role === 'Collection User')?.id ||
    currentUser.id;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    try {
      const parsed = await parseTallyExportFile(file);
      if (parsed.parties.length === 0 && parsed.receipts.length === 0) {
        onNotify(
          'error',
          'No Tally records detected',
          'Ensure the file contains columns such as Party Name, Customer Code, and Total Outstanding or Payment Received Amount.'
        );
        return;
      }
      const diff = reconcileTallySync(
        parties,
        payments,
        parsed.parties,
        parsed.receipts,
        currentUser.name,
        currentUser.id,
        defaultAssignee,
        'Tally Export File'
      );
      setPreviewDiff(diff);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to parse file';
      onNotify('error', 'Tally file import failed', msg);
    } finally {
      setParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmApply = () => {
    if (!previewDiff) return;
    onApplyTallyDiff(previewDiff);
    setPreviewDiff(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            Tally Data Import & Google Sheet Synchronization
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Updates outstanding balances from Tally daily exports while strictly preserving follow-up history, payment receipts, and employee assignments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            disabled={parsingFile}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-stone-800 bg-white hover:bg-[#FAF6F1] border border-[#E2D8CE] rounded-lg whitespace-nowrap"
          >
            <FileUp className="w-4 h-4" />
            <span>{parsingFile ? 'Analyzing Tally File...' : 'Upload Tally Export (.xlsx/.csv)'}</span>
          </motion.button>

          {integration.mode === 'sandbox' ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg whitespace-nowrap"
            >
              <Database className="w-4 h-4" />
              <span>Connect Google Sheet / Apps Script</span>
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
              disabled={isSyncing}
              onClick={onSyncFromConnectedSource}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Sheet...' : 'Sync Now from Sheet'}</span>
            </motion.button>
          )}
        </div>
      </MotionCard>

      {/* Latest Sync Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MotionCard delay={0.04} className="bg-white border border-[#EAE2D9] rounded-xl p-4 col-span-2 sm:col-span-1 lg:col-span-2">
          <span className="text-xs text-stone-500">Last Data Sync Date & Time</span>
          <p className="mt-1 text-sm font-semibold text-stone-900">
            {formatDateTimeDisplay(latestSync?.syncedAt)}
          </p>
          <p className="text-[11px] text-stone-500 mt-1 truncate">
            Source: {latestSync?.sourceType || '—'}
          </p>
        </MotionCard>
        <MotionCard delay={0.07} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Records Imported</span>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber
              value={latestSync?.totalRecords ?? 0}
              formatter={(n) => Math.round(n).toString()}
            />
          </p>
        </MotionCard>
        <MotionCard delay={0.1} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">New Parties</span>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-[#C2410C]">
            <AnimatedNumber
              value={latestSync?.newParties ?? 0}
              formatter={(n) => Math.round(n).toString()}
            />
          </p>
        </MotionCard>
        <MotionCard delay={0.13} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Updated Parties</span>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-stone-900">
            <AnimatedNumber
              value={latestSync?.updatedParties ?? 0}
              formatter={(n) => Math.round(n).toString()}
            />
          </p>
        </MotionCard>
        <MotionCard delay={0.16} className="bg-white border border-[#EAE2D9] rounded-xl p-4">
          <span className="text-xs text-stone-500">Removed / Inactive</span>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-700">
            <AnimatedNumber
              value={latestSync?.removedParties ?? 0}
              formatter={(n) => Math.round(n).toString()}
            />
          </p>
        </MotionCard>
      </div>

      {/* Data Integrity Guarantee Banner */}
      <MotionCard delay={0.18} className="bg-[#FAF6F1] border border-[#EAE2D9] rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-[#EA580C] shrink-0 mt-0.5" />
        <div className="text-xs text-stone-700 leading-relaxed">
          <strong className="text-stone-900">Non-Destructive Tally Sync Rules Active:</strong>{' '}
          Parties are matched strictly by Customer Code / Ledger ID. Existing follow-up histories, future commitments, employee party assignments, and prior receipt entries are preserved. Duplicate Tally receipt vouchers (by Voucher Ref or UTR) are automatically skipped.
        </div>
      </MotionCard>

      {/* Tally Diff Preview before committing */}
      <AnimatePresence>
        {previewDiff && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="bg-white border-2 border-[#EA580C] rounded-xl p-5 space-y-4"
          >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Tally Export Reconciliation Preview
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Review changes before updating active ledger balances
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewDiff(null)}
                className="px-3.5 py-1.5 text-xs font-medium border border-[#E2D8CE] rounded-lg text-stone-700 hover:bg-[#FAF6F1]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Tally Sync</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 bg-[#FAF6F1] rounded-lg border border-[#EAE2D9]">
              <span className="text-stone-500 block">New Parties</span>
              <span className="font-mono font-bold text-[#C2410C] text-base">
                +{previewDiff.newParties.length}
              </span>
            </div>
            <div className="p-3 bg-[#FAF6F1] rounded-lg border border-[#EAE2D9]">
              <span className="text-stone-500 block">Updated Balances</span>
              <span className="font-mono font-bold text-stone-900 text-base">
                {previewDiff.updatedPartiesCount}
              </span>
            </div>
            <div className="p-3 bg-[#FAF6F1] rounded-lg border border-[#EAE2D9]">
              <span className="text-stone-500 block">Marked Inactive</span>
              <span className="font-mono font-bold text-amber-700 text-base">
                {previewDiff.inactiveMarkedCount}
              </span>
            </div>
            <div className="p-3 bg-[#FAF6F1] rounded-lg border border-[#EAE2D9]">
              <span className="text-stone-500 block">New Tally Receipts</span>
              <span className="font-mono font-bold text-emerald-700 text-base">
                +{previewDiff.newReceipts.length}
              </span>
            </div>
            <div className="p-3 bg-[#FAF6F1] rounded-lg border border-[#EAE2D9]">
              <span className="text-stone-500 block">Duplicates Skipped</span>
              <span className="font-mono font-bold text-stone-600 text-base">
                {previewDiff.duplicateReceiptsSkipped}
              </span>
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import History Table */}
      <MotionCard delay={0.2} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#EAE2D9]">
          <h3 className="text-sm font-semibold text-stone-900">Import History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Sync Date & Time</th>
                <th className="text-left px-4 py-3 font-semibold">Source</th>
                <th className="text-left px-4 py-3 font-semibold">Synced By</th>
                <th className="text-right px-4 py-3 font-semibold">Records</th>
                <th className="text-right px-4 py-3 font-semibold">New</th>
                <th className="text-right px-4 py-3 font-semibold">Updated</th>
                <th className="text-right px-4 py-3 font-semibold">Receipts</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECE3]">
              {syncLogs.map((log) => (
                <tr key={log.id} className="hover:bg-orange-50/45 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-stone-900">
                    {formatDateTimeDisplay(log.syncedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                    {log.sourceType}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-700">
                    {log.syncedBy}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {log.totalRecords}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#C2410C]">
                    {log.newParties}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {log.updatedParties}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {log.receiptsImported}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusText
                      label={log.status}
                      tone={
                        log.status === 'Success'
                          ? 'success'
                          : log.status === 'Partial'
                          ? 'warning'
                          : 'danger'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-stone-600 max-w-xs">
                    {log.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MotionCard>
    </div>
  );
}
