import {
  AgingBreakdown,
  CommitmentStatus,
  CreditNoteRecord,
  DateFilterPreset,
  DerivedCommitment,
  EnrichedParty,
  FollowUp,
  InvoiceRecord,
  Party,
  PartyPaymentStatus,
  PaymentReceipt,
  TallySyncLog,
  User,
} from '../types';
import {
  formatShortDate,
  isDateInRange,
  isSuccessfulCall,
  isUnansweredCall,
  resolveDateRange,
} from '../utils/formatters';

export interface ScopedWorkspace {
  parties: Party[];
  payments: PaymentReceipt[];
  followUps: FollowUp[];
  users: User[];
}

/**
 * Strict Role-Based Access Control (RBAC) Filter:
 * Collection Users can NEVER read parties, receipts, or follow-ups outside their assigned customer codes.
 */
export function scopeDataForUser(
  data: {
    parties: Party[];
    payments: PaymentReceipt[];
    followUps: FollowUp[];
    users: User[];
  },
  currentUser: User
): ScopedWorkspace {
  if (currentUser.role === 'Admin') {
    return data;
  }

  const assignedParties = data.parties.filter(
    (p) => p.assignedUserId === currentUser.id
  );
  const assignedPartyCodes = new Set(assignedParties.map((p) => p.customerCode));

  return {
    parties: assignedParties,
    payments: data.payments.filter((pay) => assignedPartyCodes.has(pay.partyCode)),
    followUps: data.followUps.filter(
      (fu) => assignedPartyCodes.has(fu.partyCode) || fu.userId === currentUser.id
    ),
    users: data.users.filter((u) => u.id === currentUser.id),
  };
}

export interface FifoInvoiceItem {
  invoice: InvoiceRecord;
  paidAmount: number;
  pendingAmount: number;
  ageDays: number;
  creditDays: number;
  overdueDays: number;
  isOverdue: boolean;
  fifoStatus: 'Paid' | 'Partial' | 'Overdue' | 'Within Credit';
}

export interface PartyFifoSummary {
  items: FifoInvoiceItem[];
  totalBilled: number;
  totalCreditsApplied: number;
  totalPendingFromBills: number;
  overdueAmount: number;
  withinCreditAmount: number;
  paidBillsCount: number;
  unpaidBillsCount: number;
  overdueBillsCount: number;
  aging: AgingBreakdown;
}

/**
 * Allocates bulk payments + credit notes in FIFO order (oldest invoice first)
 * and evaluates overdue status strictly against the party's Credit Period (days).
 * Example: creditDays = 7 => Day 0..7 is Within Credit; Day 8+ unpaid is Overdue.
 */
