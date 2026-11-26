import * as XLSX from 'xlsx';
import {
  CreditNoteRecord,
  FollowUp,
  FollowUpStatus,
  FOLLOW_UP_STATUS_OPTIONS,
  InterestRateBasis,
  InterestUpdateEntry,
  InvoiceRecord,
  NavSection,
  Party,
  PaymentMode,
  PaymentReceipt,
  PAYMENT_MODES,
  SheetMappingConfig,
  SheetTabAnalysis,
  TallySyncLog,
  User,
  UserRole,
} from '../types';
import { computePartyFifoLedger } from './recoveryEngine';

export const TARGET_SPREADSHEET_ID =
  '1aTislj2RqbVjtOgiqVvlGqSkN462wJPhgGkeuh2_y_o';

export const USER_SHEET_HEADERS = [
  'USER ID',
  'USER NAME',
  'USER PASSWORD',
  'ROLE',
  'CRAETED DATE AND TIME',
  'PAGE ACCESS',
];

export const INTEREST_SHEET_HEADERS = [
  'Vch No.',
  'Timestamp',
  'Interest Rate',
  'Number Of Days',
  'Invoice Amount',
];

const ALL_NAV_SECTIONS: NavSection[] = [
  'dashboard',
  'my_outstanding',
  'all_parties',
  'follow_ups',
  'commitments',
  'payment_recovery',
  'interest_management',
  'call_history',
  'calendar',
  'reports',
  'user_performance',
  'user_management',
  'tally_sync',
  'settings',
];

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

function toCamelCaseKey(str: string): string {
  return String(str || '')
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

/**
 * Apps Script currently reads Row 1 as header. Many sheets (AGING DATA, FOLLOW UP,
 * RECEIPT REGISTER, SALES DATA, INVOICE DETAILS, CREDIT NOTE) have title/total rows
 * at the top and the actual table header on Row 2 or Row 4 (which appears in rows[0..4]).
 * This helper detects the actual header row and re-keys subsequent rows to clean camelCase keys.
 */
function rekeyAppsScriptRows(
  rows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (!rows || rows.length === 0) return [];

  const headerSignals = new Set([
    'party name',
    'customer name',
    'particulars',
    'vch no.',
    'vch no',
    'vch type',
    'total oustanding',
    'total outstanding',
    'designated associate',
    'mobile number',
    'credit note',
    'amount',
    'debit',
    'credit',
    'date',
    'sn',
    'id',
  ]);

  let detectedHeaderIdx = -1;
  const searchLimit = Math.min(rows.length, 6);
  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    let hits = 0;
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('_raw_') || k === 'rowIndex' || k === 'sheetName') continue;
      if (typeof v === 'string') {
        const norm = v.trim().toLowerCase();
        if (headerSignals.has(norm)) hits++;
      }
    }
    if (hits >= 2) {
      detectedHeaderIdx = i;
      break;
    }
  }

  if (detectedHeaderIdx === -1) {
    return rows;
  }

  const headerRow = rows[detectedHeaderIdx];
  const keyToCamel: Record<string, string> = {};
  for (const [origKey, headerVal] of Object.entries(headerRow)) {
    if (origKey.startsWith('_raw_') || origKey === 'rowIndex' || origKey === 'sheetName') continue;
    if (typeof headerVal === 'string' && headerVal.trim()) {
      const camel = toCamelCaseKey(headerVal);
      if (camel) {
        keyToCamel[origKey] = camel;
      }
    }
  }

  return rows.slice(detectedHeaderIdx + 1).map((row) => {
    const mapped: Record<string, unknown> = {
      rowIndex: row.rowIndex,
      sheetName: row.sheetName,
    };
    for (const [origKey, val] of Object.entries(row)) {
      if (origKey.startsWith('_raw_') || origKey === 'rowIndex' || origKey === 'sheetName') continue;
      const newKey = keyToCamel[origKey];
      if (newKey && !(newKey in mapped)) {
        mapped[newKey] = val;
      }
    }
    return mapped;
  });
}

