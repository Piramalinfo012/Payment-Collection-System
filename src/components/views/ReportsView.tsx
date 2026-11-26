import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import {
  DerivedCommitment,
  EnrichedParty,
  FollowUp,
  PaymentReceipt,
  User,
} from '../../types';
import {
  exportToExcel,
  exportToPDF,
  ExportColumn,
  printReport,
} from '../../services/exportService';
import {
  computeUserPerformanceRows,
} from '../../services/recoveryEngine';
import {
  formatDateDisplay,
  formatINR,
  isDateInRange,
  resolveDateRange,
} from '../../utils/formatters';
import { PremiumSelect } from '../ui/PremiumSelect';
import { EASE_OUT_EXPO, MotionCard, SlidingTabs } from '../ui/MotionPrimitives';

interface ReportsViewProps {
  parties: EnrichedParty[];
  payments: PaymentReceipt[];
  followUps: FollowUp[];
  commitments: DerivedCommitment[];
  users: User[];
  currentUser: User;
  todayISO: string;
}

type ReportType =
  | 'daily_collection'
  | 'monthly_collection'
  | 'employee_wise'
  | 'party_wise'
  | 'commitment'
  | 'call_activity';

const REPORT_TABS: Array<{ id: ReportType; label: string }> = [
  { id: 'daily_collection', label: 'A. Daily Collection' },
  { id: 'monthly_collection', label: 'B. Monthly Collection' },
  { id: 'employee_wise', label: 'C. Employee-wise' },
  { id: 'party_wise', label: 'D. Party-wise' },
  { id: 'commitment', label: 'E. Payment Commitment' },
  { id: 'call_activity', label: 'F. Call Activity' },
];