export function computePartyFifoLedger(
  partyInvoices: InvoiceRecord[],
  totalBulkReceived: number,
  totalCreditNotes: number,
  creditDays: number,
  todayISO?: string
): PartyFifoSummary {
  const sorted = [...partyInvoices].sort((a, b) => a.date.localeCompare(b.date));
  const refTime = todayISO ? new Date(`${todayISO}T23:59:59`).getTime() : Date.now();
  const safeCreditDays = Math.max(0, Number(creditDays) || 0);

  let remainingPool = Math.max(0, totalBulkReceived + totalCreditNotes);
  let totalBilled = 0;
  let totalPendingFromBills = 0;
  let overdueAmount = 0;
  let withinCreditAmount = 0;
  let paidBillsCount = 0;
  let unpaidBillsCount = 0;
  let overdueBillsCount = 0;

  const aging: AgingBreakdown = {
    days0_30: 0,
    days31_60: 0,
    days61_90: 0,
    days90Plus: 0,
  };

  const items: FifoInvoiceItem[] = sorted.map((inv) => {
    const billAmt = Math.max(0, inv.amount);
    totalBilled += billAmt;

    let paidAmount = 0;
    if (remainingPool >= billAmt) {
      paidAmount = billAmt;
      remainingPool -= billAmt;
    } else if (remainingPool > 0) {
      paidAmount = remainingPool;
      remainingPool = 0;
    }

    const pendingAmount = Math.max(0, Math.round((billAmt - paidAmount) * 100) / 100);
    const invTime = new Date(inv.date).getTime();
    const ageDays = Number.isNaN(invTime)
      ? 0
      : Math.max(0, Math.floor((refTime - invTime) / (1000 * 60 * 60 * 24)));
    const overdueDays = Math.max(0, ageDays - safeCreditDays);
    const isOverdue = pendingAmount > 0 && ageDays > safeCreditDays;

    let fifoStatus: FifoInvoiceItem['fifoStatus'];
    if (pendingAmount <= 0) {
      fifoStatus = 'Paid';
      paidBillsCount++;
    } else {
      unpaidBillsCount++;
      totalPendingFromBills += pendingAmount;
      if (isOverdue) {
        fifoStatus = 'Overdue';
        overdueAmount += pendingAmount;
        overdueBillsCount++;
      } else if (paidAmount > 0) {
        fifoStatus = 'Partial';
        withinCreditAmount += pendingAmount;
      } else {
        fifoStatus = 'Within Credit';
        withinCreditAmount += pendingAmount;
      }

      if (ageDays <= 30) aging.days0_30 += pendingAmount;
      else if (ageDays <= 60) aging.days31_60 += pendingAmount;
      else if (ageDays <= 90) aging.days61_90 += pendingAmount;
      else aging.days90Plus += pendingAmount;
    }

    return {
      invoice: inv,
      paidAmount: Math.round(paidAmount * 100) / 100,
      pendingAmount,
      ageDays,
      creditDays: safeCreditDays,
      overdueDays,
      isOverdue,
      fifoStatus,
    };
  });

  return {
    items,
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalCreditsApplied: Math.round((totalBulkReceived + totalCreditNotes) * 100) / 100,
    totalPendingFromBills: Math.round(totalPendingFromBills * 100) / 100,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    withinCreditAmount: Math.round(withinCreditAmount * 100) / 100,
    paidBillsCount,
    unpaidBillsCount,
    overdueBillsCount,
    aging,
  };
}

export function canUserAccessParty(party: Party, currentUser: User): boolean {
  if (currentUser.role === 'Admin') return true;
  return party.assignedUserId === currentUser.id;
}

export function computeCommitments(
  followUps: FollowUp[],
  payments: PaymentReceipt[],
  parties: Party[],
  todayISO: string
): DerivedCommitment[] {
  const partyByCode = new Map(parties.map((p) => [p.customerCode, p]));

  // Only follow-ups with commitmentAmount > 0 and a promised payment date create commitments
  const commitmentFollowUps = followUps
    .filter((fu) => fu.commitmentAmount > 0 && fu.nextPaymentDate)
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));

  return commitmentFollowUps.map((fu) => {
    const party = partyByCode.get(fu.partyCode);
    // Actual payments received on or after the follow-up date for this party count toward fulfilment
    const matchingPayments = payments.filter(
      (p) =>
        p.partyCode === fu.partyCode &&
        p.receivedDate >= fu.followUpDate
    );
    const actualReceived = matchingPayments.reduce(
      (sum, p) => sum + p.receivedAmount,
      0
    );

    let status: CommitmentStatus;
    if (actualReceived >= fu.commitmentAmount || (party && party.totalOutstanding <= 0)) {
      status = 'Fulfilled';
    } else if (fu.nextPaymentDate < todayISO) {
      status = 'Overdue';
    } else if (actualReceived > 0) {
      status = 'Partially Fulfilled';
    } else if (fu.nextPaymentDate === todayISO) {
      status = 'Due Today';
    } else {
      status = 'Upcoming';
    }

    return {
      id: `cmt-${fu.id}`,
      followUpId: fu.id,
      partyCode: fu.partyCode,
      partyName: party?.partyName || fu.partyName,
      partyOutstanding: party?.totalOutstanding ?? fu.outstandingAtFollowUp,
      promisedAmount: fu.commitmentAmount,
      promisedDate: fu.nextPaymentDate,
      actualReceived: Math.min(actualReceived, fu.commitmentAmount),
      status,
      userId: fu.userId,
      followUpDate: fu.followUpDate,
      notes: fu.discussionNotes,
    };
  });
}

