import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, CheckCircle2, PhoneCall, Target } from 'lucide-react';
import { FollowUp, Party, PaymentReceipt, User } from '../../types';
import { computeUserPerformanceRows } from '../../services/recoveryEngine';
import {
  addDaysISO,
  formatINR,
  formatINRCompact,
  resolveDateRange,
} from '../../utils/formatters';
import {
  AnimatedNumber,
  MotionCard,
  SlidingTabs,
} from '../ui/MotionPrimitives';

interface UserPerformanceViewProps {
  users: User[];
  parties: Party[];
  payments: PaymentReceipt[];
  followUps: FollowUp[];
  currentUser: User;
  todayISO: string;
}

export function UserPerformanceView({
  users,
  parties,
  payments,
  followUps,
  currentUser,
  todayISO,
}: UserPerformanceViewProps) {
  const [period, setPeriod] = useState<'today' | 'weekly' | 'monthly'>('monthly');

  const { start, end, label } = useMemo(() => {
    if (period === 'today') {
      return { start: todayISO, end: todayISO, label: 'Today' };
    }
    if (period === 'weekly') {
      return { start: addDaysISO(todayISO, -6), end: todayISO, label: 'Last 7 Days' };
    }
    const r = resolveDateRange('this_month', todayISO);
    return { start: r.start, end: r.end, label: 'This Month' };
  }, [period, todayISO]);

  const rows = useMemo(() => {
    const scopeUsers =
      currentUser.role === 'Admin'
        ? users.filter((u) => u.active)
        : users.filter((u) => u.id === currentUser.id);
    return computeUserPerformanceRows(
      scopeUsers,
      parties,
      payments,
      followUps,
      start,
      end,
      todayISO
    );
  }, [users, parties, payments, followUps, currentUser, start, end, todayISO]);

  const personal =
    rows.find((r) => r.user.id === currentUser.id) || rows[0] || null;

  const chartData = rows.map((r) => ({
    name: r.user.name.split(' ')[0],
    Recovered: r.totalAmountRecovered,
    Target: r.user.monthlyTarget,
    Calls: r.totalCallsMade,
    Connected: r.successfulCalls,
  }));

  return (
    <div className="space-y-6">
      {/* Period Switcher */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            {currentUser.role === 'Admin'
              ? 'Employee Recovery & Call Performance'
              : 'My Personal Performance Scorecard'}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Period: {label} ({start} to {end})
          </p>
        </div>

        <SlidingTabs
          layoutId="perf-period"
          value={period}
          onChange={setPeriod}
          options={[
            { id: 'today', label: 'Date-wise (Today)' },
            { id: 'weekly', label: 'Weekly (7 Days)' },
            { id: 'monthly', label: 'Monthly' },
          ]}
        />
      </MotionCard>

      {/* Personal Dashboard Cards */}
      {personal && (
        <MotionCard delay={0.05} className="bg-white border border-[#EAE2D9] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Personal Dashboard · {personal.user.name}
              </h3>
              <p className="text-xs text-stone-500">
                {personal.user.designation} · Monthly Target:{' '}
                {formatINR(personal.user.monthlyTarget)}
              </p>
            </div>
            <Award className="w-5 h-5 text-[#EA580C]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-[#FAF6F1] border border-[#EAE2D9]">
              <span className="text-[11px] text-stone-500">Assigned Parties</span>
              <p className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                <AnimatedNumber
                  value={personal.assignedParties}
                  formatter={(n) => Math.round(n).toString()}
                />
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF6F1] border border-[#EAE2D9]">
              <span className="text-[11px] text-stone-500">
                Outstanding Assigned
              </span>
              <p className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                <AnimatedNumber
                  value={personal.totalOutstandingAssigned}
                  formatter={formatINRCompact}
                />
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF6F1] border border-[#EAE2D9]">
              <span className="text-[11px] text-stone-500">
                Calls (Success / Missed)
              </span>
              <p className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                <AnimatedNumber
                  value={personal.totalCallsMade}
                  formatter={(n) => Math.round(n).toString()}
                />{' '}
                <span className="text-xs font-normal text-stone-500">
                  ({personal.successfulCalls}/{personal.unansweredCalls})
                </span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[#FAF6F1] border border-[#EAE2D9]">
              <span className="text-[11px] text-stone-500">
                Commitments Received
              </span>
              <p className="text-lg font-bold font-mono tabular-nums text-[#C2410C] mt-0.5">
                <AnimatedNumber
                  value={personal.commitmentsReceivedAmount}
                  formatter={formatINRCompact}
                />
              </p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] text-emerald-700">
                Amount Recovered ({personal.recoveryPercentage.toFixed(1)}%)
              </span>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-800 mt-0.5">
                <AnimatedNumber
                  value={personal.totalAmountRecovered}
                  formatter={formatINRCompact}
                />
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Follow-ups Completed:{' '}
                <strong className="font-mono text-stone-900">
                  {personal.followUpsCompleted}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-[#EA580C]" />
              <span>
                Upcoming Follow-ups:{' '}
                <strong className="font-mono text-stone-900">
                  {personal.upcomingFollowUps}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600" />
              <span>
                Commitment Fulfilment:{' '}
                <strong className="font-mono text-stone-900">
                  {personal.commitmentFulfilmentPct.toFixed(0)}%
                </strong>
              </span>
            </div>
          </div>
        </MotionCard>
      )}

      {/* Admin Comparison Matrix & Chart */}
      {currentUser.role === 'Admin' && (
        <>
          <MotionCard delay={0.1} className="bg-white border border-[#EAE2D9] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-stone-900 mb-4">
              Team Recovery Comparison
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAE2D9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} />
                  <YAxis
                    tickFormatter={(v) => formatINRCompact(Number(v))}
                    tick={{ fontSize: 11, fill: '#78716C' }}
                    width={72}
                  />
                  <Tooltip formatter={(value) => formatINR(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="Recovered"
                    fill="#15803D"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={650}
                  />
                  <Bar
                    dataKey="Target"
                    fill="#E7DED4"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={650}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </MotionCard>

          <MotionCard delay={0.15} className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#EAE2D9]">
              <h3 className="text-sm font-semibold text-stone-900">
                Officer-by-Officer Performance Comparison
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
                  <tr>
                    <th className="text-left px-3.5 py-3 font-semibold">Employee</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Parties</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Assigned Out.</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Calls</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Connected</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Follow-ups</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Commitments</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Fulfilment %</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Actual Recovery</th>
                    <th className="text-right px-3.5 py-3 font-semibold">Recovery %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4ECE3]">
                  {rows.map((r) => (
                    <tr key={r.user.id} className="hover:bg-orange-50/45 transition-colors">
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-stone-900">
                          {r.user.name}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {r.user.role}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {r.assignedParties}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {formatINR(r.totalOutstandingAssigned)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {r.totalCallsMade}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-[#C2410C]">
                        {r.successfulCalls}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {r.followUpsCompleted}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {formatINR(r.commitmentsReceivedAmount)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums">
                        {r.commitmentFulfilmentPct.toFixed(0)}%
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatINR(r.totalAmountRecovered)}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-semibold">
                        {r.recoveryPercentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MotionCard>
        </>
      )}
    </div>
  );
}