export async function fetchWorkspaceFromAppsScript(
  scriptUrl: string,
  fallbackUsers: User[]
): Promise<{
  parties: Party[];
  payments: PaymentReceipt[];
  followUps: FollowUp[];
  users: User[];
  userSheetHasRows: boolean;
  syncLogs: TallySyncLog[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
  interestUpdates: InterestUpdateEntry[];
  totalSheetsFound: number;
}> {
  const validation = validateAppsScriptUrl(scriptUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const trimmedUrl = scriptUrl.trim();
  const urlWithParam = trimmedUrl.includes('?')
    ? `${trimmedUrl}&all=true`
    : `${trimmedUrl}?all=true`;

  const res = await fetch(urlWithParam);
  if (!res.ok) {
    throw new Error(`Apps Script responded with HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.success && json.error) {
    throw new Error(String(json.error));
  }

  const rawSheets: Record<string, Array<Record<string, unknown>>> = json.sheets || {};
  const sheetNames = Object.keys(rawSheets);

  // Helper to find sheet rows case-insensitively (exact match first, then partial)
  const getSheetRows = (name: string): Array<Record<string, unknown>> => {
    const target = name.trim().toLowerCase();
    const exactKey = sheetNames.find((s) => s.trim().toLowerCase() === target);
    const key =
      exactKey ||
      sheetNames.find((s) => s.trim().toLowerCase().includes(target));
    return key ? rekeyAppsScriptRows(rawSheets[key] || []) : [];
  };

  const partyMasterRows = getSheetRows('PARTY MASTER');
  const setupRows = getSheetRows('SETUP');
  const setup1Rows = getSheetRows('SETUP1');
  const agingRows = getSheetRows('AGING DATA');
  const agingRevisedRows = getSheetRows('AGING DATA REVISED');
  const followUpSheetRows = getSheetRows('FOLLOW UP');
  const followUpDataRows = getSheetRows('Follow up Data');
  const dataResponseRows =
    followUpDataRows.length > 0 ? followUpDataRows : getSheetRows('Data Response');
  const archivedRows = getSheetRows('Archived');
  const invoiceRows = getSheetRows('INVOICE DETAILS');
  const salesRows = getSheetRows('SALES DATA');
  const receiptRows = getSheetRows('RECEIPT REGISTER');
  const creditRows = getSheetRows('CREDIT NOTE');
  const interestRows = getSheetRows('Interest Update');

  // 1. Build Users list (from USER sheet if any, plus real Designated Associates from sheets)
  const userRows = getSheetRows('USER');
  let parsedUsers: User[] = [];
  if (userRows.length > 0) {
    parsedUsers = userRows
      .filter((row) => row.userId || row.userName || row.name)
      .map((row, idx) => {
        const userId = String(row.userId || row.id || `USR-${idx + 1}`);
        const name = String(row.userName || row.name || userId);
        const email = String(
          row.email ||
            row.userEmail ||
            `${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}@piramalpetroleum.com`
        );
        const role: UserRole = String(row.role || 'Collection User')
          .toLowerCase()
          .includes('admin')
          ? 'Admin'
          : 'Collection User';
        const password = String(row.userPassword || row.password || '1234');

        return {
          id: userId,
          name,
          email,
          role,
          phone: String(row.phone || row.mobile || ''),
          designation: String(
            row.designation ||
              (role === 'Admin' ? 'Administrator' : 'Collection Officer')
          ),
          active: true,
          canRecordPayment: true,
          monthlyTarget: parseAmount(String(row.monthlyTarget || '')) || 1500000,
          password,
          demoPin: password,
          createdAt: String(
            row.craetedDateAndTime || row.createdDateAndTime || formatSheetTimestamp()
          ),
          pageAccess: 'ALL',
        };
      });
  }

  // Collect real Designated Associates from FOLLOW UP, SETUP1, PARTY MASTER, Data Response
  const associateNames = new Set<string>();
  const collectAssociate = (val: unknown) => {
    const s = String(val || '').trim();
    if (!s || s === '-' || s.toLowerCase() === 'na' || /^\d+\s*days?$/i.test(s)) return;
    associateNames.add(s);
  };
  followUpSheetRows.forEach((r) => collectAssociate(r.designatedAssociate));
  setup1Rows.forEach((r) => collectAssociate(r.designatedAssociate));
  partyMasterRows.forEach((r) => collectAssociate(r.designatedAssociate));
  dataResponseRows.forEach((r) => collectAssociate(r.designatedAssociate));

  const baseUsers: User[] =
    parsedUsers.length > 0
      ? [...parsedUsers]
      : [
          fallbackUsers[0] || {
            id: 'USR-ADMIN',
            name: 'Rajesh Piramal',
            email: 'info@piramalpetroleum.com',
            role: 'Admin',
            phone: '+91 98200 11001',
            designation: 'Director – Credit & Recovery',
            active: true,
            canRecordPayment: true,
            monthlyTarget: 6000000,
            password: '1234',
            demoPin: '1234',
            pageAccess: 'ALL',
          },
        ];

  associateNames.forEach((assocName) => {
    const exists = baseUsers.some(
      (u) => u.name.trim().toLowerCase() === assocName.toLowerCase()
    );
    if (!exists) {
      const slug = assocName.toLowerCase().replace(/[^a-z0-9]/g, '');
      baseUsers.push({
        id: `USR-${slug.slice(0, 8).toUpperCase()}`,
        name: assocName,
        email: `${slug}@piramalpetroleum.com`,
        role: 'Collection User',
        phone: '',
        designation: 'Recovery Executive',
        active: true,
        canRecordPayment: true,
        monthlyTarget: 2000000,
        password: '1234',
        demoPin: '1234',
        pageAccess: [
          'dashboard',
          'my_outstanding',
          'follow_ups',
          'commitments',
          'payment_recovery',
          'interest_management',
          'call_history',
          'calendar',
          'reports',
          'user_performance',
          'settings',
        ],
      });
    }
  });

  const activeUsers = baseUsers;
  const userSheetHasRows = parsedUsers.length > 0 || associateNames.size > 0;

  const resolveUserId = (rawAssignee: unknown): string => {
    const s = String(rawAssignee || '').trim().toLowerCase();
    if (!s) return activeUsers[0]?.id || 'USR-ADMIN';
    const matched = activeUsers.find(
      (u) =>
        u.name.toLowerCase() === s ||
        u.id.toLowerCase() === s ||
        u.email.toLowerCase() === s
    );
    return matched ? matched.id : activeUsers[0]?.id || 'USR-ADMIN';
  };

  // Lookup maps from PARTY MASTER, SETUP, SETUP1
  const masterByName = new Map<string, Record<string, unknown>>();
  partyMasterRows.forEach((r) => {
    const name = String(r.partyName || '').trim();
    if (name) masterByName.set(normalizePartyKey(name), r);
  });

  const setupByName = new Map<string, Record<string, unknown>>();
  setupRows.forEach((r) => {
    const name = String(r.partyName || '').trim();
    if (name) setupByName.set(normalizePartyKey(name), r);
  });
  setup1Rows.forEach((r) => {
    const name = String(r.partyName || '').trim();
    if (name) {
      const k = normalizePartyKey(name);
      setupByName.set(k, { ...(setupByName.get(k) || {}), ...r });
    }
  });

  // 2. Build Parties from AGING DATA + FOLLOW UP + PARTY MASTER
  const partyMap = new Map<string, Party>();
  const partyByName = new Map<string, Party>();

  const upsertParty = (
    partyName: string,
    explicitCode: string,
    outstanding: number,
    opts: {
      mobile?: string;
      creditDays?: number;
      totalAmount?: number;
      assignee?: unknown;
      city?: string;
      gstin?: string;
      followUpStatus?: string;
      followUpCount?: number;
      rowIndex?: number;
      sn?: string;
    }
  ) => {
    if (!partyName && !explicitCode) return;
    const normLower = partyName.trim().toLowerCase();
    if (normLower === 'total' || normLower === 'grand total') return;

    const normKey = normalizePartyKey(partyName);
    const master = masterByName.get(normKey);
    const setup = setupByName.get(normKey);

    const code =
      explicitCode ||
      String(master?.id || '').trim() ||
      makeCodeFromName(partyName, opts.sn, partyMap.size);

    const existing = (code && partyMap.get(code)) || partyByName.get(normKey);
    const resolvedMobile =
      (opts.mobile && opts.mobile !== '-' ? opts.mobile : '') ||
      (setup?.contact && String(setup.contact) !== '-' ? String(setup.contact) : '');
    const resolvedAssignee = resolveUserId(
      opts.assignee || setup?.designatedAssociate || master?.designatedAssociate
    );
    const resolvedCreditDays =
      opts.creditDays ||
      Number(String(master?.creditPeriod || setup?.creditDays || '30').replace(/\D/g, '')) ||
      30;

    if (existing) {
      if (resolvedMobile) existing.mobileNumber = resolvedMobile;
      if (opts.assignee) existing.assignedUserId = resolvedAssignee;
      if (outstanding > 0) {
        existing.totalOutstanding = outstanding;
        existing.overdueAmount = outstanding;
        existing.aging = {
          days0_30: 0,
          days31_60: 0,
          days61_90: 0,
          days90Plus: outstanding,
        };
      }
      if (opts.totalAmount && opts.totalAmount > 0) {
        existing.sheetTotalAmount = opts.totalAmount;
        existing.openingOutstanding = opts.totalAmount;
      }
      if (opts.followUpStatus) existing.sheetFollowUpStatus = opts.followUpStatus;
      if (opts.followUpCount !== undefined) existing.sheetFollowUpCount = opts.followUpCount;
      if (opts.city && opts.city !== 'India') existing.city = opts.city;
    } else {
      const party: Party = {
        customerCode: code,
        partyName: partyName || code,
        contactPerson: 'Accounts Team',
        mobileNumber: resolvedMobile,
        email: '',
        city: opts.city || String(master?.billingAddress || '').split(',').pop()?.trim() || 'India',
        gstin: opts.gstin || String(master?.gstNo || ''),
        creditLimit: 1000000,
        creditDays: resolvedCreditDays,
        openingOutstanding: opts.totalAmount || outstanding,
        totalOutstanding: outstanding,
        overdueAmount: outstanding,
        aging: {
          days0_30: 0,
          days31_60: 0,
          days61_90: 0,
          days90Plus: outstanding,
        },
        assignedUserId: resolvedAssignee,
        status: 'Active',
        lastTallySyncAt: new Date().toISOString(),
        sheetRowIndex: opts.rowIndex,
        sheetFollowUpStatus: opts.followUpStatus,
        sheetFollowUpCount: opts.followUpCount,
        sheetTotalAmount: opts.totalAmount,
        sheetSerialNumber: opts.sn,
      };
      partyMap.set(code, party);
      if (normKey) partyByName.set(normKey, party);
    }
  };

  // First load PARTY MASTER as the authoritative master directory (Id, Party Name, Billing address, Gst No, Credit Period, Designated Associate)
  partyMasterRows.forEach((row, idx) => {
    const partyName = String(row.partyName || '').trim();
    const explicitId = String(row.id || '').trim();
    if (!partyName && !explicitId) return;
    const rawCredit = String(row.creditPeriod ?? '').trim();
    const creditDays =
      rawCredit !== '' && !Number.isNaN(Number(rawCredit))
        ? Number(rawCredit)
        : Number(rawCredit.replace(/\D/g, '')) || 30;
    const cityFromAddress = String(row.billingAddress || '')
      .split(',')
      .pop()
      ?.trim();
    upsertParty(partyName, explicitId, 0, {
      creditDays,
      assignee: row.designatedAssociate,
      city: cityFromAddress || undefined,
      gstin: String(row.gstNo || '').trim() || undefined,
      rowIndex: Number(row.rowIndex) || idx + 2,
    });
  });

  // Merge AGING DATA (has ID like PPPL/MST/17, Party Name, Amount, CEMENT PLANT)
  agingRows.forEach((row, idx) => {
    const partyName = String(row.partyName || row.customerName || '').trim();
    const explicitId = String(row.id || '').trim();
    const amount = parseAmount(String(row.amount || ''));
    upsertParty(partyName, explicitId, amount, {
      city: String(row.cementPlant || '').trim() || undefined,
      rowIndex: Number(row.rowIndex) || idx + 3,
    });
  });

  // Also merge AGING DATA REVISED if any party wasn't in AGING DATA
  agingRevisedRows.forEach((row, idx) => {
    const partyName = String(row.partyName || '').trim();
    const explicitId = String(row.id || '').trim();
    const amount = parseAmount(String(row.amount || ''));
    upsertParty(partyName, explicitId, amount, {
      rowIndex: Number(row.rowIndex) || idx + 3,
    });
  });

  // Merge FOLLOW UP sheet (has SN, Designated Associate, CUSTOMER NAME, MOBILE NUMBER, Total Oustanding, Credit Period, TOTAL AMOUNT, FOLLOW UP STATUS, Follow up Count)
  followUpSheetRows.forEach((row, idx) => {
    const partyName = String(row.customerName || row.partyName || '').trim();
    if (!partyName) return;
    const totalOut = parseAmount(String(row.totalOustanding || row.totalOutstanding || ''));
    const totalAmt = parseAmount(String(row.totalAmount || ''));
    const creditDays = Number(String(row.creditPeriod || '').replace(/\D/g, '')) || 30;
    const sn = String(row.sn || '').trim();
    upsertParty(partyName, '', totalOut, {
      mobile: String(row.mobileNumber || '').trim(),
      creditDays,
      totalAmount: totalAmt,
      assignee: row.designatedAssociate,
      followUpStatus: String(row.followUpStatus || '').trim() || undefined,
      followUpCount: Number(row.followUpCount) || 0,
      rowIndex: Number(row.rowIndex) || idx + 5,
      sn,
    });
  });

  const parties = Array.from(partyMap.values());

  const resolvePartyForName = (name: string): Party | undefined => {
    if (!name) return undefined;
    return partyByName.get(normalizePartyKey(name));
  };

  // 3. Invoices (INVOICE DETAILS + SALES DATA)
  const invoiceMap = new Map<string, InvoiceRecord>();
  const addInvoices = (
    rows: Array<Record<string, unknown>>,
    sourceTab: 'INVOICE DETAILS' | 'SALES DATA'
  ) => {
    rows.forEach((row, idx) => {
      const vchNo = String(row.vchNo || row.voucherNo || row.invoiceNo || '').trim();
      const partyName = String(row.particulars || row.customerName || row.partyName || '').trim();
      if (!vchNo && !partyName) return;
      if (partyName.toLowerCase() === 'total' || partyName.toLowerCase() === 'grand total') return;

      const resolved = resolvePartyForName(partyName);
      const amt = parseAmount(String(row.invoiceAmount || row.debit || row.totalAmount || row.amount || ''));
      const pending = parseAmount(String(row.pendingAmount || row.balance || '')) || amt;
      const key = (vchNo || `${sourceTab}-${idx}`).toLowerCase();

      if (!invoiceMap.has(key)) {
        invoiceMap.set(key, {
          id: `inv-${sourceTab === 'INVOICE DETAILS' ? 'd' : 's'}-${idx + 1}`,
          vchNo: vchNo || `INV-${idx + 1}`,
          date:
            normalizeDateISO(String(row.date || row.invoiceDate || '')) ||
            new Date().toISOString().slice(0, 10),
          partyCode: resolved?.customerCode || '',
          partyName: resolved?.partyName || partyName || 'Customer',
          amount: amt,
          pendingAmount: pending,
          creditDays: resolved?.creditDays,
          sourceTab,
        });
      }
    });
  };

  addInvoices(invoiceRows, 'INVOICE DETAILS');
  addInvoices(salesRows, 'SALES DATA');
  const invoices = Array.from(invoiceMap.values());
  const invoiceByVch = new Map(invoices.map((inv) => [inv.vchNo.trim().toLowerCase(), inv]));

  // 4. Payments (RECEIPT REGISTER)
  const payments: PaymentReceipt[] = [];
  receiptRows.forEach((row, idx) => {
    const partyName = String(row.particulars || row.customerName || row.partyName || '').trim();
    const amt = parseAmount(
      String(row.credit || row.paymentReceivedAmount || row.receivedAmount || row.amount || '')
    );
    if (!partyName || amt <= 0) return;
    if (partyName.toLowerCase() === 'total' || partyName.toLowerCase() === 'grand total') return;

    const resolved = resolvePartyForName(partyName);
    const date =
      normalizeDateISO(String(row.date || row.paymentReceivedDate || '')) ||
      new Date().toISOString().slice(0, 10);
    const utr = String(row.transactionUtrNumber || row.utrNumber || row.utr || '');
    const vchType = String(row.vchType || 'Bank Receipt');
    const vchNo = String(row.vchNo || row.voucherNo || utr || `RCT-${idx + 1}`);

    payments.push({
      id: `rcpt-${idx + 1}`,
      voucherRef: vchNo,
      partyCode: resolved?.customerCode || '',
      partyName: resolved?.partyName || partyName,
      receivedAmount: amt,
      receivedDate: date,
      paymentMode: normalizePaymentMode(String(row.paymentMode || vchType || 'NEFT')),
      utrNumber: utr || vchNo,
      bankDetails: vchType || 'Bank Receipt',
      remarks: String(row.remarks || vchType || ''),
      recordedByUserId: resolved?.assignedUserId || activeUsers[0]?.id || 'USR-ADMIN',
      source: 'Tally',
      createdAt: date,
    });
  });

  // 5. Credit Notes (CREDIT NOTE)
  const creditNotes: CreditNoteRecord[] = [];
  creditRows.forEach((row, idx) => {
    const partyName = String(row.particulars || row.customerName || row.partyName || '').trim();
    const amt = parseAmount(String(row.credit || row.amount || row.creditAmount || ''));
    if (!partyName || amt <= 0) return;
    const resolved = resolvePartyForName(partyName);
    creditNotes.push({
      id: `cn-${idx + 1}`,
      vchNo: String(row.vchNo || row.creditNoteNo || `CN-${idx + 1}`),
      date: normalizeDateISO(String(row.date || '')) || new Date().toISOString().slice(0, 10),
      partyCode: resolved?.customerCode || '',
      partyName: resolved?.partyName || partyName,
      amount: amt,
      remarks: String(row.vchType || row.remarks || row.reason || 'Credit Note'),
    });
  });

  // 5b. Apply FIFO Bill Allocation + Credit Days Overdue Calculation per Party
  const todayISO = new Date().toISOString().slice(0, 10);
  parties.forEach((party) => {
    const pName = party.partyName.trim().toLowerCase();
    const pInvoices = invoices.filter(
      (inv) =>
        inv.partyCode === party.customerCode ||
        (pName && inv.partyName.trim().toLowerCase() === pName)
    );
    if (pInvoices.length === 0) return;

    const pReceived = payments
      .filter(
        (p) =>
          p.partyCode === party.customerCode ||
          (pName && p.partyName.trim().toLowerCase() === pName)
      )
      .reduce((s, p) => s + p.receivedAmount, 0);

    const pCredits = creditNotes
      .filter(
        (c) =>
          c.partyCode === party.customerCode ||
          (pName && c.partyName.trim().toLowerCase() === pName)
      )
      .reduce((s, c) => s + c.amount, 0);

    const fifo = computePartyFifoLedger(
      pInvoices,
      pReceived,
      pCredits,
      party.creditDays,
      todayISO
    );

    if (party.totalOutstanding > 0) {
      party.overdueAmount = Math.min(fifo.overdueAmount, party.totalOutstanding);
      party.aging = fifo.aging;
    } else {
      party.overdueAmount = 0;
      party.aging = { days0_30: 0, days31_60: 0, days61_90: 0, days90Plus: 0 };
    }
  });

  // 6. Interest Updates (Interest Update)
  const interestUpdates: InterestUpdateEntry[] = [];
  interestRows.forEach((row, idx) => {
    const vchNo = String(row.vchNo || '').trim();
    if (!vchNo) return;
    const rawRate = row.interestRate;
    const interestRateRaw =
      typeof rawRate === 'number' && rawRate > 0 && rawRate < 1
        ? `${Math.round(rawRate * 10000) / 100}%`
        : String(rawRate || '1% per month');
    const { ratePct, rateBasis } = parseInterestRateString(interestRateRaw);
    const numberOfDays = parseDaysString(String(row.numberOfDays || '0'));
    const matchedInv = invoiceByVch.get(vchNo.toLowerCase());
    const invoiceAmount =
      parseAmount(String(row.invoiceAmount || '')) || matchedInv?.amount || 0;
    const calculatedInterest = calculateInterestAmount(
      invoiceAmount,
      ratePct,
      rateBasis,
      numberOfDays
    );

    interestUpdates.push({
      id: `int-as-${idx + 1}`,
      vchNo,
      partyCode: matchedInv?.partyCode || '',
      partyName: matchedInv?.partyName || '',
      timestamp: String(row.timestamp || ''),
      interestRateRaw,
      ratePct,
      rateBasis,
      numberOfDays,
      invoiceAmount,
      calculatedInterest,
      totalPayableWithInterest: invoiceAmount + calculatedInterest,
      remarks: '',
      sheetRowIndex: Number(row.rowIndex) || idx + 2,
    });
  });

  // 7. Follow-Ups from FOLLOW UP sheet + Data Response + Archived
  const followUps: FollowUp[] = [];
  followUpSheetRows.forEach((row, idx) => {
    const partyName = String(row.customerName || row.partyName || '').trim();
    if (!partyName) return;
    const remark = String(row.lastFollowUpRemark || '').trim();
    const actionPoint = String(row.actionPoint || '').trim();
    const lastDate = normalizeDateISO(String(row.lastFollowupDate || ''));
    const nextDate = normalizeDateISO(String(row.nextFollowUpDate || row.nextFollowupDate || ''));
    if (!remark && !actionPoint && !lastDate && !nextDate) return;

    const resolved = resolvePartyForName(partyName);
    followUps.push({
      id: `fu-tab-${idx + 1}`,
      partyCode: resolved?.customerCode || makeCodeFromName(partyName, String(row.sn || ''), idx),
      partyName: resolved?.partyName || partyName,
      outstandingAtFollowUp: parseAmount(String(row.totalOustanding || '')),
      contactPerson: 'Accounts Team',
      contactNumber: String(row.mobileNumber || '').replace(/^-$/, ''),
      followUpDate: lastDate || new Date().toISOString().slice(0, 10),
      followUpTime: '11:00',
      status: normalizeFollowUpStatus(String(row.followUpStatus || 'Connected')),
      discussionNotes: [remark, actionPoint].filter(Boolean).join(' — ') || 'Follow-up logged',
      commitmentAmount: 0,
      nextPaymentDate: nextDate,
      nextFollowUpDate: nextDate,
      remarks: actionPoint || remark,
      userId: resolveUserId(row.designatedAssociate),
      createdAt: lastDate || new Date().toISOString(),
    });
  });

  [...dataResponseRows, ...archivedRows].forEach((row, idx) => {
    const partyName = String(row.partyName || '').trim();
    if (!partyName) return;
    const resolved = resolvePartyForName(partyName);
    const notes = String(row.remark || row.remarkIfany || row.actionPoint || '').trim();
    const fuDate =
      normalizeDateISO(String(row.date || row.timestamp || '')) ||
      new Date().toISOString().slice(0, 10);
    const nextDate = normalizeDateISO(String(row.nextFollowUpDate || ''));
    const rawPayStatus = String(row.paymentStatus || '').trim();
    const isReportedReceived =
      rawPayStatus.toLowerCase() === 'received' ||
      rawPayStatus.toLowerCase().includes('payment received');
    const normalizedStatus = isReportedReceived
      ? rawPayStatus.toLowerCase().includes('part')
        ? 'Part Payment Received'
        : 'Full Payment Received'
      : normalizeFollowUpStatus(rawPayStatus || 'Connected');
    const reportedAmt = parseAmount(String(row.amount || ''));
    const resolvedPartyCode =
      resolved?.customerCode || makeCodeFromName(partyName, undefined, idx + 500);
    const resolvedPartyName = resolved?.partyName || partyName;
    const assignedOfficerId = resolveUserId(row.designatedAssociate);

    followUps.push({
      id: `fu-resp-${idx + 1}`,
      partyCode: resolvedPartyCode,
      partyName: resolvedPartyName,
      outstandingAtFollowUp: resolved?.totalOutstanding || reportedAmt,
      contactPerson: 'Accounts Team',
      contactNumber: resolved?.mobileNumber || '',
      followUpDate: fuDate,
      followUpTime: '11:30',
      status: normalizedStatus,
      discussionNotes: notes || rawPayStatus || 'Follow-up response',
      commitmentAmount: isReportedReceived ? 0 : reportedAmt,
      nextPaymentDate: nextDate,
      nextFollowUpDate: nextDate,
      remarks: String(row.actionPoint || ''),
      userId: assignedOfficerId,
      createdAt: String(row.timestamp || fuDate),
    });

    // If officer reported "Received" + Amount in Follow-up, show it immediately as
    // "Follow-up (Unverified)" until Tally RECEIPT REGISTER updates the next day.
    if (isReportedReceived && reportedAmt > 0) {
      const pNorm = resolvedPartyName.trim().toLowerCase();
      const alreadyInTally = payments.some(
        (p) =>
          p.source === 'Tally' &&
          (p.partyCode === resolvedPartyCode ||
            p.partyName.trim().toLowerCase() === pNorm) &&
          p.receivedDate === fuDate &&
          Math.abs(p.receivedAmount - reportedAmt) < 1
      );
      if (!alreadyInTally) {
        payments.push({
          id: `fu-unv-${idx + 1}`,
          voucherRef: 'PENDING-TALLY',
          partyCode: resolvedPartyCode,
          partyName: resolvedPartyName,
          receivedAmount: reportedAmt,
          receivedDate: fuDate,
          paymentMode: 'NEFT',
          utrNumber: 'Tally Unverified',
          bankDetails: 'Pending Tally Verification',
          remarks: notes || 'Reported in Follow-up · Tally update pending',
          recordedByUserId: assignedOfficerId,
          source: 'Follow-up (Unverified)',
          createdAt: String(row.timestamp || fuDate),
        });
      }
    }
  });

  return {
    parties,
    payments,
    followUps,
    users: activeUsers,
    userSheetHasRows,
    syncLogs: [],
    invoices,
    creditNotes,
    interestUpdates,
    totalSheetsFound: sheetNames.length,
  };
}

export function validateAppsScriptUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Google Apps Script URL must use HTTPS.' };
    }
    const allowedHosts = ['script.google.com', 'script.googleusercontent.com'];
    if (!allowedHosts.includes(parsed.hostname)) {
      return {
        valid: false,
        error: 'URL must point to script.google.com or script.googleusercontent.com.',
      };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Please enter a valid HTTPS Google Apps Script Web App URL.' };
  }
}

export function formatSheetTimestamp(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

export function parseInterestRateString(raw: string): {
  ratePct: number;
  rateBasis: InterestRateBasis;
} {
  const s = String(raw || '').trim().toLowerCase();
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  const ratePct = numMatch ? Number(numMatch[1]) : 0;
  if (s.includes('annum') || s.includes('year') || s.includes('p.a') || s.includes('pa')) {
    return { ratePct, rateBasis: 'annual' };
  }
  if (s.includes('month') || s.includes('p.m') || s.includes('pm')) {
    return { ratePct, rateBasis: 'monthly' };
  }
  // Heuristic aligned with sheet: values like 12% or 18% without "month" are annual, 1%-3% are monthly
  return {
    ratePct,
    rateBasis: ratePct >= 6 ? 'annual' : 'monthly',
  };
}

export function parseDaysString(raw: string): number {
  const match = String(raw || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function calculateInterestAmount(
  invoiceAmount: number,
  ratePct: number,
  rateBasis: InterestRateBasis,
  days: number
): number {
  if (invoiceAmount <= 0 || ratePct <= 0 || days <= 0) return 0;
  const interest =
    rateBasis === 'monthly'
      ? invoiceAmount * (ratePct / 100) * (days / 30)
      : invoiceAmount * (ratePct / 100) * (days / 365);
  return Math.round(interest * 100) / 100;
}

export function serializePageAccess(pageAccess?: NavSection[] | 'ALL'): string {
  if (!pageAccess || pageAccess === 'ALL') return 'ALL';
  return pageAccess.join(', ');
}

export function parsePageAccess(raw: string, role: UserRole): NavSection[] | 'ALL' {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return role === 'Admin'
      ? 'ALL'
      : [
          'dashboard',
          'my_outstanding',
          'follow_ups',
          'commitments',
          'payment_recovery',
          'interest_management',
          'call_history',
          'calendar',
          'reports',
          'user_performance',
          'settings',
        ];
  }
  if (trimmed.toLowerCase() === 'all' || trimmed === '*') return 'ALL';

  const tokens = trimmed
    .split(/[,|;]+/)
    .map((x) => x.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);

  const aliasMap: Record<string, NavSection> = {
    dashboard: 'dashboard',
    my_outstanding: 'my_outstanding',
    outstanding: 'my_outstanding',
    all_parties: 'all_parties',
    parties: 'all_parties',
    follow_up: 'follow_ups',
    follow_ups: 'follow_ups',
    followup: 'follow_ups',
    commitments: 'commitments',
    upcoming_commitments: 'commitments',
    payment_recovery: 'payment_recovery',
    recovery: 'payment_recovery',
    receipts: 'payment_recovery',
    interest: 'interest_management',
    interest_update: 'interest_management',
    interest_management: 'interest_management',
    call_history: 'call_history',
    calendar: 'calendar',
    reports: 'reports',
    user_performance: 'user_performance',
    performance: 'user_performance',
    user_management: 'user_management',
    users: 'user_management',
    tally_sync: 'tally_sync',
    tally: 'tally_sync',
    settings: 'settings',
  };

  const resolved = tokens
    .map((tok) => aliasMap[tok] || (ALL_NAV_SECTIONS.includes(tok as NavSection) ? (tok as NavSection) : null))
    .filter((v): v is NavSection => v !== null);

  return resolved.length > 0 ? Array.from(new Set(resolved)) : role === 'Admin' ? 'ALL' : ['dashboard', 'my_outstanding', 'follow_ups', 'interest_management'];
}

function inferTabRole(
  title: string,
  headers: string[]
): SheetTabAnalysis['suggestedRole'] {
  const t = title.trim().toLowerCase();
  const h = headers.map((x) => x.toLowerCase()).join(' ');

  if (t.includes('interest') || t.includes('form_responses') || (h.includes('interest rate') && h.includes('vch no'))) {
    return 'interest';
  }
  if (t === 'user' || t === 'users' || t.includes('staff') || (h.includes('user id') && h.includes('user name'))) {
    return 'users';
  }
  if (t.includes('credit note') || t.includes('credit_note')) {
    return 'creditNote';
  }
  if (t.includes('receipt') || t.includes('payment') || t.includes('recovery') || h.includes('utr') || h.includes('received amount')) {
    return 'payments';
  }
  if (t.includes('aging') || t.includes('ageing')) {
    return 'aging';
  }
  if (t.includes('invoice')) {
    return 'invoices';
  }
  if (t.includes('sales')) {
    return 'sales';
  }
  if (t === 'follow up' || t === 'followup' || (h.includes('customer name') && (h.includes('oustanding') || h.includes('outstanding')))) {
    return 'parties';
  }
  if (t.includes('party') || t.includes('parties') || t.includes('tally') || t.includes('outstanding')) {
    return 'parties';
  }
  if (t.includes('follow') || t.includes('call') || h.includes('discussion')) {
    return 'followUps';
  }
  if (t.includes('sync') || t.includes('import') || t.includes('log')) {
    return 'syncLogs';
  }
  return 'unknown';
}

function colIndexToLetter(colIdx: number): string {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

export async function analyzeGoogleSpreadsheet(
  rawSpreadsheetInput: string,
  accessToken: string
): Promise<{
  spreadsheetId: string;
  title: string;
  tabs: SheetTabAnalysis[];
  suggestedMapping: SheetMappingConfig;
}> {
  const spreadsheetId = extractSpreadsheetId(rawSpreadsheetInput);
  if (!spreadsheetId) {
    throw new Error('Please enter a valid Google Sheet URL or Spreadsheet ID.');
  }

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaRes.ok) {
    const errBody = await metaRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Unable to inspect spreadsheet (HTTP ${metaRes.status}). Check sharing permissions and Spreadsheet ID.`
    );
  }

  const meta = await metaRes.json();
  const title: string = meta.properties?.title || 'Untitled Spreadsheet';
  const sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties?: { rowCount?: number; columnCount?: number };
    };
  }> = meta.sheets || [];

  const tabTitles = sheets.map((s) => s.properties.title);
  if (tabTitles.length === 0) {
    return {
      spreadsheetId,
      title,
      tabs: [],
      suggestedMapping: {
        partiesTab: '',
        paymentsTab: '',
        followUpsTab: '',
        usersTab: '',
        syncLogsTab: '',
        invoicesTab: '',
        salesTab: '',
        agingTab: '',
        creditNoteTab: '',
        interestTab: '',
      },
    };
  }

  const rangesParam = tabTitles
    .map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:Z15`)}`)
    .join('&');

  const [valuesRes, formulasRes] = await Promise.all([
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
    fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${rangesParam}&valueRenderOption=FORMULA`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
  ]);

  const valuesJson = valuesRes.ok ? await valuesRes.json() : { valueRanges: [] };
  const formulasJson = formulasRes.ok ? await formulasRes.json() : { valueRanges: [] };

  const analyzedTabs: SheetTabAnalysis[] = sheets.map((sheet, idx) => {
    const props = sheet.properties;
    const rows: string[][] = valuesJson.valueRanges?.[idx]?.values || [];
    const formulaRows: unknown[][] = formulasJson.valueRanges?.[idx]?.values || [];
    const headers = (rows[0] || []).map((h) => String(h || '').trim());

    const detectedFormulas: Array<{ cell: string; formula: string }> = [];
    formulaRows.forEach((fRow, rIdx) => {
      fRow.forEach((cellVal, cIdx) => {
        if (typeof cellVal === 'string' && cellVal.startsWith('=')) {
          detectedFormulas.push({
            cell: `${colIndexToLetter(cIdx)}${rIdx + 1}`,
            formula: cellVal,
          });
        }
      });
    });

    return {
      sheetId: props.sheetId,
      title: props.title,
      rowCount: props.gridProperties?.rowCount || rows.length,
      columnCount: props.gridProperties?.columnCount || headers.length,
      headers,
      detectedFormulas: detectedFormulas.slice(0, 12),
      suggestedRole: inferTabRole(props.title, headers),
      sampleRows: rows.slice(1, 6),
    };
  });

  const findTab = (role: SheetTabAnalysis['suggestedRole']) =>
    analyzedTabs.find((t) => t.suggestedRole === role)?.title || '';

  return {
    spreadsheetId,
    title,
    tabs: analyzedTabs,
    suggestedMapping: {
      partiesTab: findTab('parties') || findTab('aging') || analyzedTabs[0]?.title || '',
      paymentsTab: findTab('payments'),
      followUpsTab: findTab('followUps'),
      usersTab: findTab('users'),
      syncLogsTab: findTab('syncLogs'),
      invoicesTab: findTab('invoices'),
      salesTab: findTab('sales'),
      agingTab: findTab('aging'),
      creditNoteTab: findTab('creditNote'),
      interestTab: findTab('interest'),
    },
  };
}

function normalizeHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && map[key] === undefined) map[key] = i;
  });
  return map;
}

function pickCell(
  row: string[],
  headerMap: Record<string, number>,
  candidates: string[],
  fallback = ''
): string {
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (headerMap[norm] !== undefined) {
      const val = row[headerMap[norm]];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }
  return fallback;
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/[()]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

function normalizePartyKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function makeCodeFromName(name: string, sn?: string, idx = 0): string {
  if (sn && /^-?\d+$/.test(sn.trim())) {
    return `PP-${sn.trim()}`;
  }
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6);
  return `${slug || 'PARTY'}-${idx + 1}`;
}

function normalizeDateISO(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY (with optional time)
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const yr = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yr}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

function normalizeFollowUpStatus(raw: string): FollowUpStatus {
  const match = FOLLOW_UP_STATUS_OPTIONS.find(
    (opt) => opt.toLowerCase() === raw.trim().toLowerCase()
  );
  return match || 'Connected';
}

function normalizePaymentMode(raw: string): PaymentMode {
  const s = String(raw || '').trim().toLowerCase();
  if (s.includes('rtgs')) return 'RTGS';
  if (s.includes('imps')) return 'IMPS';
  if (s.includes('cheq') || s.includes('chq')) return 'Cheque';
  if (s.includes('upi')) return 'UPI';
  if (s.includes('cash')) return 'Cash';
  const match = PAYMENT_MODES.find((m) => m.toLowerCase() === s);
  return match || 'NEFT';
}

export async function fetchWorkspaceFromGoogleSheet(
  spreadsheetId: string,
  mapping: SheetMappingConfig,
  accessToken: string,
  fallbackUsers: User[]
): Promise<{
  parties: Party[];
  payments: PaymentReceipt[];
  followUps: FollowUp[];
  users: User[];
  userSheetHasRows: boolean;
  syncLogs: TallySyncLog[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
  interestUpdates: InterestUpdateEntry[];
}> {
  const tabsToRead = [
    mapping.partiesTab,
    mapping.agingTab,
    mapping.invoicesTab,
    mapping.salesTab,
    mapping.paymentsTab,
    mapping.creditNoteTab,
    mapping.interestTab,
    mapping.followUpsTab,
    mapping.usersTab,
    mapping.syncLogsTab,
  ].filter((x): x is string => Boolean(x));

  if (tabsToRead.length === 0) {
    throw new Error('At least one sheet tab (FOLLOW UP / Parties / Aging) must be mapped.');
  }

  const uniqueTabs = Array.from(new Set(tabsToRead));
  const rangesParam = uniqueTabs
    .map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:Z4000`)}`)
    .join('&');

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to read Google Sheet (HTTP ${res.status}).`);
  }

  const json = await res.json();
  const tabData: Record<string, string[][]> = {};
  uniqueTabs.forEach((tab, i) => {
    tabData[tab] = json.valueRanges?.[i]?.values || [];
  });

  // 1. Parse USER tab (supports USER ID | USER NAME | USER PASSWORD | ROLE | CRAETED DATE AND TIME | PAGE ACCESS)
  let parsedUsers: User[] = [];
  if (mapping.usersTab && tabData[mapping.usersTab]?.length > 1) {
    const rows = tabData[mapping.usersTab];
    const hMap = normalizeHeaderMap(rows[0]);
    parsedUsers = rows.slice(1).reduce<User[]>((acc, row, idx) => {
      const userId = pickCell(row, hMap, ['USER ID', 'ID', 'UserId']);
      const name = pickCell(row, hMap, ['USER NAME', 'Name', 'Employee Name', 'Full Name']);
      const email = pickCell(row, hMap, ['Email', 'User Email', 'Email ID']);
      const password = pickCell(row, hMap, ['USER PASSWORD', 'Password', 'PIN']);
      if (!userId && !name && !email) return acc;

      const roleRaw = pickCell(row, hMap, ['ROLE', 'Role', 'User Role'], 'Collection User');
      const role: UserRole = roleRaw.toLowerCase().includes('admin')
        ? 'Admin'
        : 'Collection User';
      const createdAt = pickCell(row, hMap, [
        'CRAETED DATE AND TIME',
        'CREATED DATE AND TIME',
        'Created At',
        'Date',
      ]);
      const pageAccessRaw = pickCell(row, hMap, ['PAGE ACCESS', 'Page Access', 'Pages']);
      const pageAccess = parsePageAccess(pageAccessRaw, role);

      acc.push({
        id: userId || `USR-${idx + 1}`,
        name: name || userId || email,
        email: (email || `${(userId || name).toLowerCase().replace(/[^a-z0-9]/g, '')}@piramalpetroleum.com`).toLowerCase(),
        role,
        phone: pickCell(row, hMap, ['Phone', 'Mobile', 'Contact']),
        designation: pickCell(
          row,
          hMap,
          ['Designation', 'Title'],
          role === 'Admin' ? 'Administrator' : 'Collection Officer'
        ),
        active:
          pickCell(row, hMap, ['Active', 'Status'], 'true').toLowerCase() !== 'false' &&
          pickCell(row, hMap, ['Active', 'Status'], 'Active').toLowerCase() !== 'inactive',
        canRecordPayment:
          pickCell(row, hMap, ['Can Record Payment', 'Record Payment'], 'true').toLowerCase() !==
          'false',
        monthlyTarget:
          parseAmount(pickCell(row, hMap, ['Monthly Target', 'Target'], '1500000')) || 1500000,
        password: password || '1234',
        demoPin: password || '1234',
        createdAt,
        pageAccess,
      });
      return acc;
    }, []);
  }

  const userSheetHasRows = parsedUsers.length > 0;
  const activeUsers = userSheetHasRows ? parsedUsers : fallbackUsers;

  const resolveUserId = (rawAssignee: string): string => {
    if (!rawAssignee) {
      return (
        activeUsers.find((u) => u.role === 'Collection User')?.id ||
        activeUsers[0]?.id ||
        'usr-admin'
      );
    }
    const lower = rawAssignee.toLowerCase();
    const matched = activeUsers.find(
      (u) =>
        u.id.toLowerCase() === lower ||
        u.email.toLowerCase() === lower ||
        u.name.toLowerCase() === lower
    );
    return matched ? matched.id : rawAssignee;
  };

  // 2. Parse Parties from FOLLOW UP / primary partiesTab
  const partyMap = new Map<string, Party>(); // keyed by customerCode
  const partyByName = new Map<string, Party>(); // keyed by normalized party name

  if (mapping.partiesTab && tabData[mapping.partiesTab]?.length > 1) {
    const rows = tabData[mapping.partiesTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const partyName = pickCell(row, hMap, [
        'CUSTOMER NAME',
        'Party Name',
        'Ledger Name',
        'Particulars',
        'Name',
      ]);
      const sn = pickCell(row, hMap, ['SN', 'S.N.', 'Sr No']);
      const explicitCode = pickCell(row, hMap, [
        'Customer Code',
        'Party Code',
        'Ledger ID',
        'ID',
        'Code',
      ]);
      if (!partyName && !explicitCode) return;

      const code = explicitCode || makeCodeFromName(partyName, sn, idx);
      const totalOutstanding = parseAmount(
        pickCell(row, hMap, [
          'Total Oustanding', // matches exact spelling in screenshot
          'Total Outstanding',
          'Closing Balance',
          'Outstanding',
          'Balance',
        ])
      );
      const sheetTotalAmount = parseAmount(
        pickCell(row, hMap, ['TOTAL AMOUNT', 'Total Amount'])
      );
      const creditDays =
        Number(pickCell(row, hMap, ['Credit Period', 'Credit Days', 'Terms'], '30').replace(/\D/g, '')) ||
        30;
      const overdueAmount = parseAmount(
        pickCell(row, hMap, ['Overdue Amount', 'Overdue', 'Due Amount'])
      );
      const openingOutstanding =
        parseAmount(pickCell(row, hMap, ['Opening Outstanding', 'Opening Balance'])) ||
        sheetTotalAmount ||
        totalOutstanding;

      const d0 = parseAmount(pickCell(row, hMap, ['0-30 Days', '0-30', '0_30', 'Current']));
      const d31 = parseAmount(pickCell(row, hMap, ['31-60 Days', '31-60', '31_60']));
      const d61 = parseAmount(pickCell(row, hMap, ['61-90 Days', '61-90', '61_90']));
      const d90 = parseAmount(pickCell(row, hMap, ['90+ Days', '90+', '>90 Days', 'Above 90']));
      const hasExplicitAging = d0 + d31 + d61 + d90 > 0;
      const effectiveOverdue = overdueAmount > 0 ? Math.min(overdueAmount, totalOutstanding) : 0;

      const party: Party = {
        customerCode: code,
        partyName: partyName || code,
        contactPerson: pickCell(row, hMap, ['Contact Person', 'Contact Name'], 'Accounts Dept'),
        mobileNumber: pickCell(row, hMap, [
          'MOBILE NUMBER',
          'Mobile Number',
          'Mobile',
          'Phone',
          'Contact Number',
        ]).replace(/^-$/, ''),
        email: pickCell(row, hMap, ['Email', 'Party Email']),
        city: pickCell(row, hMap, ['City', 'Location', 'Region', 'State'], 'India'),
        gstin: pickCell(row, hMap, ['GSTIN', 'GST No']),
        creditLimit: parseAmount(pickCell(row, hMap, ['Credit Limit'], '1000000')) || 1000000,
        creditDays,
        openingOutstanding,
        totalOutstanding,
        overdueAmount: effectiveOverdue,
        aging: hasExplicitAging
          ? { days0_30: d0, days31_60: d31, days61_90: d61, days90Plus: d90 }
          : {
              days0_30: Math.max(0, totalOutstanding - effectiveOverdue),
              days31_60: Math.round(effectiveOverdue * 0.5),
              days61_90: Math.round(effectiveOverdue * 0.3),
              days90Plus:
                effectiveOverdue -
                Math.round(effectiveOverdue * 0.5) -
                Math.round(effectiveOverdue * 0.3),
            },
        assignedUserId: resolveUserId(
          pickCell(row, hMap, ['Assigned User', 'Salesperson', 'Assigned To', 'Employee'])
        ),
        status: 'Active',
        lastTallySyncAt: new Date().toISOString(),
        sheetRowIndex: idx + 2,
        sheetFollowUpStatus: pickCell(row, hMap, ['FOLLOW UP STATUS', 'Follow up Status']),
        sheetFollowUpCount: Number(pickCell(row, hMap, ['Follow up Count', 'Followup Count'], '0')) || 0,
        sheetTotalAmount,
        sheetSerialNumber: sn,
      };

      partyMap.set(code, party);
      partyByName.set(normalizePartyKey(party.partyName), party);
    });
  }

  // 3. Enrich / merge AGING DATA tab
  if (mapping.agingTab && mapping.agingTab !== mapping.partiesTab && tabData[mapping.agingTab]?.length > 1) {
    const rows = tabData[mapping.agingTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const partyName = pickCell(row, hMap, [
        'CUSTOMER NAME',
        'Party Name',
        'Particulars',
        'Ledger Name',
        'Name',
      ]);
      const code = pickCell(row, hMap, ['Customer Code', 'Party Code', 'Ledger ID', 'ID']);
      if (!partyName && !code) return;
      if (partyName.toLowerCase() === 'grand total' || partyName.toLowerCase() === 'total') return;

      const normName = normalizePartyKey(partyName);
      const existing = (code && partyMap.get(code)) || partyByName.get(normName);

      const d0 = parseAmount(pickCell(row, hMap, ['0-30 Days', '0-30', '0 to 30', '(< 30 days)', 'Current']));
      const d31 = parseAmount(pickCell(row, hMap, ['31-60 Days', '31-60', '30 to 60', '31 to 60']));
      const d61 = parseAmount(pickCell(row, hMap, ['61-90 Days', '61-90', '60 to 90', '61 to 90']));
      const d90 = parseAmount(pickCell(row, hMap, ['90+ Days', '90+', '>90 Days', '> 90', 'Above 90', '91-120', '120+']));
      const totalBal = parseAmount(
        pickCell(row, hMap, [
          'Total Oustanding',
          'Total Outstanding',
          'Pending Amount',
          'Closing Balance',
          'Total',
          'Amount',
          'Balance',
        ])
      );
      const explicitOverdue = parseAmount(pickCell(row, hMap, ['Overdue Amount', 'Overdue']));
      const computedOverdue =
        explicitOverdue > 0 ? explicitOverdue : d31 + d61 + d90;

      if (existing) {
        if (existing.totalOutstanding <= 0 && totalBal > 0) {
          existing.totalOutstanding = totalBal;
        }
        if (d0 + d31 + d61 + d90 > 0) {
          existing.aging = {
            days0_30: d0,
            days31_60: d31,
            days61_90: d61,
            days90Plus: d90,
          };
        }
        if (computedOverdue > 0) {
          existing.overdueAmount = Math.min(computedOverdue, existing.totalOutstanding || computedOverdue);
        }
      } else {
        const finalCode = code || makeCodeFromName(partyName, undefined, partyMap.size + idx);
        const party: Party = {
          customerCode: finalCode,
          partyName: partyName || finalCode,
          contactPerson: pickCell(row, hMap, ['Contact Person'], 'Accounts Dept'),
          mobileNumber: pickCell(row, hMap, ['MOBILE NUMBER', 'Mobile', 'Phone']),
          email: '',
          city: pickCell(row, hMap, ['City', 'Location', 'State'], 'India'),
          creditLimit: 1000000,
          creditDays: 30,
          openingOutstanding: totalBal,
          totalOutstanding: totalBal,
          overdueAmount: Math.min(computedOverdue, totalBal),
          aging:
            d0 + d31 + d61 + d90 > 0
              ? { days0_30: d0, days31_60: d31, days61_90: d61, days90Plus: d90 }
              : {
                  days0_30: Math.max(0, totalBal - computedOverdue),
                  days31_60: Math.round(computedOverdue * 0.5),
                  days61_90: Math.round(computedOverdue * 0.3),
                  days90Plus:
                    computedOverdue -
                    Math.round(computedOverdue * 0.5) -
                    Math.round(computedOverdue * 0.3),
                },
          assignedUserId: resolveUserId(
            pickCell(row, hMap, ['Assigned User', 'Salesperson', 'Assigned To'])
          ),
          status: 'Active',
          lastTallySyncAt: new Date().toISOString(),
        };
        partyMap.set(finalCode, party);
        partyByName.set(normName, party);
      }
    });
  }

  const resolvePartyForNameOrCode = (partyName: string, partyCode: string): Party | undefined => {
    if (partyCode && partyMap.has(partyCode)) return partyMap.get(partyCode);
    if (partyName) {
      const exact = partyByName.get(normalizePartyKey(partyName));
      if (exact) return exact;
    }
    return undefined;
  };

  // 4. Parse INVOICE DETAILS + SALES DATA
  const invoiceMap = new Map<string, InvoiceRecord>();
  const parseInvoiceTab = (tabName: string | undefined, sourceTab: 'INVOICE DETAILS' | 'SALES DATA') => {
    if (!tabName || !tabData[tabName] || tabData[tabName].length <= 1) return;
    const rows = tabData[tabName];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const vchNo = pickCell(row, hMap, ['Vch No.', 'Vch No', 'Voucher No', 'Invoice No', 'Ref No', 'Bill No']);
      const partyName = pickCell(row, hMap, ['CUSTOMER NAME', 'Party Name', 'Particulars', 'Customer']);
      const rawCode = pickCell(row, hMap, ['Customer Code', 'Party Code', 'ID']);
      if (!vchNo && !partyName) return;

      const resolvedParty = resolvePartyForNameOrCode(partyName, rawCode);
      const amount = parseAmount(
        pickCell(row, hMap, ['Invoice Amount', 'TOTAL AMOUNT', 'Gross Total', 'Amount', 'Debit', 'Value'])
      );
      const pendingAmount = parseAmount(
        pickCell(row, hMap, ['Pending Amount', 'Total Oustanding', 'Balance', 'Due Amount'])
      ) || amount;

      const key = (vchNo || `${sourceTab}-${idx}`).toLowerCase();
      if (!invoiceMap.has(key)) {
        invoiceMap.set(key, {
          id: `inv-${sourceTab === 'INVOICE DETAILS' ? 'd' : 's'}-${idx + 1}`,
          vchNo: vchNo || `INV-${idx + 1}`,
          date:
            normalizeDateISO(pickCell(row, hMap, ['Date', 'Invoice Date', 'Vch Date', 'Bill Date'])) ||
            new Date().toISOString().slice(0, 10),
          partyCode: resolvedParty?.customerCode || rawCode || '',
          partyName: resolvedParty?.partyName || partyName || 'Customer',
          amount,
          pendingAmount,
          dueDate: normalizeDateISO(pickCell(row, hMap, ['Due Date', 'Due on'])),
          creditDays: Number(pickCell(row, hMap, ['Credit Period', 'Credit Days']).replace(/\D/g, '')) || undefined,
          sourceTab,
        });
      }
    });
  };
  parseInvoiceTab(mapping.invoicesTab, 'INVOICE DETAILS');
  parseInvoiceTab(mapping.salesTab, 'SALES DATA');

  const invoices = Array.from(invoiceMap.values());
  const invoiceByVch = new Map(invoices.map((inv) => [inv.vchNo.trim().toLowerCase(), inv]));

  // 5. Parse RECEIPT REGISTER -> PaymentReceipt[]
  const paymentMap = new Map<string, PaymentReceipt>();
  if (mapping.paymentsTab && tabData[mapping.paymentsTab]?.length > 1) {
    const rows = tabData[mapping.paymentsTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const partyName = pickCell(row, hMap, [
        'CUSTOMER NAME',
        'Party Name',
        'Particulars',
        'Customer',
        'Ledger Name',
      ]);
      const rawCode = pickCell(row, hMap, ['Customer Code', 'Party Code', 'Ledger ID', 'ID']);
      const receivedAmount = parseAmount(
        pickCell(row, hMap, [
          'Payment Received Amount',
          'Received Amount',
          'Credit',
          'Amount',
          'Gross Total',
          'Receipt Amount',
        ])
      );
      if ((!partyName && !rawCode) || receivedAmount <= 0) return;
      if (partyName.toLowerCase() === 'grand total' || partyName.toLowerCase() === 'total') return;

      const resolvedParty = resolvePartyForNameOrCode(partyName, rawCode);
      const receivedDate =
        normalizeDateISO(
          pickCell(row, hMap, ['Date', 'Payment Received Date', 'Received Date', 'Vch Date'])
        ) || new Date().toISOString().slice(0, 10);
      const utr = pickCell(row, hMap, [
        'Transaction / UTR Number',
        'UTR Number',
        'UTR',
        'Instrument No',
        'Cheque No',
        'Ref No',
      ]);
      const voucherRef =
        pickCell(row, hMap, ['Vch No.', 'Vch No', 'Voucher Ref', 'Voucher No', 'Receipt ID']) ||
        utr ||
        `GS-${resolvedParty?.customerCode || partyName}-${receivedDate}-${receivedAmount}-${idx}`;

      if (!paymentMap.has(voucherRef)) {
        paymentMap.set(voucherRef, {
          id: `pay-gs-${idx + 1}`,
          voucherRef,
          partyCode:
            resolvedParty?.customerCode ||
            rawCode ||
            makeCodeFromName(partyName, undefined, idx),
          partyName: resolvedParty?.partyName || partyName || rawCode,
          receivedDate,
          receivedAmount,
          paymentMode: normalizePaymentMode(
            pickCell(row, hMap, ['Payment Mode', 'Mode', 'Vch Type', 'Transaction Type'], 'NEFT')
          ),
          utrNumber: utr || voucherRef,
          bankDetails: pickCell(row, hMap, ['Bank Details', 'Bank', 'Account'], 'Company Bank Account'),
          remarks: pickCell(row, hMap, ['Remarks', 'Narration', 'Notes']),
          recordedByUserId: resolveUserId(
            pickCell(row, hMap, ['Recorded By', 'Employee', 'User']) ||
              resolvedParty?.assignedUserId ||
              ''
          ),
          source:
            pickCell(row, hMap, ['Source'], 'Tally').toLowerCase() === 'manual'
              ? 'Manual'
              : 'Tally',
          createdAt: new Date().toISOString(),
        });
      }
    });
  }

  // 6. Parse CREDIT NOTE -> CreditNoteRecord[]
  const creditNotes: CreditNoteRecord[] = [];
  if (mapping.creditNoteTab && tabData[mapping.creditNoteTab]?.length > 1) {
    const rows = tabData[mapping.creditNoteTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const vchNo = pickCell(row, hMap, ['Vch No.', 'Vch No', 'Voucher No', 'Credit Note No']);
      const partyName = pickCell(row, hMap, ['CUSTOMER NAME', 'Party Name', 'Particulars']);
      const amount = parseAmount(pickCell(row, hMap, ['Amount', 'Credit', 'Credit Amount', 'Total']));
      if (!vchNo && !partyName && amount <= 0) return;
      const resolvedParty = resolvePartyForNameOrCode(partyName, '');
      creditNotes.push({
        id: `cn-${idx + 1}`,
        vchNo: vchNo || `CN-${idx + 1}`,
        date:
          normalizeDateISO(pickCell(row, hMap, ['Date', 'Vch Date'])) ||
          new Date().toISOString().slice(0, 10),
        partyCode: resolvedParty?.customerCode || '',
        partyName: resolvedParty?.partyName || partyName || 'Customer',
        amount,
        remarks: pickCell(row, hMap, ['Narration', 'Remarks', 'Vch Type'], 'Credit Note'),
      });
    });
  }

  // 7. Parse Interest Update (Form_Responses2) -> InterestUpdateEntry[]
  const interestUpdates: InterestUpdateEntry[] = [];
  if (mapping.interestTab && tabData[mapping.interestTab]?.length > 1) {
    const rows = tabData[mapping.interestTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const vchNo = pickCell(row, hMap, ['Vch No.', 'Vch No', 'Voucher No', 'Invoice No']);
      if (!vchNo) return;
      const timestamp = pickCell(row, hMap, ['Timestamp', 'Date', 'Updated At']);
      const interestRateRaw = pickCell(row, hMap, ['Interest Rate', 'Rate'], '1%');
      const daysRaw = pickCell(row, hMap, ['Number Of Days', 'Days', 'Overdue Days'], '0');
      const matchedInv = invoiceByVch.get(vchNo.trim().toLowerCase());
      const invoiceAmount =
        parseAmount(pickCell(row, hMap, ['Invoice Amount', 'Amount'])) ||
        matchedInv?.amount ||
        0;
      const { ratePct, rateBasis } = parseInterestRateString(interestRateRaw);
      const numberOfDays = parseDaysString(daysRaw);
      const calculatedInterest = calculateInterestAmount(
        invoiceAmount,
        ratePct,
        rateBasis,
        numberOfDays
      );

      interestUpdates.push({
        id: `int-gs-${idx + 1}`,
        vchNo,
        partyCode: matchedInv?.partyCode || '',
        partyName:
          pickCell(row, hMap, ['Party Name', 'Customer Name']) ||
          matchedInv?.partyName ||
          '',
        timestamp,
        interestRateRaw,
        ratePct,
        rateBasis,
        numberOfDays,
        invoiceAmount,
        calculatedInterest,
        totalPayableWithInterest: invoiceAmount + calculatedInterest,
        remarks: pickCell(row, hMap, ['Remarks', 'Notes']),
        sheetRowIndex: idx + 2,
      });
    });
  }

  // 8. Parse Follow-Ups (only if mapped to an actual follow-up log tab with dates/notes)
  const followUps: FollowUp[] = [];
  if (
    mapping.followUpsTab &&
    mapping.followUpsTab !== mapping.partiesTab &&
    tabData[mapping.followUpsTab]?.length > 1
  ) {
    const rows = tabData[mapping.followUpsTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const partyName = pickCell(row, hMap, ['Party Name', 'Customer Name']);
      const partyCode = pickCell(row, hMap, ['Customer Code', 'Party Code', 'ID']);
      if (!partyName && !partyCode) return;

      const resolvedParty = resolvePartyForNameOrCode(partyName, partyCode);
      followUps.push({
        id: pickCell(row, hMap, ['Follow-up ID', 'ID'], `fu-gs-${idx + 1}`),
        partyCode: resolvedParty?.customerCode || partyCode || `CUST-${idx + 1}`,
        partyName: resolvedParty?.partyName || partyName || partyCode,
        outstandingAtFollowUp: parseAmount(
          pickCell(row, hMap, ['Outstanding Amount', 'Total Oustanding', 'Outstanding'])
        ),
        contactPerson: pickCell(row, hMap, ['Contact Person']),
        contactNumber: pickCell(row, hMap, ['Contact Number', 'Mobile', 'MOBILE NUMBER']),
        followUpDate:
          normalizeDateISO(pickCell(row, hMap, ['Follow-up Date', 'Date'])) ||
          new Date().toISOString().slice(0, 10),
        followUpTime: pickCell(row, hMap, ['Follow-up Time', 'Time'], '11:00'),
        status: normalizeFollowUpStatus(
          pickCell(row, hMap, ['Follow-up Status', 'FOLLOW UP STATUS', 'Status'], 'Connected')
        ),
        discussionNotes: pickCell(row, hMap, ['Discussion Notes', 'Notes']),
        commitmentAmount: parseAmount(
          pickCell(row, hMap, ['Payment Commitment Amount', 'Commitment Amount', 'Promised Amount'])
        ),
        nextPaymentDate: normalizeDateISO(
          pickCell(row, hMap, ['Next Payment Date', 'Promised Date'])
        ),
        nextFollowUpDate: normalizeDateISO(
          pickCell(row, hMap, ['Next Follow-up Date'])
        ),
        paymentMode: pickCell(row, hMap, ['Payment Mode'])
          ? normalizePaymentMode(pickCell(row, hMap, ['Payment Mode']))
          : '',
        remarks: pickCell(row, hMap, ['Remarks']),
        userId: resolveUserId(pickCell(row, hMap, ['User', 'Assigned User', 'Called By'])),
        createdAt: new Date().toISOString(),
      });
    });
  }

  // 9. Parse Sync Logs
  const syncLogs: TallySyncLog[] = [];
  if (mapping.syncLogsTab && tabData[mapping.syncLogsTab]?.length > 1) {
    const rows = tabData[mapping.syncLogsTab];
    const hMap = normalizeHeaderMap(rows[0]);
    rows.slice(1).forEach((row, idx) => {
      const syncedAt = pickCell(row, hMap, ['Synced At', 'Date', 'Timestamp']);
      if (!syncedAt) return;
      syncLogs.push({
        id: `sync-gs-${idx + 1}`,
        syncedAt,
        syncedBy: pickCell(row, hMap, ['Synced By', 'User'], 'Google Sheet Sync'),
        sourceType: 'Google Sheet',
        totalRecords: parseAmount(pickCell(row, hMap, ['Total Records', 'Records'])),
        newParties: parseAmount(pickCell(row, hMap, ['New Parties'])),
        updatedParties: parseAmount(pickCell(row, hMap, ['Updated Parties'])),
        removedParties: parseAmount(pickCell(row, hMap, ['Removed Parties'])),
        receiptsImported: parseAmount(pickCell(row, hMap, ['Receipts Imported'])),
        status: 'Success',
        notes: pickCell(row, hMap, ['Notes', 'Remarks']),
      });
    });
  }

  return {
    parties: Array.from(partyMap.values()),
    payments: Array.from(paymentMap.values()),
    followUps,
    users: activeUsers,
    userSheetHasRows,
    syncLogs,
    invoices,
    creditNotes,
    interestUpdates,
  };
}

