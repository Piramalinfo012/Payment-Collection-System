import React, { useMemo, useState } from 'react';
import { History, PhoneCall, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EnrichedParty, FollowUp, User } from '../../types';
import { buildPartyTimelineEntry } from '../../services/recoveryEngine';
import { formatDateDisplay, formatINR } from '../../utils/formatters';
import { EmptyState } from '../ui/CommonUI';
import { EASE_OUT_EXPO, MotionCard, SlidingTabs } from '../ui/MotionPrimitives';

interface CallHistoryViewProps {
  parties: EnrichedParty[];
  followUps: FollowUp[];
  users: User[];
  onSelectParty: (party: EnrichedParty) => void;
}

export function CallHistoryView({
  parties,
  followUps,
  users,
  onSelectParty,
}: CallHistoryViewProps) {
  const [viewMode, setViewMode] = useState<'party_summary' | 'timeline'>(
    'party_summary'
  );
  const [search, setSearch] = useState('');

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const partyMap = new Map(parties.map((p) => [p.customerCode, p]));

  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties
      .filter((p) => {
        if (!q) return true;
        return (
          p.partyName.toLowerCase().includes(q) ||
          p.customerCode.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.totalCalls - a.totalCalls);
  }, [parties, search]);

  const timelineEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...followUps]
      .filter((f) => {
        if (!q) return true;
        return (
          f.partyName.toLowerCase().includes(q) ||
          f.partyCode.toLowerCase().includes(q) ||
          f.discussionNotes.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        `${b.followUpDate} ${b.followUpTime}`.localeCompare(
          `${a.followUpDate} ${a.followUpTime}`
        )
      );
  }, [followUps, search]);

  return (
    <div className="space-y-4">
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            Party-wise Call History & Activity Timeline
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Automatically aggregated call counts, connection rates, commitments, and chronological interaction logs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SlidingTabs
            layoutId="call-history-mode"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { id: 'party_summary', label: 'Party Summary' },
              { id: 'timeline', label: 'Chronological Timeline' },
            ]}
          />

          <div className="relative w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter party or notes..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
            />
          </div>
        </div>
      </MotionCard>

      <AnimatePresence mode="wait">
        {viewMode === 'party_summary' ? (
          filteredParties.length === 0 ? (
            <EmptyState
              key="empty-summary"
              icon={History}
              title="No matching call history"
              description="Adjust your search query to view party call summaries."
            />
          ) : (
            <motion.div
              key="party_summary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
              className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden"
            >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                  <tr>
                    <th className="text-left px-3.5 py-3 font-semibold">Party</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Total Calls</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Successful</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Unanswered</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Last Call Date</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Last Called By</th>
                    <th className="text-left px-3.5 py-3 font-semibold">First Follow-up</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Next Follow-up</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Total Commitments</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Actual Recovery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECE3]">
                  {filteredParties.map((p) => (
                    <tr
                      key={p.customerCode}
                      onClick={() => onSelectParty(p)}
                      className="hover:bg-orange-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-stone-900">
                          {p.partyName}
                        </div>
                        <div className="text-[11px] font-mono text-stone-400">
                          {p.customerCode}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-stone-900">
                        {p.totalCalls}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {p.successfulCalls}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-red-700 font-medium">
                        {p.unansweredCalls}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-stone-700">
                        {formatDateDisplay(p.lastFollowUpDate)}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-stone-700">
                        {p.lastCalledBy || '—'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-stone-600">
                        {formatDateDisplay(p.firstFollowUpDate)}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-[#C2410C] font-medium">
                        {formatDateDisplay(p.nextFollowUpDate)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-stone-900">
                        {formatINR(p.totalCommitted)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatINR(p.totalRecovered)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )
      ) : timelineEntries.length === 0 ? (
        <EmptyState
          key="empty-timeline"
          icon={PhoneCall}
          title="No timeline activity recorded"
          description="Logged calls and follow-up interactions will appear here chronologically."
        />
      ) : (
        <motion.div
          key="timeline"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
          className="bg-white border border-[#EAE2D9] rounded-xl divide-y divide-[#F4ECE3]"
        >
          {timelineEntries.map((entry, idx) => {
            const party = partyMap.get(entry.partyCode);
            const officerName = userMap.get(entry.userId) || 'Officer';
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.2,
                  delay: Math.min(idx * 0.025, 0.25),
                  ease: EASE_OUT_EXPO,
                }}
                onClick={() => party && onSelectParty(party)}
                className="p-4 hover:bg-orange-50/40 cursor-pointer transition-colors flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 mt-0.5">
                    <PhoneCall className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-stone-500">
                      {entry.partyName} ({entry.partyCode})
                    </div>
                    <p className="text-sm font-semibold text-stone-900 mt-0.5">
                      {buildPartyTimelineEntry(entry, officerName)}
                    </p>
                    <p className="text-xs text-stone-600 mt-1">
                      {entry.discussionNotes}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-stone-400 whitespace-nowrap shrink-0">
                  {entry.followUpTime}
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