export function enrichParties(
  parties: Party[],
  payments: PaymentReceipt[],
  followUps: FollowUp[],
  users: User[],
  todayISO: string
): EnrichedParty[] {
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const commitments = computeCommitments(followUps, payments, parties, todayISO);

  return parties.map((party) => {
    const partyPayments = payments
      .filter((p) => p.partyCode === party.customerCode)
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));

    const partyFollowUps = followUps
      .filter((f) => f.partyCode === party.customerCode)
      .sort((a, b) =>
        `${b.followUpDate} ${b.followUpTime}`.localeCompare(
          `${a.followUpDate} ${a.followUpTime}`
        )
      );

    const partyCommitments = commitments.filter(
      (c) => c.partyCode === party.customerCode
    );

    const lastPayment = partyPayments[0] || null;
    const lastFollowUp = partyFollowUps[0] || null;
    const firstFollowUp =
      partyFollowUps.length > 0
        ? partyFollowUps[partyFollowUps.length - 1]
        : null;

    const upcomingFollowUpDates = partyFollowUps
      .map((f) => f.nextFollowUpDate)
      .filter((d) => Boolean(d) && d >= todayISO)
      .sort();

    const totalCalls = partyFollowUps.length;
    const successfulCalls = partyFollowUps.filter((f) =>
      isSuccessfulCall(f.status)
    ).length;
    const unansweredCalls = partyFollowUps.filter((f) =>
      isUnansweredCall(f.status)
    ).length;

    const totalRecovered = partyPayments.reduce(
      (sum, p) => sum + p.receivedAmount,
      0
    );
    const totalCommitted = partyCommitments.reduce(
      (sum, c) => sum + c.promisedAmount,
      0
    );

    const hasDispute = lastFollowUp?.status === 'Payment Dispute';
    const hasOverdueCommitment = partyCommitments.some(
      (c) => c.status === 'Overdue'
    );

    let paymentStatus: PartyPaymentStatus = 'Current';
    if (party.totalOutstanding <= 0) {
      paymentStatus = 'Settled';
    } else if (hasDispute) {
      paymentStatus = 'Disputed';
    } else if (party.aging.days90Plus > 0 || hasOverdueCommitment) {
      paymentStatus = 'Critical';
    } else if (party.overdueAmount > 0) {
      paymentStatus = 'Overdue';
    }

    const nextCommitment = partyCommitments.find(
      (c) =>
        c.status === 'Overdue' ||
        c.status === 'Due Today' ||
        c.status === 'Upcoming'
    );

    return {
      ...party,
      assignedUserName: userMap.get(party.assignedUserId) || 'Unassigned',
      lastPaymentDate: lastPayment?.receivedDate || null,
      lastPaymentAmount: lastPayment?.receivedAmount || 0,
      lastFollowUpDate: lastFollowUp?.followUpDate || null,
      nextFollowUpDate:
        upcomingFollowUpDates[0] || lastFollowUp?.nextFollowUpDate || null,
      firstFollowUpDate: firstFollowUp?.followUpDate || null,
      lastCalledBy: lastFollowUp
        ? userMap.get(lastFollowUp.userId) || lastFollowUp.userId
        : null,
      totalCalls,
      successfulCalls,
      unansweredCalls,
      totalCommitted,
      totalRecovered,
      paymentStatus,
      hasOverdueCommitment,
      nextCommitment,
    };
  });
}