export function ReportsView({
  parties,
  payments,
  followUps,
  commitments,
  users,
  currentUser,
  todayISO,
}: ReportsViewProps) {
  const defaultMonthRange = resolveDateRange('this_month', todayISO);
  const [reportType, setReportType] = useState<ReportType>('daily_collection');
  const [startDate, setStartDate] = useState(defaultMonthRange.start);
  const [endDate, setEndDate] = useState(todayISO);
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [partyFilter, setPartyFilter] = useState('ALL');

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const partyOwnerMap = new Map(
    parties.map((p) => [p.customerCode, p.assignedUserId])
  );

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (!isDateInRange(p.receivedDate, startDate, endDate)) return false;
      if (partyFilter !== 'ALL' && p.partyCode !== partyFilter) return false;
      if (employeeFilter !== 'ALL') {
        const owner = partyOwnerMap.get(p.partyCode);
        if (p.recordedByUserId !== employeeFilter && owner !== employeeFilter) {
          return false;
        }
      }
      return true;
    });
  }, [payments, startDate, endDate, partyFilter, employeeFilter]);

  const totalFilteredCollected = useMemo(
    () => filteredPayments.reduce((s, p) => s + p.receivedAmount, 0),
    [filteredPayments]
  );

  const verifiedFilteredTotal = useMemo(
    () =>
      filteredPayments
        .filter((p) => p.source === 'Tally')
        .reduce((s, p) => s + p.receivedAmount, 0),
    [filteredPayments]
  );

  const unverifiedFilteredTotal = useMemo(
    () =>
      filteredPayments
        .filter((p) => p.source !== 'Tally')
        .reduce((s, p) => s + p.receivedAmount, 0),
    [filteredPayments]
  );

  const filteredFollowUps = useMemo(() => {
    return followUps.filter((f) => {
      if (!isDateInRange(f.followUpDate, startDate, endDate)) return false;
      if (partyFilter !== 'ALL' && f.partyCode !== partyFilter) return false;
      if (employeeFilter !== 'ALL' && f.userId !== employeeFilter) return false;
      return true;
    });
  }, [followUps, startDate, endDate, partyFilter, employeeFilter]);

  const reportPayload = useMemo((): {
    title: string;
    columns: ExportColumn[];
    rows: Array<Record<string, string | number>>;
  } => {
    switch (reportType) {
      case 'daily_collection': {
        const byDate = new Map<
          string,
          {
            amount: number;
            verifiedAmt: number;
            unverifiedAmt: number;
            parties: Set<string>;
            txCount: number;
            empTotals: Map<string, number>;
          }
        >();
        filteredPayments.forEach((p) => {
          const cur = byDate.get(p.receivedDate) || {
            amount: 0,
            verifiedAmt: 0,
            unverifiedAmt: 0,
            parties: new Set<string>(),
            txCount: 0,
            empTotals: new Map<string, number>(),
          };
          cur.amount += p.receivedAmount;
          if (p.source === 'Tally') {
            cur.verifiedAmt += p.receivedAmount;
          } else {
            cur.unverifiedAmt += p.receivedAmount;
          }
          cur.parties.add(p.partyCode);
          cur.txCount += 1;
          const empName = userMap.get(p.recordedByUserId) || 'Officer';
          cur.empTotals.set(
            empName,
            (cur.empTotals.get(empName) || 0) + p.receivedAmount
          );
          byDate.set(p.receivedDate, cur);
        });

        const rows = Array.from(byDate.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([date, info]) => {
            const tallyStatus =
              info.unverifiedAmt <= 0
                ? 'Tally Verified'
                : info.verifiedAmt <= 0
                ? 'Tally Unverified (Pending)'
                : `Partial (${formatINR(info.verifiedAmt)} Verified · ${formatINR(
                    info.unverifiedAmt
                  )} Unverified)`;
            return {
              date: formatDateDisplay(date),
              amountFormatted: formatINR(info.amount),
              partiesPaid: info.parties.size,
              transactions: info.txCount,
              tallyStatus,
              employeeBreakdown: Array.from(info.empTotals.entries())
                .map(([n, v]) => `${n.split(' ')[0]}: ${formatINR(v)}`)
                .join(' | '),
            };
          });

        return {
          title: 'Daily Collection Report',
          columns: [
            { header: 'Date', key: 'date' },
            { header: 'Total Amount Received', key: 'amountFormatted', align: 'right' },
            { header: 'Parties Paid', key: 'partiesPaid', align: 'right' },
            { header: 'Transactions', key: 'transactions', align: 'right' },
            { header: 'Tally Status', key: 'tallyStatus' },
            { header: 'Employee-wise Collection', key: 'employeeBreakdown' },
          ],
          rows,
        };
      }

      case 'monthly_collection': {
        const byMonth = new Map<string, number>();
        payments.forEach((p) => {
          if (partyFilter !== 'ALL' && p.partyCode !== partyFilter) return;
          if (
            employeeFilter !== 'ALL' &&
            p.recordedByUserId !== employeeFilter &&
            partyOwnerMap.get(p.partyCode) !== employeeFilter
          )
            return;
          const ym = p.receivedDate.slice(0, 7);
          byMonth.set(ym, (byMonth.get(ym) || 0) + p.receivedAmount);
        });
        const totalOut = parties.reduce((s, p) => s + p.totalOutstanding, 0);
        const sorted = Array.from(byMonth.entries()).sort(([a], [b]) =>
          a.localeCompare(b)
        );
        const rows = sorted.map(([ym, amt], idx) => {
          const prev = idx > 0 ? sorted[idx - 1][1] : 0;
          const growth = prev > 0 ? ((amt - prev) / prev) * 100 : 0;
          const [yr, mo] = ym.split('-').map(Number);
          const label = new Date(yr, mo - 1, 1).toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
          });
          return {
            month: label,
            monthlyRecovery: formatINR(amt),
            prevMonth: prev > 0 ? formatINR(prev) : '—',
            growth: prev > 0 ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%` : '—',
            totalOutstanding: formatINR(totalOut),
          };
        });

        return {
          title: 'Monthly Collection Report',
          columns: [
            { header: 'Month', key: 'month' },
            { header: 'Total Monthly Recovery', key: 'monthlyRecovery', align: 'right' },
            { header: 'Previous Month', key: 'prevMonth', align: 'right' },
            { header: 'Collection Growth', key: 'growth', align: 'right' },
            { header: 'Current Outstanding', key: 'totalOutstanding', align: 'right' },
          ],
          rows,
        };
      }

      case 'employee_wise': {
        const targetUsers =
          employeeFilter !== 'ALL'
            ? users.filter((u) => u.id === employeeFilter)
            : users;
        const perfRows = computeUserPerformanceRows(
          targetUsers,
          parties,
          payments,
          followUps,
          startDate,
          endDate,
          todayISO
        );
        return {
          title: 'Employee-wise Performance Report',
          columns: [
            { header: 'Employee Name', key: 'name' },
            { header: 'Total Calls', key: 'totalCalls', align: 'right' },
            { header: 'Follow-ups Completed', key: 'followUps', align: 'right' },
            { header: 'Payment Commitments', key: 'commitments', align: 'right' },
            { header: 'Actual Recovery', key: 'recovery', align: 'right' },
            { header: 'Recovery %', key: 'recoveryPct', align: 'right' },
          ],
          rows: perfRows.map((r) => ({
            name: r.user.name,
            totalCalls: r.totalCallsMade,
            followUps: r.followUpsCompleted,
            commitments: formatINR(r.commitmentsReceivedAmount),
            recovery: formatINR(r.totalAmountRecovered),
            recoveryPct: `${r.recoveryPercentage.toFixed(1)}%`,
          })),
        };
      }

      case 'party_wise': {
        const list = parties.filter((p) => {
          if (partyFilter !== 'ALL' && p.customerCode !== partyFilter) return false;
          if (employeeFilter !== 'ALL' && p.assignedUserId !== employeeFilter)
            return false;
          return true;
        });
        return {
          title: 'Party-wise Recovery Report',
          columns: [
            { header: 'Party Name', key: 'partyName' },
            { header: 'Opening Outstanding', key: 'opening', align: 'right' },
            { header: 'Payments Received', key: 'received', align: 'right' },
            { header: 'Closing Outstanding', key: 'closing', align: 'right' },
            { header: 'Calls', key: 'calls', align: 'right' },
            { header: 'Last Follow-up Date', key: 'lastFollowUp' },
          ],
          rows: list.map((p) => {
            const periodRec = filteredPayments
              .filter((pay) => pay.partyCode === p.customerCode)
              .reduce((s, pay) => s + pay.receivedAmount, 0);
            return {
              partyName: `${p.partyName} (${p.customerCode})`,
              opening: formatINR(p.openingOutstanding),
              received: formatINR(periodRec),
              closing: formatINR(p.totalOutstanding),
              calls: p.totalCalls,
              lastFollowUp: formatDateDisplay(p.lastFollowUpDate),
            };
          }),
        };
      }

      case 'commitment': {
        const list = commitments.filter((c) => {
          if (!isDateInRange(c.promisedDate, startDate, endDate) && c.status !== 'Overdue')
            return false;
          if (partyFilter !== 'ALL' && c.partyCode !== partyFilter) return false;
          if (employeeFilter !== 'ALL' && c.userId !== employeeFilter) return false;
          return true;
        });
        return {
          title: 'Payment Commitment Report',
          columns: [
            { header: 'Party Name', key: 'partyName' },
            { header: 'Promised Amount', key: 'promisedAmount', align: 'right' },
            { header: 'Promised Date', key: 'promisedDate' },
            { header: 'Actual Received', key: 'actualReceived', align: 'right' },
            { header: 'Commitment Status', key: 'status' },
            { header: 'Follow-up Employee', key: 'employee' },
          ],
          rows: list.map((c) => ({
            partyName: c.partyName,
            promisedAmount: formatINR(c.promisedAmount),
            promisedDate: formatDateDisplay(c.promisedDate),
            actualReceived: formatINR(c.actualReceived),
            status: c.status,
            employee: userMap.get(c.userId) || c.userId,
          })),
        };
      }

      case 'call_activity':
      default: {
        const countByKey = new Map<string, number>();
        filteredFollowUps.forEach((f) => {
          const k = `${f.userId}__${f.partyCode}`;
          countByKey.set(k, (countByKey.get(k) || 0) + 1);
        });
        return {
          title: 'Call Activity Report',
          columns: [
            { header: 'Employee', key: 'employee' },
            { header: 'Party', key: 'party' },
            { header: 'Call Date', key: 'callDate' },
            { header: 'Call Status', key: 'callStatus' },
            { header: 'Call Count', key: 'callCount', align: 'right' },
            { header: 'Remarks', key: 'remarks' },
          ],
          rows: filteredFollowUps.map((f) => ({
            employee: userMap.get(f.userId) || f.userId,
            party: f.partyName,
            callDate: `${formatDateDisplay(f.followUpDate)} ${f.followUpTime}`,
            callStatus: f.status,
            callCount: countByKey.get(`${f.userId}__${f.partyCode}`) || 1,
            remarks: f.remarks || f.discussionNotes,
          })),
        };
      }
    }
  }, [
    reportType,
    filteredPayments,
    filteredFollowUps,
    payments,
    parties,
    followUps,
    commitments,
    users,
    startDate,
    endDate,
    employeeFilter,
    partyFilter,
    todayISO,
  ]);

  const handleExcel = () => {
    exportToExcel(
      `piramal_${reportType}_${startDate}_to_${endDate}`,
      reportPayload.title,
      reportPayload.columns,
      reportPayload.rows
    );
  };

  const handlePDF = () => {
    exportToPDF(
      `piramal_${reportType}_${startDate}_to_${endDate}`,
      reportPayload.title,
      `Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(
        endDate
      )} · Generated by ${currentUser.name}`,
      reportPayload.columns,
      reportPayload.rows
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Exports */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 no-print">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            Reports & Analytics Center
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Export audited financial collection, commitment, and call reports to Excel, PDF, or Print
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={handleExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={handlePDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={printReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-[#FAF6F1] border border-[#E2D8CE] rounded-lg whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </motion.button>
        </div>
      </MotionCard>

      {/* Report Selector Tabs & Filters */}
      <MotionCard delay={0.05} className="bg-white border border-[#EAE2D9] rounded-xl p-4 space-y-4 no-print">
        <SlidingTabs
          layoutId="reports-tab"
          value={reportType}
          onChange={setReportType}
          options={REPORT_TABS}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-stone-500">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-[#E2D8CE] rounded-lg bg-white focus:outline-none focus:border-[#EA580C]"
            />
            <span className="text-stone-500">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-[#E2D8CE] rounded-lg bg-white focus:outline-none focus:border-[#EA580C]"
            />
          </div>

          {currentUser.role === 'Admin' && (
            <PremiumSelect
              ariaLabel="Filter report by employee"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              className="min-w-[165px]"
              options={[
                { value: 'ALL', label: 'All Employees' },
                ...users.map((u) => ({ value: u.id, label: u.name, subLabel: u.role })),
              ]}
            />
          )}

          <PremiumSelect
            ariaLabel="Filter report by party"
            value={partyFilter}
            onChange={setPartyFilter}
            className="min-w-[220px]"
            searchPlaceholder="Search party..."
            options={[
              { value: 'ALL', label: 'All Parties' },
              ...parties.map((p) => ({
                value: p.customerCode,
                label: p.partyName,
                subLabel: p.customerCode,
              })),
            ]}
          />
        </div>
      </MotionCard>

      {/* Report Table */}
      <MotionCard delay={0.1} className="bg-white border border-[#EAE2D9] rounded-2xl overflow-hidden shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]">
        <div className="px-5 py-4 border-b border-[#EAE2D9] bg-gradient-to-r from-white to-[#FAF6F1]/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900">
              {reportPayload.title}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Piramal Petroleum Pvt. Ltd. · {formatDateDisplay(startDate)} to{' '}
              {formatDateDisplay(endDate)} ·{' '}
              <span className="font-semibold text-[#C2410C]">
                {reportPayload.rows.length} row(s)
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {unverifiedFilteredTotal > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs flex items-center gap-1.5">
                <span className="text-amber-800 font-medium">Tally Unverified:</span>
                <span className="font-mono font-bold text-amber-800 tabular-nums">
                  {formatINR(unverifiedFilteredTotal)}
                </span>
              </div>
            )}
            {verifiedFilteredTotal > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs flex items-center gap-1.5">
                <span className="text-blue-800 font-medium">Tally Verified:</span>
                <span className="font-mono font-bold text-blue-700 tabular-nums">
                  {formatINR(verifiedFilteredTotal)}
                </span>
              </div>
            )}
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center gap-2">
              <span className="text-emerald-800 font-medium">Total Collected:</span>
              <span className="font-mono font-bold text-emerald-700 tabular-nums">
                {formatINR(totalFilteredCollected)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleExcel}
              disabled={reportPayload.rows.length === 0}
              title="Download Excel (.xlsx)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white hover:bg-orange-50 hover:text-[#C2410C] border border-[#E2D8CE] rounded-xl transition-colors disabled:opacity-50 no-print"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
              <tr>
                {reportPayload.columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-semibold whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECE3]">
              {reportPayload.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={reportPayload.columns.length}
                    className="px-4 py-10 text-center text-stone-500"
                  >
                    No records found in the selected date range and filter criteria.
                  </td>
                </tr>
              ) : (
                reportPayload.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-orange-50/45 transition-colors">
                    {reportPayload.columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 ${
                          col.align === 'right'
                            ? 'text-right font-mono tabular-nums font-medium text-stone-900 whitespace-nowrap'
                            : 'text-stone-700'
                        }`}
                      >
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </MotionCard>
    </div>
  );
}
