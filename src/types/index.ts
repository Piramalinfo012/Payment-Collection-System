export type UserRole = 'Admin' | 'Collection User';

export type NavSection =
  | 'dashboard'
  | 'my_outstanding'
  | 'all_parties'
  | 'follow_ups'
  | 'commitments'
  | 'payment_recovery'
  | 'interest_management'
  | 'call_history'
  | 'calendar'
  | 'reports'
  | 'user_performance'
  | 'user_management'
  | 'tally_sync'
  | 'settings';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  designation: string;
  active: boolean;
  canRecordPayment: boolean;
  monthlyTarget: number;
  password?: string;
  createdAt?: string;
  pageAccess?: NavSection[] | 'ALL';
  demoPin?: string;
}

export type PartyPaymentStatus =
  | 'Current'
  | 'Overdue'
  | 'Critical'
  | 'Settled'
  | 'Disputed';

export interface AgingBreakdown {
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90Plus: number;
}

export interface Party {
  customerCode: string;
  partyName: string;
  contactPerson: string;
  mobileNumber: string;
  email: string;
  city: string;
  gstin?: string;
  creditLimit: number;
  creditDays: number;
  openingOutstanding: number;
  totalOutstanding: number;
  overdueAmount: number;
  aging: AgingBreakdown;
  assignedUserId: string;
  status: 'Active' | 'Inactive';
  lastTallySyncAt: string;
  sheetRowIndex?: number;
  sheetFollowUpStatus?: string;
  sheetFollowUpCount?: number;
  sheetTotalAmount?: number;
  sheetSerialNumber?: string;
}

export type FollowUpStatus =
  | 'Connected'
  | 'Not Connected'
  | 'Call Not Answered'
  | 'Busy'
  | 'Payment Promised'
  | 'Part Payment Received'
  | 'Full Payment Received'
  | 'Payment Dispute'
  | 'Payment Pending'
  | 'Customer Requested More Time';

export const FOLLOW_UP_STATUS_OPTIONS: FollowUpStatus[] = [
  'Connected',
  'Not Connected',
  'Call Not Answered',
  'Busy',
  'Payment Promised',
  'Part Payment Received',
  'Full Payment Received',
  'Payment Dispute',
  'Payment Pending',
  'Customer Requested More Time',
];

export type PaymentMode =
  | 'NEFT'
  | 'RTGS'
  | 'IMPS'
  | 'Cheque'
  | 'UPI'
  | 'Cash';

export const PAYMENT_MODES: PaymentMode[] = [
  'NEFT',
  'RTGS',
  'IMPS',
  'Cheque',
  'UPI',
  'Cash',
];

export interface FollowUp {
  id: string;
  partyCode: string;
  partyName: string;
  outstandingAtFollowUp: number;
  contactPerson: string;
  contactNumber: string;
  followUpDate: string; // YYYY-MM-DD
  followUpTime: string; // HH:mm
  status: FollowUpStatus;
  discussionNotes: string;
  commitmentAmount: number;
  nextPaymentDate: string; // YYYY-MM-DD or ''
  nextFollowUpDate: string; // YYYY-MM-DD or ''
  paymentMode?: PaymentMode | '';
  remarks: string;
  userId: string;
  createdAt: string;
}

export interface PaymentReceipt {
  id: string;
  voucherRef: string; // Unique key from Tally or Manual entry for deduplication
  partyCode: string;
  partyName: string;
  receivedDate: string; // YYYY-MM-DD
  receivedAmount: number;
  paymentMode: PaymentMode;
  utrNumber: string;
  bankDetails: string;
  remarks: string;
  recordedByUserId: string;
  source: 'Tally' | 'Manual' | 'Follow-up (Unverified)';
  createdAt: string;
}

export interface InvoiceRecord {
  id: string;
  vchNo: string;
  date: string;
  partyCode: string;
  partyName: string;
  amount: number;
  pendingAmount: number;
  dueDate?: string;
  creditDays?: number;
  sourceTab: 'INVOICE DETAILS' | 'SALES DATA';
}

export interface CreditNoteRecord {
  id: string;
  vchNo: string;
  date: string;
  partyCode: string;
  partyName: string;
  amount: number;
  remarks: string;
}

export type InterestRateBasis = 'monthly' | 'annual';

export interface InterestUpdateEntry {
  id: string;
  vchNo: string;
  partyCode?: string;
  partyName?: string;
  timestamp: string;
  interestRateRaw: string;
  ratePct: number;
  rateBasis: InterestRateBasis;
  numberOfDays: number;
  invoiceAmount: number;
  calculatedInterest: number;
  totalPayableWithInterest: number;
  updatedBy?: string;
  remarks?: string;
  sheetRowIndex?: number;
}

export type CommitmentStatus =
  | 'Upcoming'
  | 'Due Today'
  | 'Overdue'
  | 'Fulfilled'
  | 'Partially Fulfilled';

export interface DerivedCommitment {
  id: string;
  followUpId: string;
  partyCode: string;
  partyName: string;
  partyOutstanding: number;
  promisedAmount: number;
  promisedDate: string;
  actualReceived: number;
  status: CommitmentStatus;
  userId: string;
  followUpDate: string;
  notes: string;
}

export interface TallySyncLog {
  id: string;
  syncedAt: string;
  syncedBy: string;
  sourceType: 'Google Sheet' | 'Apps Script API' | 'Tally Export File';
  totalRecords: number;
  newParties: number;
  updatedParties: number;
  removedParties: number;
  receiptsImported: number;
  status: 'Success' | 'Partial' | 'Failed';
  notes: string;
}

export interface EnrichedParty extends Party {
  assignedUserName: string;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  firstFollowUpDate: string | null;
  lastCalledBy: string | null;
  totalCalls: number;
  successfulCalls: number;
  unansweredCalls: number;
  totalCommitted: number;
  totalRecovered: number;
  paymentStatus: PartyPaymentStatus;
  hasOverdueCommitment: boolean;
  nextCommitment?: DerivedCommitment;
}

export type DateFilterPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'previous_month'
  | 'custom';

export type BackendMode = 'sandbox' | 'google_sheets' | 'apps_script';

export interface SheetTabAnalysis {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  detectedFormulas: Array<{ cell: string; formula: string }>;
  suggestedRole:
    | 'parties'
    | 'payments'
    | 'followUps'
    | 'users'
    | 'syncLogs'
    | 'invoices'
    | 'sales'
    | 'aging'
    | 'creditNote'
    | 'interest'
    | 'unknown';
  sampleRows: string[][];
}

export interface SheetMappingConfig {
  partiesTab: string;
  paymentsTab: string;
  followUpsTab: string;
  usersTab: string;
  syncLogsTab: string;
  invoicesTab?: string;
  salesTab?: string;
  agingTab?: string;
  creditNoteTab?: string;
  interestTab?: string;
}

export interface IntegrationConfig {
  mode: BackendMode;
  spreadsheetId: string;
  spreadsheetTitle: string;
  appsScriptUrl: string;
  mapping: SheetMappingConfig;
  lastConnectedAt: string | null;
  analyzedTabs: SheetTabAnalysis[];
}

export interface ConfirmationDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  details?: string[];
  onConfirm: () => Promise<void> | void;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}