export interface DashboardMetrics {
  totalOutstanding: number;
  totalCollectedPeriod: number;
  prevPeriodCollected: number;
  collectionGrowthPct: number;
  todaysCollection: number;
  yesterdayCollection: number;
  todaysGrowthPct: number;
  totalOverdue: number;
  overdueSharePct: number;
  outstandingPartiesCount: number;
  totalActivePartiesCount: number;
  todaysFollowUpsCount: number;
  upcomingCommitmentsCount: number;
  upcomingCommitmentsAmount: number;
  overdueCommitmentsCount: number;
  recoveryPercentage: number;
  prevMonthRecoveryPercentage: number;
  monthlyTrendData: Array<{ month: string; collected: number; outstanding: number }>;
  dayWiseRecoveryData: Array<{ date: string; label: string; amount: number }>;
  userPerformanceData: Array<{ name: string; collected: number; target: number; outstanding: number }>;
  outstandingVsCollectedData: Array<{ name: string; outstanding: number; collected: number }>;
  agingAnalysisData: Array<{ bucket: string; amount: number; fill: string }>;
  partyDistributionData: Array<{ name: string; code: string; outstanding: number; overdue: number }>;
}

export function computeDashboardMetrics(
  scoped: ScopedWorkspace,
  dateFilter: DateFilterPreset,
  customStart: string,
  customEnd: string,
  todayISO: string
): DashboardMetrics {
  const { parties, payments, followUps, users } = scoped;
  const range = resolveDateRange(dateFilter, todayISO, customStart, customEnd);
  const thisMonthRange = resolveDateRange('this_month', todayISO);
  const prevMonthRange = resolveDateRange('previous_month', todayISO);
  const yesterdayRange = resolveDateRange('yesterday', todayISO);

  const activeParties = parties.filter((p) => p.status === 'Active');
  const totalOutstanding = activeParties.reduce(
    (s, p) => s + p.totalOutstanding,
    0
  );
  const totalOverdue = activeParties.reduce((s, p) => s + p.overdueAmount, 0);
  const outstandingPartiesCount = activeParties.filter(
    (p) => p.totalOutstanding > 0
  ).length;

  const periodPayments = payments.filter((p) =>
    isDateInRange(p.receivedDate, range.start, range.end)
  );
  const totalCollectedPeriod = periodPayments.reduce(
    (s, p) => s + p.receivedAmount,
    0
  );

  const thisMonthCollected = payments
    .filter((p) =>
      isDateInRange(p.receivedDate, thisMonthRange.start, thisMonthRange.end)
    )
    .reduce((s, p) => s + p.receivedAmount, 0);

  const prevPeriodCollected = payments
    .filter((p) =>
      isDateInRange(p.receivedDate, prevMonthRange.start, prevMonthRange.end)
    )
    .reduce((s, p) => s + p.receivedAmount, 0);

  const collectionGrowthPct =
    prevPeriodCollected > 0
      ? ((totalCollectedPeriod - prevPeriodCollected) / prevPeriodCollected) * 100
      : 0;

  const todaysCollection = payments
    .filter((p) => p.receivedDate === todayISO)
    .reduce((s, p) => s + p.receivedAmount, 0);

  const yesterdayCollection = payments
    .filter((p) => p.receivedDate === yesterdayRange.start)
    .reduce((s, p) => s + p.receivedAmount, 0);

  const todaysGrowthPct =
    yesterdayCollection > 0
      ? ((todaysCollection - yesterdayCollection) / yesterdayCollection) * 100
      : todaysCollection > 0
      ? 100
      : 0;

  const todaysFollowUpsCount = followUps.filter(
    (f) => f.followUpDate === todayISO || f.nextFollowUpDate === todayISO
  ).length;

  const commitments = computeCommitments(followUps, payments, parties, todayISO);
  const openCommitments = commitments.filter(
    (c) => c.status === 'Upcoming' || c.status === 'Due Today'
  );
  const overdueCommitments = commitments.filter((c) => c.status === 'Overdue');

  const openingTotal = activeParties.reduce(
    (s, p) => s + p.openingOutstanding,
    0
  );
  const recoveryDenominator = Math.max(
    openingTotal,
    totalOutstanding + thisMonthCollected
  );
  const recoveryPercentage =
    recoveryDenominator > 0
      ? (thisMonthCollected / recoveryDenominator) * 100
      : 0;
  const prevMonthRecoveryPercentage =
    recoveryDenominator > 0
      ? (prevPeriodCollected / (totalOutstanding + prevPeriodCollected)) * 100
      : 0;

  // 1. Monthly Collection Trend (group actual payments by YYYY-MM)
  const monthBuckets = new Map<string, number>();
  payments.forEach((p) => {
    const ym = p.receivedDate.slice(0, 7);
    monthBuckets.set(ym, (monthBuckets.get(ym) || 0) + p.receivedAmount);
  });
  const sortedMonths = Array.from(monthBuckets.keys()).sort();
  const monthlyTrendData = sortedMonths.map((ym) => {
    const [yr, mo] = ym.split('-').map(Number);
    const label = new Date(yr, mo - 1, 1).toLocaleDateString('en-IN', {
      month: 'short',
      year: '2-digit',
    });
    const collected = monthBuckets.get(ym) || 0;
    return {
      month: label,
      collected,
      outstanding: totalOutstanding,
    };
  });

  // 2. Day-wise Payment Recovery (within active period or this month)
  const dayBuckets = new Map<string, number>();
  const daySourcePayments =
    dateFilter === 'today' || dateFilter === 'yesterday'
      ? payments.filter((p) =>
          isDateInRange(p.receivedDate, thisMonthRange.start, thisMonthRange.end)
        )
      : periodPayments;
  daySourcePayments.forEach((p) => {
    dayBuckets.set(
      p.receivedDate,
      (dayBuckets.get(p.receivedDate) || 0) + p.receivedAmount
    );
  });
  const dayWiseRecoveryData = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({
      date,
      label: formatShortDate(date),
      amount,
    }));

  // 3. User-wise Collection Performance
  const userPerformanceData = users
    .filter((u) => u.active)
    .map((u) => {
      const userParties = activeParties.filter((p) => p.assignedUserId === u.id);
      const userCodes = new Set(userParties.map((p) => p.customerCode));
      const collected = periodPayments
        .filter((p) => userCodes.has(p.partyCode) || p.recordedByUserId === u.id)
        .reduce((s, p) => s + p.receivedAmount, 0);
      const outstanding = userParties.reduce(
        (s, p) => s + p.totalOutstanding,
        0
      );
      return {
        name: u.name.split(' ')[0],
        collected,
        target: u.monthlyTarget,
        outstanding,
      };
    });

  // 4. Outstanding vs Collected (by city/region or user)
  const cityMap = new Map<string, { outstanding: number; collected: number }>();
  const partyCity = new Map(activeParties.map((p) => [p.customerCode, p.city]));
  activeParties.forEach((p) => {
    const cur = cityMap.get(p.city) || { outstanding: 0, collected: 0 };
    cur.outstanding += p.totalOutstanding;
    cityMap.set(p.city, cur);
  });
  periodPayments.forEach((pay) => {
    const city = partyCity.get(pay.partyCode) || 'Other';
    const cur = cityMap.get(city) || { outstanding: 0, collected: 0 };
    cur.collected += pay.receivedAmount;
    cityMap.set(city, cur);
  });
  const outstandingVsCollectedData = Array.from(cityMap.entries())
    .map(([name, vals]) => ({ name, ...vals }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 7);

  // 5. Overdue Aging Analysis
  const agingTotals = activeParties.reduce(
    (acc, p) => {
      acc.d0 += p.aging.days0_30;
      acc.d31 += p.aging.days31_60;
      acc.d61 += p.aging.days61_90;
      acc.d90 += p.aging.days90Plus;
      return acc;
    },
    { d0: 0, d31: 0, d61: 0, d90: 0 }
  );
  const agingAnalysisData = [
    { bucket: '0–30 Days', amount: agingTotals.d0, fill: '#15803D' },
    { bucket: '31–60 Days', amount: agingTotals.d31, fill: '#F59E0B' },
    { bucket: '61–90 Days', amount: agingTotals.d61, fill: '#EA580C' },
    { bucket: '90+ Days', amount: agingTotals.d90, fill: '#B91C1C' },
  ];

  // 6. Party-wise Outstanding Distribution (Top 6 + Others)
  const sortedParties = [...activeParties]
    .filter((p) => p.totalOutstanding > 0)
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  const partyDistributionData = sortedParties.slice(0, 6).map((p) => ({
    name:
      p.partyName.length > 22
        ? `${p.partyName.slice(0, 20)}…`
        : p.partyName,
    code: p.customerCode,
    outstanding: p.totalOutstanding,
    overdue: p.overdueAmount,
  }));

  return {
    totalOutstanding,
    totalCollectedPeriod,
    prevPeriodCollected,
    collectionGrowthPct,
    todaysCollection,
    yesterdayCollection,
    todaysGrowthPct,
    totalOverdue,
    overdueSharePct:
      totalOutstanding > 0 ? (totalOverdue / totalOutstanding) * 100 : 0,
    outstandingPartiesCount,
    totalActivePartiesCount: activeParties.length,
    todaysFollowUpsCount,
    upcomingCommitmentsCount: openCommitments.length,
    upcomingCommitmentsAmount: openCommitments.reduce(
      (s, c) => s + c.promisedAmount,
      0
    ),
    overdueCommitmentsCount: overdueCommitments.length,
    recoveryPercentage,
    prevMonthRecoveryPercentage,
    monthlyTrendData,
    dayWiseRecoveryData,
    userPerformanceData,
    outstandingVsCollectedData,
    agingAnalysisData,
    partyDistributionData,
  };
}