export async function appendRowToGoogleSheet(
  spreadsheetId: string,
  tabName: string,
  rowValues: Array<string | number>,
  accessToken: string
): Promise<void> {
  if (!spreadsheetId || !tabName) return;
  const range = `'${tabName}'!A:Z`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to append row to ${tabName}`);
  }
}

export async function updateRowInGoogleSheet(
  spreadsheetId: string,
  tabName: string,
  rowIndex: number,
  rowValues: Array<string | number>,
  accessToken: string
): Promise<void> {
  if (!spreadsheetId || !tabName || rowIndex < 2) return;
  const range = `'${tabName}'!A${rowIndex}:Z${rowIndex}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to update row ${rowIndex} in ${tabName}`);
  }
}

/**
 * Ensures the `USER` sheet tab exists with `USER ID | USER NAME | USER PASSWORD | ROLE | CRAETED DATE AND TIME | PAGE ACCESS`
 * and populates initial users if row 2+ is empty.
 */
export async function ensureUserSheetInSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  usersToSeed: User[]
): Promise<{ createdTab: boolean; tabTitle: string; rowsWritten: number }> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Unable to inspect spreadsheet tabs.');
  }
  const meta = await metaRes.json();
  const existingTitles: string[] = (meta.sheets || []).map(
    (s: { properties: { title: string } }) => s.properties.title
  );

  let tabTitle =
    existingTitles.find((t) => t.trim().toUpperCase() === 'USER') || 'USER';
  let createdTab = false;

  if (!existingTitles.some((t) => t.trim().toUpperCase() === 'USER')) {
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: 'USER' } } }],
        }),
      }
    );
    if (!addRes.ok) {
      const err = await addRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Failed to create USER tab.');
    }
    createdTab = true;
    tabTitle = 'USER';
  }

  // Check current rows in USER tab
  const valRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${tabTitle}'!A1:F200`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const valJson = valRes.ok ? await valRes.json() : { values: [] };
  const existingRows: string[][] = valJson.values || [];

  const valuesToWrite: Array<Array<string | number>> = [];
  if (existingRows.length === 0) {
    valuesToWrite.push(USER_SHEET_HEADERS);
  }

  let rowsWritten = 0;
  if (existingRows.length <= 1 && usersToSeed.length > 0) {
    const nowStr = formatSheetTimestamp();
    usersToSeed.forEach((u) => {
      valuesToWrite.push([
        u.id,
        u.name,
        u.password || u.demoPin || '1234',
        u.role,
        u.createdAt || nowStr,
        serializePageAccess(u.pageAccess),
      ]);
      rowsWritten += 1;
    });
  }

  if (valuesToWrite.length > 0) {
    const startRow = existingRows.length === 0 ? 1 : existingRows.length + 1;
    const putRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(`'${tabTitle}'!A${startRow}`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: valuesToWrite }),
      }
    );
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || 'Failed to write USER rows to sheet.');
    }
  }

  return { createdTab, tabTitle, rowsWritten };
}

