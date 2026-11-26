import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Building2, Search } from 'lucide-react';
import { EnrichedParty, PartyPaymentStatus, User } from '../../types';
import { formatDateDisplay, formatINR } from '../../utils/formatters';
import { EmptyState, PaginationBar, StatusText } from '../ui/CommonUI';
import { AnimatedNumber, MotionCard } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface PartyListViewProps {
  title: string;
  subtitle: string;
  parties: EnrichedParty[];
  users: User[];
  isAdmin: boolean;
  onSelectParty: (party: EnrichedParty) => void;
}

const PAGE_SIZE = 10;

export function PartyListView({
  title,
  subtitle,
  parties,
  users,
  isAdmin,
  onSelectParty,
}: PartyListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [amountFilter, setAmountFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'outstanding' | 'overdue' | 'name'>('outstanding');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parties
      .filter((p) => {
        if (q) {
          const matchesName = p.partyName.toLowerCase().includes(q);
          const matchesCode = p.customerCode.toLowerCase().includes(q);
          const matchesContact = p.contactPerson.toLowerCase().includes(q);
          if (!matchesName && !matchesCode && !matchesContact) return false;
        }
        if (salespersonFilter !== 'ALL' && p.assignedUserId !== salespersonFilter) {
          return false;
        }
        if (statusFilter !== 'ALL' && p.paymentStatus !== statusFilter) {
          return false;
        }
        if (amountFilter === 'GT_5L' && p.totalOutstanding < 500000) return false;
        if (
          amountFilter === '1L_5L' &&
          (p.totalOutstanding < 100000 || p.totalOutstanding >= 500000)
        )
          return false;
        if (amountFilter === 'LT_1L' && p.totalOutstanding >= 100000) return false;
        if (amountFilter === 'OVERDUE_ONLY' && p.overdueAmount <= 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'outstanding') return b.totalOutstanding - a.totalOutstanding;
        if (sortBy === 'overdue') return b.overdueAmount - a.overdueAmount;
        return a.partyName.localeCompare(b.partyName);
      });
  }, [parties, searchQuery, salespersonFilter, statusFilter, amountFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalFilteredOutstanding = filtered.reduce(
    (s, p) => s + p.totalOutstanding,
    0
  );
  const totalFilteredOverdue = filtered.reduce((s, p) => s + p.overdueAmount, 0);

  const getTone = (status: PartyPaymentStatus) => {
    if (status === 'Settled') return 'success';
    if (status === 'Critical' || status === 'Disputed') return 'danger';
    if (status === 'Overdue') return 'warning';
    return 'info';
  };

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <div>
            <span className="text-stone-500 block">Filtered Parties</span>
            <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
              <AnimatedNumber
                value={filtered.length}
                formatter={(n) => Math.round(n).toString()}
              />
            </span>
          </div>
          <div>
            <span className="text-stone-500 block">Total Outstanding</span>
            <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
              <AnimatedNumber
                value={totalFilteredOutstanding}
                formatter={formatINR}
              />
            </span>
          </div>
          <div>
            <span className="text-stone-500 block">Total Overdue</span>
            <span className="font-mono font-bold text-red-700 text-sm tabular-nums">
              <AnimatedNumber
                value={totalFilteredOverdue}
                formatter={formatINR}
              />
            </span>
          </div>
        </div>
      </MotionCard>

      {/* Filter Bar */}
      <MotionCard delay={0.05} className="bg-white border border-[#EAE2D9] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Party Name or Customer Code..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
          />
        </div>

        {isAdmin && (
          <PremiumSelect
            ariaLabel="Filter by salesperson"
            value={salespersonFilter}
            onChange={(val) => {
              setSalespersonFilter(val);
              setPage(1);
            }}
            className="min-w-[170px]"
            searchPlaceholder="Search officer..."
            options={[
              { value: 'ALL', label: 'All Salespersons' },
              ...users
                .filter((u) => u.active)
                .map((u) => ({ value: u.id, label: u.name, subLabel: u.role })),
            ]}
          />
        )}

        <PremiumSelect
          ariaLabel="Filter by outstanding amount"
          value={amountFilter}
          onChange={(val) => {
            setAmountFilter(val);
            setPage(1);
          }}
          searchable={false}
          className="min-w-[155px]"
          options={[
            { value: 'ALL', label: 'All Amounts' },
            { value: 'GT_5L', label: 'Above ₹5,00,000' },
            { value: '1L_5L', label: '₹1,00,000 – ₹5,00,000' },
            { value: 'LT_1L', label: 'Below ₹1,00,000' },
            { value: 'OVERDUE_ONLY', label: 'Overdue Only' },
          ]}
        />

        <PremiumSelect
          ariaLabel="Filter by payment status"
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
          searchable={false}
          className="min-w-[140px]"
          options={[
            { value: 'ALL', label: 'All Statuses' },
            { value: 'Critical', label: 'Critical' },
            { value: 'Overdue', label: 'Overdue' },
            { value: 'Disputed', label: 'Disputed' },
            { value: 'Current', label: 'Current' },
            { value: 'Settled', label: 'Settled' },
          ]}
        />

        <button
          type="button"
          onClick={() =>
            setSortBy((prev) =>
              prev === 'outstanding'
                ? 'overdue'
                : prev === 'overdue'
                ? 'name'
                : 'outstanding'
            )
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#E2D8CE] rounded-lg bg-white hover:bg-[#FAF6F1] text-stone-700 whitespace-nowrap"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>
            Sort:{' '}
            {sortBy === 'outstanding'
              ? 'Highest Outstanding'
              : sortBy === 'overdue'
              ? 'Highest Overdue'
              : 'Party Name'}
          </span>
        </button>
      </MotionCard>

      {/* Table */}
      {paged.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No matching customer parties"
          description="Try clearing your search query or adjusting the salesperson and status filters."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery('');
            setSalespersonFilter('ALL');
            setStatusFilter('ALL');
            setAmountFilter('ALL');
          }}
        />
      ) : (
        <MotionCard delay={0.1} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                <tr>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Party Name
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Customer Code
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Contact Person
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Mobile Number
                  </th>
                  <th className="text-right px-3.5 py-3 font-semibold whitespace-nowrap">
                    Total Outstanding
                  </th>
                  <th className="text-right px-3.5 py-3 font-semibold whitespace-nowrap">
                    Overdue Amount
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Last Payment Date
                  </th>
                  <th className="text-right px-3.5 py-3 font-semibold whitespace-nowrap">
                    Last Payment Amt
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Last Follow-up
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Next Follow-up
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Assigned User
                  </th>
                  <th className="text-left px-3.5 py-3 font-semibold whitespace-nowrap">
                    Payment Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4ECE3]">
                {paged.map((party) => (
                  <tr
                    key={party.customerCode}
                    onClick={() => onSelectParty(party)}
                    className="hover:bg-orange-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3.5 py-3 font-semibold text-stone-900 min-w-[200px]">
                      <div className="truncate max-w-[240px]">
                        {party.partyName}
                      </div>
                      <div className="text-[11px] font-normal text-stone-400">
                        {party.city}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 font-mono text-stone-700 whitespace-nowrap">
                      {party.customerCode}
                    </td>
                    <td className="px-3.5 py-3 text-stone-700 whitespace-nowrap">
                      {party.contactPerson}
                    </td>
                    <td className="px-3.5 py-3 font-mono text-stone-600 whitespace-nowrap">
                      {party.mobileNumber || '—'}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums font-semibold text-stone-900 whitespace-nowrap">
                      {formatINR(party.totalOutstanding)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums font-medium text-red-700 whitespace-nowrap">
                      {formatINR(party.overdueAmount)}
                    </td>
                    <td className="px-3.5 py-3 text-stone-600 whitespace-nowrap">
                      {formatDateDisplay(party.lastPaymentDate)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                      {party.lastPaymentAmount > 0
                        ? formatINR(party.lastPaymentAmount)
                        : '—'}
                    </td>
                    <td className="px-3.5 py-3 text-stone-600 whitespace-nowrap">
                      {formatDateDisplay(party.lastFollowUpDate)}
                    </td>
                    <td className="px-3.5 py-3 text-[#C2410C] font-medium whitespace-nowrap">
                      {formatDateDisplay(party.nextFollowUpDate)}
                    </td>
                    <td className="px-3.5 py-3 text-stone-700 whitespace-nowrap">
                      {party.assignedUserName}
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <StatusText
                        label={party.paymentStatus}
                        tone={getTone(party.paymentStatus)}
                      />
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