export interface UserPerformanceRow {
  user: User;
  assignedParties: number;
  totalOutstandingAssigned: number;
  totalCallsMade: number;
  successfulCalls: number;
  unansweredCalls: number;
  followUpsCompleted: number;
  upcomingFollowUps: number;
  commitmentsReceivedCount: number;
  commitmentsReceivedAmount: number;
  commitmentsFulfilledCount: number;
  commitmentFulfilmentPct: number;
  totalAmountRecovered: number;
  recoveryPercentage: number;
}

export function computeUserPerformanceRows(
  users: User[],
  parties: Party[],
  payments: PaymentReceipt[],
  followUps: FollowUp[],
  startISO: string,
  endISO: string,
  todayISO: string
): UserPerformanceRow[] {
  const allCommitments = computeCommitments(followUps, payments, parties, todayISO);

  return users.map((u) => {
    const assigned = parties.filter(
      (p) => p.assignedUserId === u.id && p.status === 'Active'
    );
    const assignedCodes = new Set(assigned.map((p) => p.customerCode));
    const totalOutstandingAssigned = assigned.reduce(
      (s, p) => s + p.totalOutstanding,
      0
    );

    const userFollowUpsInRange = followUps.filter(
      (f) =>
        (f.userId === u.id || assignedCodes.has(f.partyCode)) &&
        isDateInRange(f.followUpDate, startISO, endISO)
    );

    const totalCallsMade = userFollowUpsInRange.length;
    const successfulCalls = userFollowUpsInRange.filter((f) =>
      isSuccessfulCall(f.status)
    ).length;
    const unansweredCalls = userFollowUpsInRange.filter((f) =>
      isUnansweredCall(f.status)
    ).length;
    const followUpsCompleted = userFollowUpsInRange.length;

    const upcomingFollowUps = followUps.filter(
      (f) =>
        (f.userId === u.id || assignedCodes.has(f.partyCode)) &&
        Boolean(f.nextFollowUpDate) &&
        f.nextFollowUpDate >= todayISO
    ).length;

    const userCommitments = allCommitments.filter(
      (c) =>
        (c.userId === u.id || assignedCodes.has(c.partyCode)) &&
        isDateInRange(c.followUpDate, startISO, endISO)
    );
    const fulfilledCommitments = userCommitments.filter(
      (c) => c.status === 'Fulfilled'
    );

    const totalAmountRecovered = payments
      .filter(
        (p) =>
          (p.recordedByUserId === u.id || assignedCodes.has(p.partyCode)) &&
          isDateInRange(p.receivedDate, startISO, endISO)
      )
      .reduce((s, p) => s + p.receivedAmount, 0);

    const denom = totalOutstandingAssigned + totalAmountRecovered;

    return {
      user: u,
      assignedParties: assigned.length,
      totalOutstandingAssigned,
      totalCallsMade,
      successfulCalls,
      unansweredCalls,
      followUpsCompleted,
      upcomingFollowUps,
      commitmentsReceivedCount: userCommitments.length,
      commitmentsReceivedAmount: userCommitments.reduce(
        (s, c) => s + c.promisedAmount,
        0
      ),
      commitmentsFulfilledCount: fulfilledCommitments.length,
      commitmentFulfilmentPct:
        userCommitments.length > 0
          ? (fulfilledCommitments.length / userCommitments.length) * 100
          : 0,
      totalAmountRecovered,
      recoveryPercentage: denom > 0 ? (totalAmountRecovered / denom) * 100 : 0,
    };
  });
}

