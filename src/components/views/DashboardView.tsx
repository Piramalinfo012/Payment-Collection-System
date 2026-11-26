import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  IndianRupee,
  Percent,
  PhoneCall,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DateFilterPreset,
  EnrichedParty,
  NavSection,
  User,
} from '../../types';
import { DashboardMetrics } from '../../services/recoveryEngine';
import { formatINR, formatINRCompact, resolveDateRange } from '../../utils/formatters';
import {
  AnimatedNumber,
  EASE_OUT_EXPO,
  MotionCard,
  SlidingTabs,
} from '../ui/MotionPrimitives';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  dateFilter: DateFilterPreset;
  setDateFilter: (preset: DateFilterPreset) => void;
  customStart: string;
  customEnd: string;
  setCustomStart: (v: string) => void;
  setCustomEnd: (v: string) => void;
  todayISO: string;
  currentUser: User;
  parties: EnrichedParty[];
  onNavigate: (section: NavSection) => void;
  onSelectParty: (party: EnrichedParty) => void;
}

const FILTER_OPTIONS: Array<{ id: DateFilterPreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'previous_month', label: 'Prev. Month' },
  { id: 'custom', label: 'Custom Range' },
];

export function DashboardView({
  metrics,
  dateFilter,
  setDateFilter,
  customStart,
  customEnd,
  setCustomStart,
  setCustomEnd,
  todayISO,
  currentUser,
  parties,
  onNavigate,
  onSelectParty,
}: DashboardViewProps) {
  const activeRange = resolveDateRange(dateFilter, todayISO, customStart, customEnd);

  const kpiCards: Array<{
    title: string;
    valueNode: React.ReactNode;
    comparisonLabel: string;
    deltaPct?: number;
    positiveIsGood?: boolean;
    icon: React.ElementType;
    accentClass: string;
    targetSection: NavSection;
  }> = [
    {
      title: 'Total Outstanding Amount',
      valueNode: (
        <AnimatedNumber value={metrics.totalOutstanding} formatter={formatINR} />
      ),
      comparisonLabel: `${metrics.totalActivePartiesCount} active ledger accounts`,
      icon: Wallet,
      accentClass: 'text-[#C2410C] bg-orange-50',
      targetSection:
        currentUser.role === 'Admin' ? 'all_parties' : 'my_outstanding',
    },
    {
      title: `Collected (${activeRange.label})`,
      valueNode: (
        <AnimatedNumber
          value={metrics.totalCollectedPeriod}
          formatter={formatINR}
        />
      ),
      comparisonLabel: `vs ${formatINRCompact(metrics.prevPeriodCollected)} prev. month`,
      deltaPct: metrics.collectionGrowthPct,
      positiveIsGood: true,
      icon: IndianRupee,
      accentClass: 'text-emerald-700 bg-emerald-50',
      targetSection: 'payment_recovery',
    },
    {
      title: "Today's Collection",
      valueNode: (
        <AnimatedNumber value={metrics.todaysCollection} formatter={formatINR} />
      ),
      comparisonLabel: `vs ${formatINRCompact(metrics.yesterdayCollection)} yesterday`,
      deltaPct: metrics.todaysGrowthPct,
      positiveIsGood: true,
      icon: TrendingUp,
      accentClass: 'text-[#EA580C] bg-orange-50',
      targetSection: 'payment_recovery',
    },
    {
      title: 'Total Overdue Amount',
      valueNode: (
        <AnimatedNumber value={metrics.totalOverdue} formatter={formatINR} />
      ),
      comparisonLabel: `${metrics.overdueSharePct.toFixed(1)}% of total outstanding`,
      icon: AlertTriangle,
      accentClass: 'text-red-700 bg-red-50',
      targetSection:
        currentUser.role === 'Admin' ? 'all_parties' : 'my_outstanding',
    },
    {
      title: 'Outstanding Parties',
      valueNode: (
        <AnimatedNumber
          value={metrics.outstandingPartiesCount}
          formatter={(n) => String(Math.round(n))}
        />
      ),
      comparisonLabel: `of ${metrics.totalActivePartiesCount} active accounts`,
      icon: Building2,
      accentClass: 'text-stone-700 bg-[#F3ECE4]',
      targetSection:
        currentUser.role === 'Admin' ? 'all_parties' : 'my_outstanding',
    },
    {
      title: "Today's Follow-ups",
      valueNode: (
        <AnimatedNumber
          value={metrics.todaysFollowUpsCount}
          formatter={(n) => String(Math.round(n))}
        />
      ),
      comparisonLabel: 'Logged & scheduled calls for today',
      icon: PhoneCall,
      accentClass: 'text-[#EA580C] bg-orange-50',
      targetSection: 'follow_ups',
    },
    {
      title: 'Upcoming Commitments',
      valueNode: (
        <>
          <AnimatedNumber
            value={metrics.upcomingCommitmentsCount}
            formatter={(n) => String(Math.round(n))}
          />{' '}
          ·{' '}
          <AnimatedNumber
            value={metrics.upcomingCommitmentsAmount}
            formatter={formatINRCompact}
          />
        </>
      ),
      comparisonLabel:
        metrics.overdueCommitmentsCount > 0
          ? `${metrics.overdueCommitmentsCount} overdue commitment(s)`
          : 'All commitments on schedule',
      icon: CalendarCheck,
      accentClass:
        metrics.overdueCommitmentsCount > 0
          ? 'text-amber-700 bg-amber-50'
          : 'text-emerald-700 bg-emerald-50',
      targetSection: 'follow_ups',
    },
    {
      title: 'Recovery Percentage',
      valueNode: (
        <AnimatedNumber
          value={metrics.recoveryPercentage}
          formatter={(n) => `${n.toFixed(1)}%`}
        />
      ),
      comparisonLabel: `vs ${metrics.prevMonthRecoveryPercentage.toFixed(
        1
      )}% prev. month`,
      deltaPct:
        metrics.recoveryPercentage - metrics.prevMonthRecoveryPercentage,
      positiveIsGood: true,
      icon: Percent,
      accentClass: 'text-emerald-700 bg-emerald-50',
      targetSection: 'reports',
    },
  ];

  const handleBarPartyClick = (code?: string) => {
    if (!code) return;
    const found = parties.find((p) => p.customerCode === code);
    if (found) onSelectParty(found);
  };

  return (
    <div className="space-y-6">
      {/* Executive Header & Date Filter Toolbar */}
      <MotionCard className="bg-gradient-to-r from-white via-[#FFFBF7] to-orange-50/50 border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_6px_24px_-16px_rgba(28,25,23,0.12)] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200/80 text-[11px] font-semibold text-[#C2410C] mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] animate-pulse" />
            <span>Executive Collection Overview</span>
          </div>
          <h2 className="text-lg font-bold text-stone-900 tracking-tight">
            Receivables &amp; Recovery Command Center
          </h2>
          <p className="text-xs text-stone-500 mt-0.5 truncate">
            {currentUser.role === 'Admin'
              ? 'Company-wide receivables & recovery figures computed from actual receipts'
              : `Scoped to parties assigned to ${currentUser.name}`}
            {' · '}
            <span className="font-mono text-stone-700 font-medium">
              {activeRange.start.split('-').reverse().join('-')} to{' '}
              {activeRange.end.split('-').reverse().join('-')}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <SlidingTabs
            layoutId="dashboard-date-filter"
            options={FILTER_OPTIONS}
            value={dateFilter}
            onChange={setDateFilter}
          />

          <AnimatePresence>
            {dateFilter === 'custom' && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                className="flex items-center gap-2"
              >
                <input
                  type="date"
                  aria-label="Start date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-[#E2D8CE] rounded-xl bg-white focus:outline-none focus:border-[#EA580C]"
                />
                <span className="text-xs text-stone-400">to</span>
                <input
                  type="date"
                  aria-label="End date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-[#E2D8CE] rounded-xl bg-white focus:outline-none focus:border-[#EA580C]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </MotionCard>

      {/* 8 KPI Cards with modern elevated surface & pill deltas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          const hasDelta =
            typeof card.deltaPct === 'number' && Number.isFinite(card.deltaPct);
          const isPositive = (card.deltaPct ?? 0) >= 0;
          const deltaGood = card.positiveIsGood ? isPositive : !isPositive;

          return (
            <motion.button
              key={card.title}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.28,
                delay: idx * 0.04,
                ease: EASE_OUT_EXPO,
              }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onNavigate(card.targetSection)}
              className="relative overflow-hidden text-left bg-white border border-[#EAE2D9]/90 hover:border-orange-300 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.12)] hover:shadow-[0_14px_28px_-16px_rgba(234,88,12,0.35)] rounded-2xl p-5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold text-stone-500 tracking-wide">
                  {card.title}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-110 ${card.accentClass}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3 text-2xl font-bold font-mono tabular-nums text-stone-900 tracking-tight">
                {card.valueNode}
              </div>

              <div className="mt-3 pt-2.5 border-t border-[#F4ECE3] flex items-center justify-between gap-2 text-xs">
                <span className="text-stone-500 truncate">
                  {card.comparisonLabel}
                </span>
                {hasDelta && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold shrink-0 ${
                      deltaGood
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {Math.abs(card.deltaPct!).toFixed(1)}%
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 6 Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Monthly Collection Trend */}
        <MotionCard
          delay={0.14}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Monthly Collection Trend
              </h3>
              <p className="text-xs text-stone-500">
                Actual payment receipts aggregated by month
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-[#C2410C] text-[11px] font-semibold">
              Receipts
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.monthlyTrendData}>
                <defs>
                  <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EA580C" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#EA580C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1EAE1" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  width={82}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #EAE2D9',
                    boxShadow: '0 10px 25px -10px rgba(0,0,0,0.15)',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [formatINR(Number(value)), 'Collected']}
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  stroke="#EA580C"
                  strokeWidth={2.5}
                  fill="url(#colGrad)"
                  isAnimationActive={true}
                  animationDuration={650}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>

        {/* 2. Day-wise Payment Recovery */}
        <MotionCard
          delay={0.18}
          className="bg-white border border-[#EAE2D9] rounded-2xl p-5 shadow-[0_4px_20px_-14px_rgba(28,25,23,0.1)]"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Day-wise Payment Recovery
              </h3>
              <p className="text-xs text-stone-500">
                Daily actual collections received across receipt dates
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
              Daily
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.dayWiseRecoveryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1EAE1" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716C' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  width={82}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #EAE2D9',
                    boxShadow: '0 10px 25px -10px rgba(0,0,0,0.15)',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [formatINR(Number(value)), 'Recovery']}
                />
                <Bar
                  dataKey="amount"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>

        {/* 3. User-wise Collection Performance */}
        <MotionCard
          delay={0.22}
          className="bg-white border border-[#EAE2D9] rounded-xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-stone-900">
              User-wise Collection Performance
            </h3>
            <p className="text-xs text-stone-500">
              Recovered amount vs assigned monthly collection target
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.userPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAE2D9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  width={70}
                />
                <Tooltip formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="collected"
                  name="Recovered"
                  fill="#EA580C"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                />
                <Bar
                  dataKey="target"
                  name="Target"
                  fill="#E7DED4"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>

        {/* 4. Outstanding vs Collected */}
        <MotionCard
          delay={0.26}
          className="bg-white border border-[#EAE2D9] rounded-xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-stone-900">
              Outstanding vs Collected by Region
            </h3>
            <p className="text-xs text-stone-500">
              Regional exposure compared with period collections
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.outstandingVsCollectedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAE2D9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  width={70}
                />
                <Tooltip formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="outstanding"
                  name="Outstanding"
                  fill="#EA580C"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                />
                <Bar
                  dataKey="collected"
                  name="Collected"
                  fill="#15803D"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>

        {/* 5. Overdue Aging Analysis */}
        <MotionCard
          delay={0.3}
          className="bg-white border border-[#EAE2D9] rounded-xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-stone-900">
              Overdue Aging Analysis
            </h3>
            <p className="text-xs text-stone-500">
              Receivables distribution across aging buckets
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.agingAnalysisData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAE2D9" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#78716C' }} />
                <YAxis
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  width={70}
                />
                <Tooltip formatter={(value) => formatINR(Number(value))} />
                <Bar
                  dataKey="amount"
                  name="Amount"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={650}
                >
                  {metrics.agingAnalysisData.map((entry) => (
                    <Cell key={entry.bucket} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>

        {/* 6. Party-wise Outstanding Distribution */}
        <MotionCard
          delay={0.34}
          className="bg-white border border-[#EAE2D9] rounded-xl p-5"
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-stone-900">
              Party-wise Outstanding Distribution
            </h3>
            <p className="text-xs text-stone-500">
              Top outstanding customer balances (click bar to open party profile)
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={metrics.partyDistributionData}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#EAE2D9" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatINRCompact(Number(v))}
                  tick={{ fontSize: 11, fill: '#78716C' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11, fill: '#44403C' }}
                />
                <Tooltip formatter={(value) => formatINR(Number(value))} />
                <Bar
                  dataKey="outstanding"
                  name="Outstanding"
                  fill="#EA580C"
                  radius={[0, 4, 4, 0]}
                  className="cursor-pointer"
                  isAnimationActive={true}
                  animationDuration={650}
                  onClick={(data) => {
                    const item = data as unknown as {
                      code?: string;
                      payload?: { code?: string };
                    };
                    handleBarPartyClick(item?.payload?.code || item?.code);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MotionCard>
      </div>
    </div>
  );
}