export async function saveRowToAppsScriptSheet(
  scriptUrl: string,
  sheetName: string,
  action: 'insert' | 'update',
  rowObj: Record<string, unknown>
): Promise<void> {
  const validation = validateAppsScriptUrl(scriptUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const base = scriptUrl.trim();
  const sep = base.includes('?') ? '&' : '?';
  const targetUrl = `${base}${sep}action=${encodeURIComponent(
    action
  )}&sheetName=${encodeURIComponent(sheetName)}`;

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify([rowObj]),
  });

  if (!res.ok) {
    throw new Error(`Apps Script API responded with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.success === false && data.error) {
    throw new Error(String(data.error));
  }
}

export async function callAppsScriptApi<T = Record<string, unknown>>(
  scriptUrl: string,
  action: string,
  payload: Record<string, unknown>,
  userEmail: string,
  role: UserRole
): Promise<T> {
  const validation = validateAppsScriptUrl(scriptUrl);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const res = await fetch(scriptUrl.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      userEmail,
      role,
      payload,
    }),
  });

  if (!res.ok) {
    throw new Error(`Apps Script API responded with HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export function parseTallyExportFile(file: File): Promise<{
  parties: Array<{
    customerCode: string;
    partyName: string;
    contactPerson: string;
    mobileNumber: string;
    city: string;
    totalOutstanding: number;
    overdueAmount: number;
  }>;
  receipts: Array<{
    voucherRef: string;
    partyCode: string;
    partyName: string;
    receivedDate: string;
    receivedAmount: number;
    paymentMode: PaymentMode;
    utrNumber: string;
    bankDetails: string;
    remarks: string;
  }>;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const parties: Array<{
          customerCode: string;
          partyName: string;
          contactPerson: string;
          mobileNumber: string;
          city: string;
          totalOutstanding: number;
          overdueAmount: number;
        }> = [];
        const receipts: Array<{
          voucherRef: string;
          partyCode: string;
          partyName: string;
          receivedDate: string;
          receivedAmount: number;
          paymentMode: PaymentMode;
          utrNumber: string;
          bankDetails: string;
          remarks: string;
        }> = [];

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: '',
          });
          if (rows.length < 2) return;
          const headers = rows[0].map((h) => String(h || '').trim());
          const hMap = normalizeHeaderMap(headers);
          const role = inferTabRole(sheetName, headers);

          if (role === 'payments') {
            rows.slice(1).forEach((row, idx) => {
              const partyName = pickCell(row, hMap, ['Party Name', 'Particulars', 'Customer Name', 'CUSTOMER NAME']);
              const partyCode = pickCell(row, hMap, ['Customer Code', 'Party Code', 'Ledger ID']);
              const amt = parseAmount(
                pickCell(row, hMap, ['Payment Received Amount', 'Received Amount', 'Amount', 'Credit'])
              );
              if ((!partyName && !partyCode) || amt <= 0) return;
              const date =
                normalizeDateISO(pickCell(row, hMap, ['Date', 'Receipt Date', 'Payment Received Date'])) ||
                new Date().toISOString().slice(0, 10);
              const utr = pickCell(row, hMap, ['UTR', 'UTR Number', 'Transaction / UTR Number', 'Instrument No']);
              const voucherRef =
                pickCell(row, hMap, ['Vch No.', 'Voucher No', 'Voucher Ref', 'Receipt No']) ||
                utr ||
                `TALLY-${partyCode || partyName}-${date}-${amt}-${idx}`;
              receipts.push({
                voucherRef,
                partyCode,
                partyName: partyName || partyCode,
                receivedDate: date,
                receivedAmount: amt,
                paymentMode: normalizePaymentMode(pickCell(row, hMap, ['Payment Mode', 'Mode'], 'NEFT')),
                utrNumber: utr || voucherRef,
                bankDetails: pickCell(row, hMap, ['Bank Details', 'Bank'], 'Tally Bank Receipt'),
                remarks: pickCell(row, hMap, ['Remarks', 'Narration']),
              });
            });
          } else {
            rows.slice(1).forEach((row, idx) => {
              const partyName = pickCell(row, hMap, ['Party Name', 'Particulars', 'Customer Name', 'CUSTOMER NAME', 'Ledger Name']);
              const code = pickCell(row, hMap, ['Customer Code', 'Party Code', 'Ledger ID', 'Code']);
              if (!partyName && !code) return;
              const out = parseAmount(
                pickCell(row, hMap, ['Total Outstanding', 'Total Oustanding', 'Closing Balance', 'Pending Amount', 'Outstanding'])
              );
              const overdue = parseAmount(
                pickCell(row, hMap, ['Overdue Amount', 'Overdue', 'Bills Overdue'])
              );
              parties.push({
                customerCode: code || `TLY-${200 + idx}`,
                partyName: partyName || code,
                contactPerson: pickCell(row, hMap, ['Contact Person', 'Contact'], 'Accounts Team'),
                mobileNumber: pickCell(row, hMap, ['Mobile Number', 'MOBILE NUMBER', 'Mobile', 'Phone']),
                city: pickCell(row, hMap, ['City', 'Region', 'State'], 'India'),
                totalOutstanding: out,
                overdueAmount: Math.min(overdue || out * 0.4, out),
              });
            });
          }
        });

        resolve({ parties, receipts });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the uploaded Tally file.'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateAppsScriptTemplate(mapping: SheetMappingConfig): string {
  const partiesTab = mapping.partiesTab || 'FOLLOW UP';
  const paymentsTab = mapping.paymentsTab || 'RECEIPT REGISTER';
  const followUpsTab = mapping.followUpsTab || 'FOLLOW UP';
  const usersTab = mapping.usersTab || 'USER';
  const interestTab = mapping.interestTab || 'Interest Update';
  const syncTab = mapping.syncLogsTab || 'Sync_Logs';

  return `/**
 * Piramal Petroleum Pvt. Ltd. - Google Apps Script Web App Backend
 * Spreadsheet ID: ${TARGET_SPREADSHEET_ID}
 * Deploy as: Web App -> Execute as: Me -> Who has access: Anyone (or Domain)
 */
const SHEET_NAMES = {
  PARTIES: '${partiesTab}',
  PAYMENTS: '${paymentsTab}',
  FOLLOWUPS: '${followUpsTab}',
  USERS: '${usersTab}',
  INTEREST: '${interestTab}',
  SYNC_LOGS: '${syncTab}',
};

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const { action, userEmail, payload } = req;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const user = verifyUser(ss, userEmail);
    if (!user) {
      return jsonOut({ error: 'Unauthorized user account.' });
    }

    if (action === 'BOOTSTRAP') {
      return jsonOut(getRoleScopedData(ss, user));
    }
    if (action === 'ADD_FOLLOWUP') {
      appendRow(ss, SHEET_NAMES.FOLLOWUPS, [
        payload.id, payload.partyCode, payload.partyName, payload.outstandingAtFollowUp,
        payload.contactPerson, payload.contactNumber, payload.followUpDate, payload.followUpTime,
        payload.status, payload.discussionNotes, payload.commitmentAmount || 0,
        payload.nextPaymentDate || '', payload.nextFollowUpDate || '',
        payload.paymentMode || '', payload.remarks || '', user.id, new Date().toISOString()
      ]);
      return jsonOut({ ok: true });
    }
    if (action === 'UPDATE_INTEREST') {
      appendRow(ss, SHEET_NAMES.INTEREST, [
        payload.vchNo, payload.timestamp, payload.interestRateRaw, payload.numberOfDays, payload.invoiceAmount
      ]);
      return jsonOut({ ok: true });
    }
    if (action === 'CREATE_USER') {
      if (user.role !== 'Admin') return jsonOut({ error: 'Admin access required.' });
      appendRow(ss, SHEET_NAMES.USERS, [
        payload.id, payload.name, payload.password, payload.role, payload.createdAt, payload.pageAccess
      ]);
      return jsonOut({ ok: true });
    }
    return jsonOut({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function verifyUser(ss, identifier) {
  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][0]).toLowerCase();
    const name = String(rows[i][1]).toLowerCase();
    const q = String(identifier).toLowerCase();
    if (id === q || name === q) {
      return { id: rows[i][0], name: rows[i][1], role: rows[i][3], pageAccess: rows[i][5] };
    }
  }
  return null;
}

function getRoleScopedData(ss, user) {
  const readTab = name => {
    const sh = ss.getSheetByName(name);
    return sh ? sh.getDataRange().getValues() : [];
  };
  return {
    parties: readTab(SHEET_NAMES.PARTIES),
    payments: readTab(SHEET_NAMES.PAYMENTS),
    followUps: readTab(SHEET_NAMES.FOLLOWUPS),
    users: readTab(SHEET_NAMES.USERS),
    interest: readTab(SHEET_NAMES.INTEREST),
    userRole: user.role
  };
}

function appendRow(ss, sheetName, row) {
  const sh = ss.getSheetByName(sheetName);
  if (sh) sh.appendRow(row);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;
}