export function buildPartyTimelineEntry(
  followUp: FollowUp,
  userName: string
): string {
  const datePart = formatShortDate(followUp.followUpDate);
  const base = `${datePart} – Called by ${userName} – ${followUp.status}`;
  if (followUp.commitmentAmount > 0 && followUp.nextPaymentDate) {
    return `${base} – ₹${followUp.commitmentAmount.toLocaleString('en-IN')} – ${formatShortDate(
      followUp.nextPaymentDate
    )}`;
  }
  return base;
}

export interface TallyDiffResult {
  newParties: Party[];
  updatedPartiesCount: number;
  inactiveMarkedCount: number;
  newReceipts: PaymentReceipt[];
  duplicateReceiptsSkipped: number;
  mergedParties: Party[];
  mergedPayments: PaymentReceipt[];
  log: TallySyncLog;
}

/**
 * Reconciles a Tally Export or Sheet Sync while strictly preserving:
 * - existing follow-up history
 * - existing payment collection activity
 * - assigned employee mappings
 * - deduplicating parties by customerCode and receipts by voucherRef/UTR
 */
export function reconcileTallySync(
  existingParties: Party[],
  existingPayments: PaymentReceipt[],
  incomingParties: Array<{
    customerCode: string;
    partyName: string;
    contactPerson: string;
    mobileNumber: string;
    city: string;
    totalOutstanding: number;
    overdueAmount: number;
  }>,
  incomingReceipts: Array<{
    voucherRef: string;
    partyCode: string;
    partyName: string;
    receivedDate: string;
    receivedAmount: number;
    paymentMode: PaymentReceipt['paymentMode'];
    utrNumber: string;
    bankDetails: string;
    remarks: string;
  }>,
  syncedByName: string,
  syncedByUserId: string,
  defaultAssigneeId: string,
  sourceType: TallySyncLog['sourceType']
): TallyDiffResult {
  const existingMap = new Map(existingParties.map((p) => [p.customerCode, p]));
  const incomingCodes = new Set<string>();
  const newParties: Party[] = [];
  let updatedPartiesCount = 0;

  const nowISO = new Date().toISOString();

  const mergedMap = new Map<string, Party>(existingMap);

  incomingParties.forEach((inc) => {
    incomingCodes.add(inc.customerCode);
    const existing = existingMap.get(inc.customerCode);
    if (existing) {
      updatedPartiesCount += 1;
      const overdue = Math.min(inc.overdueAmount, inc.totalOutstanding);
      mergedMap.set(inc.customerCode, {
        ...existing,
        partyName: inc.partyName || existing.partyName,
        contactPerson: inc.contactPerson || existing.contactPerson,
        mobileNumber: inc.mobileNumber || existing.mobileNumber,
        city: inc.city || existing.city,
        totalOutstanding: inc.totalOutstanding,
        overdueAmount: overdue,
        aging: {
          days0_30: Math.max(0, inc.totalOutstanding - overdue),
          days31_60: Math.round(overdue * 0.5),
          days61_90: Math.round(overdue * 0.3),
          days90Plus:
            overdue - Math.round(overdue * 0.5) - Math.round(overdue * 0.3),
        },
        status: 'Active',
        lastTallySyncAt: nowISO,
      });
    } else {
      const overdue = Math.min(inc.overdueAmount, inc.totalOutstanding);
      const created: Party = {
        customerCode: inc.customerCode,
        partyName: inc.partyName,
        contactPerson: inc.contactPerson || 'Accounts Dept',
        mobileNumber: inc.mobileNumber || '',
        email: '',
        city: inc.city || 'Mumbai',
        creditLimit: 1000000,
        creditDays: 30,
        openingOutstanding: inc.totalOutstanding,
        totalOutstanding: inc.totalOutstanding,
        overdueAmount: overdue,
        aging: {
          days0_30: Math.max(0, inc.totalOutstanding - overdue),
          days31_60: Math.round(overdue * 0.5),
          days61_90: Math.round(overdue * 0.3),
          days90Plus:
            overdue - Math.round(overdue * 0.5) - Math.round(overdue * 0.3),
        },
        assignedUserId: defaultAssigneeId,
        status: 'Active',
        lastTallySyncAt: nowISO,
      };
      newParties.push(created);
      mergedMap.set(inc.customerCode, created);
    }
  });

  let inactiveMarkedCount = 0;
  if (incomingParties.length > 0) {
    mergedMap.forEach((party, code) => {
      if (!incomingCodes.has(code) && party.status === 'Active') {
        mergedMap.set(code, { ...party, status: 'Inactive' });
        inactiveMarkedCount += 1;
      }
    });
  }

  // Deduplicate receipts by voucherRef or UTR + date + amount
  const existingVoucherKeys = new Set(
    existingPayments.flatMap((p) => [
      p.voucherRef.toLowerCase(),
      p.utrNumber ? p.utrNumber.toLowerCase() : '',
    ]).filter(Boolean)
  );

  const newReceipts: PaymentReceipt[] = [];
  let duplicateReceiptsSkipped = 0;

  incomingReceipts.forEach((rec, idx) => {
    const vKey = rec.voucherRef.toLowerCase();
    const uKey = rec.utrNumber ? rec.utrNumber.toLowerCase() : '';
    if (existingVoucherKeys.has(vKey) || (uKey && existingVoucherKeys.has(uKey))) {
      duplicateReceiptsSkipped += 1;
      return;
    }
    existingVoucherKeys.add(vKey);
    if (uKey) existingVoucherKeys.add(uKey);

    const resolvedParty =
      mergedMap.get(rec.partyCode) ||
      Array.from(mergedMap.values()).find(
        (p) => p.partyName.toLowerCase() === rec.partyName.toLowerCase()
      );

    newReceipts.push({
      id: `pay-sync-${Date.now()}-${idx}`,
      voucherRef: rec.voucherRef,
      partyCode: resolvedParty?.customerCode || rec.partyCode || `TLY-${idx + 1}`,
      partyName: resolvedParty?.partyName || rec.partyName,
      receivedDate: rec.receivedDate,
      receivedAmount: rec.receivedAmount,
      paymentMode: rec.paymentMode,
      utrNumber: rec.utrNumber,
      bankDetails: rec.bankDetails,
      remarks: rec.remarks,
      recordedByUserId: resolvedParty?.assignedUserId || syncedByUserId,
      source: 'Tally',
      createdAt: nowISO,
    });
  });

  const log: TallySyncLog = {
    id: `sync-${Date.now()}`,
    syncedAt: nowISO,
    syncedBy: syncedByName,
    sourceType,
    totalRecords: incomingParties.length + incomingReceipts.length,
    newParties: newParties.length,
    updatedParties: updatedPartiesCount,
    removedParties: inactiveMarkedCount,
    receiptsImported: newReceipts.length,
    status: 'Success',
    notes: `Preserved existing follow-ups & assignments. Skipped ${duplicateReceiptsSkipped} duplicate receipt(s).`,
  };

  return {
    newParties,
    updatedPartiesCount,
    inactiveMarkedCount,
    newReceipts,
    duplicateReceiptsSkipped,
    mergedParties: Array.from(mergedMap.values()),
    mergedPayments: [...newReceipts, ...existingPayments],
    log,
  };
}
