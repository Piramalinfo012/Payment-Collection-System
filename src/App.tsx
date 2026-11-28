import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  Database,
  FileText,
  History,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu,
  Percent,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  ConfirmationDialogState,
  CreditNoteRecord,
  DateFilterPreset,
  EnrichedParty,
  FollowUp,
  IntegrationConfig,
  InterestUpdateEntry,
  InvoiceRecord,
  NavSection,
  Party,
  PaymentReceipt,
  SheetMappingConfig,
  TallySyncLog,
  ToastMessage,
  User,
} from './types';
import { createInitialWorkspaceData } from './data/initialWorkspaceData';
import {
  canUserAccessParty,
  computeCommitments,
  computeDashboardMetrics,
  enrichParties,
  scopeDataForUser,
  TallyDiffResult,
} from './services/recoveryEngine';
import {
  getSheetsAccessToken,
  initGoogleAuth,
  signInWithGoogleSheets,
  signOutGoogle,
} from './services/googleAuth';
import {
  analyzeGoogleSpreadsheet,
  appendRowToGoogleSheet,
  calculateInterestAmount,
  callAppsScriptApi,
  ensureUserSheetInSpreadsheet,
  fetchUsersFromAppsScript,
  fetchWorkspaceFromAppsScript,
  fetchWorkspaceFromGoogleSheet,
  formatSheetTimestamp,
  saveRowToAppsScriptSheet,
  serializePageAccess,
  TARGET_SPREADSHEET_ID,
  updateRowInGoogleSheet,
} from './services/googleSheetsService';
import { formatINR, getLocalTodayISO } from './utils/formatters';
import { ConfirmationModal, ToastContainer } from './components/ui/CommonUI';
import { EASE_OUT_EXPO, MotionPage } from './components/ui/MotionPrimitives';
import { LoginScreen } from './components/LoginScreen';
import { FollowUpModal } from './components/Modals/FollowUpModal';
import { PaymentRecoveryModal } from './components/Modals/PaymentRecoveryModal';
import { PartyDetailDrawer } from './components/Modals/PartyDetailDrawer';
import { DashboardView } from './components/views/DashboardView';
import { PartyListView } from './components/views/PartyListView';
import { FollowUpsView } from './components/views/FollowUpsView';
import { CommitmentsView } from './components/views/CommitmentsView';
import { PaymentRecoveryView } from './components/views/PaymentRecoveryView';
import { InterestManagementView } from './components/views/InterestManagementView';
import { CallHistoryView } from './components/views/CallHistoryView';
import { CalendarView } from './components/views/CalendarView';
import { ReportsView } from './components/views/ReportsView';
import { UserPerformanceView } from './components/views/UserPerformanceView';
import { UserManagementView } from './components/views/UserManagementView';
import { TallySyncView } from './components/views/TallySyncView';
import { SettingsView } from './components/views/SettingsView';

const ADMIN_ONLY_SECTIONS: ReadonlySet<NavSection> = new Set([
  'all_parties',
  'user_management',
  'tally_sync',
  'settings',
]);

function hasPageAccess(user: User, section: NavSection): boolean {
  if (ADMIN_ONLY_SECTIONS.has(section) && user.role !== 'Admin') {
    return false;
  }
  if (!user.pageAccess || user.pageAccess === 'ALL') {
    return true;
  }
  return user.pageAccess.includes(section);
}

interface NavItemConfig {
  id: NavSection;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  nonAdminOnly?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my_outstanding', label: 'My Parties', icon: Building2, nonAdminOnly: true },
  { id: 'all_parties', label: 'All Parties', icon: Building2, adminOnly: true },
  { id: 'follow_ups', label: 'Payment Follow-ups', icon: PhoneCall },
  { id: 'payment_recovery', label: 'Payment Recovery', icon: IndianRupee },
  { id: 'interest_management', label: 'Interest Update', icon: Percent },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'user_performance', label: 'User Performance', icon: BarChart3 },
  { id: 'user_management', label: 'User Management', icon: UserCog, adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export default function App() {
  const todayISO = useMemo(() => getLocalTodayISO(), []);
  const initialData = useMemo(
    () => createInitialWorkspaceData(todayISO),
    [todayISO]
  );

  // Core Application State (100% Real Live Sheet Data — no mock records or bypass users)
  const [users, setUsers] = useState<User[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [payments, setPayments] = useState<PaymentReceipt[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [syncLogs, setSyncLogs] = useState<TallySyncLog[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [interestUpdates, setInterestUpdates] = useState<InterestUpdateEntry[]>([]);
  const [interestPreFillVch, setInterestPreFillVch] = useState<string>('');

  // Auth & Role State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation & Global Search State
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Dashboard Filters
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('this_month');
  const [customStart, setCustomStart] = useState(`${todayISO.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(todayISO);

  // Modals & Drawers
  const [selectedPartyCode, setSelectedPartyCode] = useState<string | null>(null);
  const [followUpModalParty, setFollowUpModalParty] = useState<EnrichedParty | null>(null);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [paymentModalParty, setPaymentModalParty] = useState<EnrichedParty | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Integration State
  const defaultScriptUrl =
    (import.meta as unknown as { env?: { VITE_APPS_SCRIPT_URL?: string } }).env
      ?.VITE_APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbz1e1EFZWRuRLQJLPE2AX6Kl6avbb3sjD_5b2x-4Te2bHPEQIMhEp6AkgSipDpYX3pUYw/exec';

  const defaultSheetId =
    (import.meta as unknown as { env?: { VITE_SPREADSHEET_ID?: string } }).env
      ?.VITE_SPREADSHEET_ID || '11hVKj1nNtEYeJTtFQ31coNLk_zDFC5PdDYKAn4Hl9Ek';

  const [integration, setIntegration] = useState<IntegrationConfig>({
    mode: 'sandbox',
    spreadsheetId: defaultSheetId,
    spreadsheetTitle: '',
    appsScriptUrl: defaultScriptUrl,
    mapping: {
      partiesTab: 'FOLLOW UP',
      paymentsTab: 'RECEIPT REGISTER',
      followUpsTab: 'FOLLOW UP',
      usersTab: 'USER',
      syncLogsTab: '',
      invoicesTab: 'INVOICE DETAILS',
      salesTab: 'SALES DATA',
      agingTab: 'AGING DATA',
      creditNoteTab: 'CREDIT NOTE',
      interestTab: 'Interest Update',
    },
    lastConnectedAt: null,
    analyzedTabs: [],
  });
  const [isSyncBusy, setIsSyncBusy] = useState(false);

  // Toast & Confirmation Dialog
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmationDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  // Initialize Firebase Auth Listener
  useEffect(() => {
    const unsub = initGoogleAuth(
      (fbUser) => {
        setHasGoogleToken(true);
        setGoogleEmail(fbUser.email || null);
      },
      () => {
        setHasGoogleToken(Boolean(getSheetsAccessToken()));
      }
    );
    return () => unsub();
  }, []);

  // Auto-connect to live Apps Script on launch if URL is configured
  useEffect(() => {
    if (defaultScriptUrl && integration.mode === 'sandbox') {
      fetchUsersFromAppsScript(defaultScriptUrl)
        .then((sheetUsers) => {
          if (sheetUsers.length > 0) setUsers(sheetUsers);
        })
        .catch(() => {});
      handleConnectAppsScript(defaultScriptUrl);
    }
  }, []);

  // Strict RBAC URL Path Guard (clean URLs without '#')
  useEffect(() => {
    const handleRouteChange = () => {
      if (!currentUser) return;
      const route = window.location.pathname.replace(/^\/+/, '');
      if (!route) return;

      if (route.startsWith('party/')) {
        const code = decodeURIComponent(route.slice('party/'.length));
        const target = parties.find((p) => p.customerCode === code);
        if (!target || !canUserAccessParty(target, currentUser)) {
          notify(
            'error',
            'Access Denied',
            'You are only authorized to view parties assigned to your account.'
          );
          window.history.replaceState(null, '', '/dashboard');
          setSelectedPartyCode(null);
          return;
        }
        setSelectedPartyCode(code);
        return;
      }

      const candidate = route as NavSection;
      const validItem = NAV_ITEMS.find((n) => n.id === candidate);
      if (validItem) {
        if (!hasPageAccess(currentUser, candidate)) {
          notify(
            'error',
            'Restricted Route',
            'You do not have permission to view that page.'
          );
          window.history.replaceState(null, '', '/dashboard');
          setActiveSection('dashboard');
          return;
        }
        setActiveSection(candidate);
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, [currentUser, parties, notify]);

  const navigateTo = useCallback(
    (section: NavSection) => {
      if (currentUser && !hasPageAccess(currentUser, section)) {
        notify(
          'error',
          'Access Restricted',
          'You do not have access permissions for this module.'
        );
        return;
      }
      setActiveSection(section);
      setMobileNavOpen(false);
      window.history.pushState(null, '', `/${section}`);
    },
    [currentUser, notify]
  );

  // Sync Target Google Sheet (1aTislj2RqbVjtOgiqVvlGqSkN462wJPhgGkeuh2_y_o)
  const loadTargetFmsSheet = useCallback(
    async (token: string, spreadsheetId = TARGET_SPREADSHEET_ID) => {
      const analysis = await analyzeGoogleSpreadsheet(spreadsheetId, token);
      const data = await fetchWorkspaceFromGoogleSheet(
        analysis.spreadsheetId,
        analysis.suggestedMapping,
        token,
        users
      );

      setParties(data.parties);
      setPayments(data.payments);
      setFollowUps(data.followUps);
      setInvoices(data.invoices);
      setCreditNotes(data.creditNotes);
      setInterestUpdates(data.interestUpdates);
      if (data.userSheetHasRows) setUsers(data.users);
      if (data.syncLogs.length > 0) setSyncLogs(data.syncLogs);

      setIntegration((prev) => ({
        ...prev,
        mode: 'google_sheets',
        spreadsheetId: analysis.spreadsheetId,
        spreadsheetTitle: analysis.title,
        analyzedTabs: analysis.tabs,
        mapping: analysis.suggestedMapping,
        lastConnectedAt: new Date().toISOString(),
      }));

      return { analysis, data };
    },
    [users]
  );

  // Google Sign-In handler (auto-connects and loads target FMS Google Sheet)
  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      const res = await signInWithGoogleSheets();
      if (res) {
        setHasGoogleToken(true);
        setGoogleEmail(res.user.email || null);
        const signedEmail = (res.user.email || '').toLowerCase();
        const displayName = (res.user.displayName || '').toLowerCase();
        const token = res.accessToken || getSheetsAccessToken();

        let sheetUsers = users;
        let userSheetHasRows = false;
        let syncedTitle = '';
        let syncedPartiesCount = 0;

        if (token) {
          try {
            const { analysis, data } = await loadTargetFmsSheet(
              token,
              integration.spreadsheetId || TARGET_SPREADSHEET_ID
            );
            syncedTitle = analysis.title;
            syncedPartiesCount = data.parties.length;
            userSheetHasRows = data.userSheetHasRows;
            if (data.userSheetHasRows) {
              sheetUsers = data.users;
            }
          } catch (syncErr: unknown) {
            const syncMsg =
              syncErr instanceof Error
                ? syncErr.message
                : 'Could not auto-load target sheet.';
            notify('warning', 'Google Signed In (Sheet Sync Pending)', syncMsg);
          }
        }

        // Map Google account to USER sheet row or owner Admin session
        if (!currentUser) {
          const matched = sheetUsers.find(
            (u) =>
              u.email.toLowerCase() === signedEmail ||
              (displayName && u.name.toLowerCase() === displayName)
          );
          if (matched) {
            if (!matched.active) {
              setAuthError('Your staff account is currently deactivated.');
              return;
            }
            setCurrentUser(matched);
          } else {
            const newSessionUser: User = {
              id: `USR-${res.user.uid.slice(0, 6).toUpperCase()}`,
              name: res.user.displayName || signedEmail.split('@')[0],
              email: signedEmail,
              role: 'Admin',
              phone: '',
              designation: 'Spreadsheet Administrator',
              active: true,
              canRecordPayment: true,
              monthlyTarget: 6000000,
              password: '1234',
              createdAt: formatSheetTimestamp(),
              pageAccess: 'ALL',
            };
            if (!userSheetHasRows) {
              setUsers((prev) =>
                prev.some((u) => u.email.toLowerCase() === signedEmail)
                  ? prev
                  : [...prev, newSessionUser]
              );
            }
            setCurrentUser(newSessionUser);
          }
        }

        if (syncedTitle) {
          notify(
            'success',
            `Synced: ${syncedTitle}`,
            `Loaded ${syncedPartiesCount} parties live from Google Sheets.${
              !userSheetHasRows
                ? ' Tip: Open User Management to populate the USER sheet tab.'
                : ''
            }`
          );
        } else {
          notify('success', 'Google Sheets Authorized', `Signed in as ${signedEmail}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      notify('error', 'Google Sign-In Failed', msg);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOutGoogle().catch(() => {});
    setCurrentUser(null);
    setHasGoogleToken(false);
    setGoogleEmail(null);
    setSelectedPartyCode(null);
    setActiveSection('dashboard');
    window.history.replaceState(null, '', '/');
  };

  // STRICT RBAC SCOPED DATA
  const scopedWorkspace = useMemo(() => {
    if (!currentUser) {
      return { parties: [], payments: [], followUps: [], users: [] };
    }
    return scopeDataForUser({ parties, payments, followUps, users }, currentUser);
  }, [currentUser, parties, payments, followUps, users]);

  const scopedInvoices = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') return invoices;
    const codes = new Set(scopedWorkspace.parties.map((p) => p.customerCode));
    const names = new Set(
      scopedWorkspace.parties.map((p) => p.partyName.trim().toLowerCase())
    );
    return invoices.filter(
      (inv) =>
        codes.has(inv.partyCode) ||
        names.has(inv.partyName.trim().toLowerCase())
    );
  }, [currentUser, invoices, scopedWorkspace.parties]);

  const scopedCreditNotes = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') return creditNotes;
    const codes = new Set(scopedWorkspace.parties.map((p) => p.customerCode));
    const names = new Set(
      scopedWorkspace.parties.map((p) => p.partyName.trim().toLowerCase())
    );
    return creditNotes.filter(
      (cn) =>
        codes.has(cn.partyCode) ||
        names.has(cn.partyName.trim().toLowerCase())
    );
  }, [currentUser, creditNotes, scopedWorkspace.parties]);

  const scopedInterestUpdates = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin') return interestUpdates;
    const codes = new Set(scopedWorkspace.parties.map((p) => p.customerCode));
    const names = new Set(
      scopedWorkspace.parties.map((p) => p.partyName.trim().toLowerCase())
    );
    const vchs = new Set(scopedInvoices.map((i) => i.vchNo.trim().toLowerCase()));
    return interestUpdates.filter(
      (u) =>
        (u.partyCode && codes.has(u.partyCode)) ||
        (u.partyName && names.has(u.partyName.trim().toLowerCase())) ||
        vchs.has(u.vchNo.trim().toLowerCase())
    );
  }, [currentUser, interestUpdates, scopedWorkspace.parties, scopedInvoices]);

  const enrichedScopedParties = useMemo(() => {
    return enrichParties(
      scopedWorkspace.parties,
      scopedWorkspace.payments,
      scopedWorkspace.followUps,
      users,
      todayISO
    );
  }, [scopedWorkspace, users, todayISO]);

  // "My Outstanding" always filters strictly to parties assigned to the logged-in user
  const myAssignedParties = useMemo(() => {
    if (!currentUser) return [];
    return enrichedScopedParties.filter(
      (p) => p.assignedUserId === currentUser.id
    );
  }, [enrichedScopedParties, currentUser]);

  const scopedCommitments = useMemo(() => {
    return computeCommitments(
      scopedWorkspace.followUps,
      scopedWorkspace.payments,
      scopedWorkspace.parties,
      todayISO
    );
  }, [scopedWorkspace, todayISO]);

  const dashboardMetrics = useMemo(() => {
    return computeDashboardMetrics(
      scopedWorkspace,
      dateFilter,
      customStart,
      customEnd,
      todayISO
    );
  }, [scopedWorkspace, dateFilter, customStart, customEnd, todayISO]);

  const selectedParty = useMemo(() => {
    if (!selectedPartyCode || !currentUser) return null;
    const found = enrichedScopedParties.find(
      (p) => p.customerCode === selectedPartyCode
    );
    if (!found || !canUserAccessParty(found, currentUser)) return null;
    return found;
  }, [selectedPartyCode, enrichedScopedParties, currentUser]);

  const openPartyProfile = useCallback(
    (party: EnrichedParty) => {
      if (!currentUser || !canUserAccessParty(party, currentUser)) {
        notify('error', 'Access Denied', 'Party is not assigned to your user profile.');
        return;
      }
      setSelectedPartyCode(party.customerCode);
      setShowSearchDropdown(false);
      window.history.pushState(null, '', `/party/${encodeURIComponent(party.customerCode)}`);
    },
    [currentUser, notify]
  );

  const openPartyByCode = useCallback(
    (code: string) => {
      let found = enrichedScopedParties.find((p) => p.customerCode === code);
      if (!found) {
        const refFu = followUps.find((f) => f.partyCode === code);
        const refPay = payments.find((p) => p.partyCode === code);
        const rawName = (refFu?.partyName || refPay?.partyName || '').trim().toLowerCase();
        if (rawName) {
          found = enrichedScopedParties.find(
            (p) =>
              p.partyName.trim().toLowerCase() === rawName ||
              p.partyName.trim().toLowerCase().includes(rawName) ||
              rawName.includes(p.partyName.trim().toLowerCase())
          );
        }
      }
      if (found) {
        openPartyProfile(found);
      } else {
        notify(
          'info',
          'Party Details Unavailable',
          'This party is either not in your assigned ledger or not yet mapped in PARTY MASTER.'
        );
      }
    },
    [enrichedScopedParties, followUps, payments, openPartyProfile, notify]
  );

  // Global search results (strictly RBAC-scoped)
  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return enrichedScopedParties
      .filter(
        (p) =>
          p.partyName.toLowerCase().includes(q) ||
          p.customerCode.toLowerCase().includes(q) ||
          p.contactPerson.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [globalSearch, enrichedScopedParties]);

  // Live Google Sheets & Apps Script Handlers
  const handleAnalyzeSheet = async (sheetUrlOrId: string) => {
    const token = getSheetsAccessToken();
    if (!token) {
      notify('error', 'Google Authorization Required', 'Please Sign in with Google first.');
      return;
    }
    setIsSyncBusy(true);
    try {
      const result = await analyzeGoogleSpreadsheet(sheetUrlOrId, token);
      setIntegration((prev) => ({
        ...prev,
        spreadsheetId: result.spreadsheetId,
        spreadsheetTitle: result.title,
        analyzedTabs: result.tabs,
        mapping: result.suggestedMapping,
      }));
      notify(
        'success',
        'Spreadsheet Analyzed',
        `Inspected ${result.tabs.length} tab(s) in "${result.title}". Review mappings below.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to analyze Google Sheet.';
      notify('error', 'Sheet Analysis Failed', msg);
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleConnectSheetData = async (mapping: SheetMappingConfig) => {
    const token = getSheetsAccessToken();
    const targetId = integration.spreadsheetId || TARGET_SPREADSHEET_ID;
    if (!token || !targetId) return;
    setIsSyncBusy(true);
    try {
      const data = await fetchWorkspaceFromGoogleSheet(
        targetId,
        mapping,
        token,
        users
      );
      setParties(data.parties);
      setPayments(data.payments);
      setFollowUps(data.followUps);
      setInvoices(data.invoices);
      setCreditNotes(data.creditNotes);
      setInterestUpdates(data.interestUpdates);
      if (data.userSheetHasRows) setUsers(data.users);
      if (data.syncLogs.length > 0) setSyncLogs(data.syncLogs);
      setIntegration((prev) => ({
        ...prev,
        mode: 'google_sheets',
        spreadsheetId: targetId,
        mapping,
        lastConnectedAt: new Date().toISOString(),
      }));
      notify(
        'success',
        'Connected to Live Google Sheet',
        `Loaded ${data.parties.length} parties, ${data.invoices.length} invoices, and ${data.payments.length} receipts.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load spreadsheet data.';
      notify('error', 'Sheet Sync Failed', msg);
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleSyncTargetFmsSheet = async () => {
    const token = getSheetsAccessToken();
    if (!token) {
      notify('error', 'Google Authorization Required', 'Please Sign in with Google first.');
      return;
    }
    setIsSyncBusy(true);
    try {
      const { analysis, data } = await loadTargetFmsSheet(
        token,
        integration.spreadsheetId || TARGET_SPREADSHEET_ID
      );
      notify(
        'success',
        `Loaded "${analysis.title}"`,
        `Synced ${data.parties.length} parties, ${data.invoices.length} invoices, and ${data.interestUpdates.length} interest rows.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sync target sheet.';
      notify('error', 'Sheet Sync Failed', msg);
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleConnectAppsScript = async (scriptUrl: string) => {
    setIsSyncBusy(true);
    try {
      const data = await fetchWorkspaceFromAppsScript(scriptUrl, users);

      setParties(data.parties);
      setPayments(data.payments);
      setFollowUps(data.followUps);
      setInvoices(data.invoices);
      setCreditNotes(data.creditNotes);
      setInterestUpdates(data.interestUpdates);
      setSyncLogs(data.syncLogs);
      if (data.userSheetHasRows) setUsers(data.users);

      setIntegration((prev) => ({
        ...prev,
        mode: 'apps_script',
        appsScriptUrl: scriptUrl,
        lastConnectedAt: new Date().toISOString(),
      }));
      notify(
        'success',
        'Live Google Sheets Synchronized!',
        `Fetched ${data.parties.length} real parties, ${data.invoices.length} invoices & ${data.payments.length} receipts across ${data.totalSheetsFound} tabs.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Apps Script request failed.';
      notify('error', 'Apps Script Error', msg);
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleRefreshLiveSync = async () => {
    if (integration.mode === 'google_sheets') {
      await handleConnectSheetData(integration.mapping);
    } else if (integration.mode === 'apps_script') {
      await handleConnectAppsScript(integration.appsScriptUrl);
    }
  };

  // Mutations (with mandatory confirmation dialog when writing back to live Google Sheet / Apps Script)
  const executeSaveFollowUp = async (
    draft: Omit<FollowUp, 'id' | 'createdAt'>
  ) => {
    const newItem: FollowUp = {
      ...draft,
      id: `fu-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    if (integration.mode === 'google_sheets') {
      const token = getSheetsAccessToken();
      if (token && integration.mapping.followUpsTab) {
        await appendRowToGoogleSheet(
          integration.spreadsheetId,
          integration.mapping.followUpsTab,
          [
            newItem.id,
            newItem.partyCode,
            newItem.partyName,
            newItem.outstandingAtFollowUp,
            newItem.contactPerson,
            newItem.contactNumber,
            newItem.followUpDate,
            newItem.followUpTime,
            newItem.status,
            newItem.discussionNotes,
            newItem.commitmentAmount,
            newItem.nextPaymentDate,
            newItem.nextFollowUpDate,
            newItem.paymentMode || '',
            newItem.remarks,
            newItem.userId,
            newItem.createdAt,
          ],
          token
        );
      }
    } else if (integration.mode === 'apps_script' && currentUser) {
      const userObj = users.find((u) => u.id === newItem.userId);
      const [yyyy, mm, dd] = newItem.followUpDate.split('-');
      const ddmmyyyy = dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : newItem.followUpDate;
      await saveRowToAppsScriptSheet(
        integration.appsScriptUrl,
        'Follow up Data',
        'insert',
        {
          id: followUps.length + 1,
          designatedAssociate: userObj?.name || currentUser.name,
          timestamp: new Date().toISOString(),
          amount: newItem.commitmentAmount || '',
          remark: newItem.discussionNotes,
          partyName: newItem.partyName,
          paymentStatus:
            newItem.status === 'Full Payment Received' ||
            newItem.status === 'Part Payment Received'
              ? 'Received'
              : 'Not Received',
          attachment: '',
          actionPoint: newItem.remarks || newItem.discussionNotes,
          nextFollowUpDate: newItem.nextFollowUpDate || newItem.nextPaymentDate || '',
          date: ddmmyyyy,
        }
      );
    }

    setFollowUps((prev) => [newItem, ...prev]);

    // If follow-up reports payment received, add as Tally Unverified receipt immediately
    if (
      (newItem.status === 'Full Payment Received' ||
        newItem.status === 'Part Payment Received') &&
      newItem.commitmentAmount > 0
    ) {
      const unverifiedReceipt: PaymentReceipt = {
        id: `fu-unv-${Date.now()}`,
        voucherRef: 'PENDING-TALLY',
        partyCode: newItem.partyCode,
        partyName: newItem.partyName,
        receivedDate: newItem.followUpDate,
        receivedAmount: newItem.commitmentAmount,
        paymentMode: newItem.paymentMode || 'NEFT',
        utrNumber: 'Tally Unverified',
        bankDetails: 'Pending Tally Verification',
        remarks: newItem.discussionNotes || 'Reported in Follow-up',
        recordedByUserId: newItem.userId,
        source: 'Follow-up (Unverified)',
        createdAt: newItem.createdAt,
      };
      setPayments((prev) => [unverifiedReceipt, ...prev]);
    }
    notify(
      'success',
      'Follow-up Saved',
      draft.commitmentAmount > 0 && draft.nextPaymentDate
        ? `Commitment of ${formatINR(draft.commitmentAmount)} scheduled for ${draft.nextPaymentDate}.`
        : `Follow-up recorded for ${draft.partyName}.`
    );
  };

  const handleSaveFollowUp = (draft: Omit<FollowUp, 'id' | 'createdAt'>) => {
    if (integration.mode !== 'sandbox') {
      setConfirmState({
        isOpen: true,
        title: 'Write Follow-up to Connected Sheet?',
        description: `This will append a new follow-up row for ${draft.partyName} (${draft.partyCode}) to your connected ${
          integration.mode === 'google_sheets' ? 'Google Sheet' : 'Apps Script API'
        }.`,
        confirmLabel: 'Confirm & Write Row',
        details: [
          `Status: ${draft.status}`,
          draft.commitmentAmount > 0
            ? `Promised Commitment: ${formatINR(draft.commitmentAmount)} on ${draft.nextPaymentDate}`
            : 'No payment commitment entered',
        ],
        onConfirm: () => executeSaveFollowUp(draft),
      });
      return;
    }
    void executeSaveFollowUp(draft);
  };

  const executeSavePayment = async (
    draft: Omit<PaymentReceipt, 'id' | 'createdAt' | 'source'>
  ) => {
    // Prevent duplicate UTR / voucherRef
    const dup = payments.find(
      (p) =>
        p.utrNumber.toLowerCase() === draft.utrNumber.toLowerCase() ||
        p.voucherRef.toLowerCase() === draft.voucherRef.toLowerCase()
    );
    if (dup) {
      notify(
        'error',
        'Duplicate Payment Blocked',
        `UTR / Reference ${draft.utrNumber} has already been recorded for ${dup.partyName}.`
      );
      return;
    }

    const newReceipt: PaymentReceipt = {
      ...draft,
      id: `pay-${Date.now()}`,
      source: 'Manual',
      createdAt: new Date().toISOString(),
    };

    if (integration.mode === 'google_sheets') {
      const token = getSheetsAccessToken();
      if (token && integration.mapping.paymentsTab) {
        await appendRowToGoogleSheet(
          integration.spreadsheetId,
          integration.mapping.paymentsTab,
          [
            newReceipt.id,
            newReceipt.voucherRef,
            newReceipt.partyCode,
            newReceipt.partyName,
            newReceipt.receivedDate,
            newReceipt.receivedAmount,
            newReceipt.paymentMode,
            newReceipt.utrNumber,
            newReceipt.bankDetails,
            newReceipt.remarks,
            newReceipt.recordedByUserId,
            newReceipt.source,
            newReceipt.createdAt,
          ],
          token
        );
      }
    } else if (integration.mode === 'apps_script' && currentUser) {
      await callAppsScriptApi(
        integration.appsScriptUrl,
        'RECORD_PAYMENT',
        newReceipt as unknown as Record<string, unknown>,
        currentUser.email,
        currentUser.role
      );
    }

    setPayments((prev) => [newReceipt, ...prev]);
    // Update party's outstanding & overdue balances immediately
    setParties((prev) =>
      prev.map((p) => {
        if (p.customerCode !== newReceipt.partyCode) return p;
        const nextOutstanding = Math.max(
          0,
          p.totalOutstanding - newReceipt.receivedAmount
        );
        const nextOverdue = Math.max(
          0,
          Math.min(nextOutstanding, p.overdueAmount - newReceipt.receivedAmount)
        );
        return {
          ...p,
          totalOutstanding: nextOutstanding,
          overdueAmount: nextOverdue,
        };
      })
    );

    notify(
      'success',
      'Payment Recovery Recorded',
      `${formatINR(newReceipt.receivedAmount)} credited to ${newReceipt.partyName}.`
    );
  };

  const handleSavePayment = (
    draft: Omit<PaymentReceipt, 'id' | 'createdAt' | 'source'>
  ) => {
    if (!currentUser) return;
    if (currentUser.role !== 'Admin' && !currentUser.canRecordPayment) {
      notify('error', 'Permission Denied', 'You are not authorized to record payments.');
      return;
    }

    if (integration.mode !== 'sandbox') {
      setConfirmState({
        isOpen: true,
        title: 'Record Payment in Connected Sheet?',
        description: `This will append a payment receipt of ${formatINR(
          draft.receivedAmount
        )} for ${draft.partyName} to your connected backend.`,
        confirmLabel: 'Confirm & Record Receipt',
        details: [
          `UTR / Ref: ${draft.utrNumber}`,
          `Payment Mode: ${draft.paymentMode}`,
          `Date: ${draft.receivedDate}`,
        ],
        onConfirm: () => executeSavePayment(draft),
      });
      return;
    }
    void executeSavePayment(draft);
  };

  const handleReassignParty = (partyCode: string, newUserId: string) => {
    if (!currentUser || currentUser.role !== 'Admin') return;
    const targetUser = users.find((u) => u.id === newUserId);
    setParties((prev) =>
      prev.map((p) =>
        p.customerCode === partyCode ? { ...p, assignedUserId: newUserId } : p
      )
    );
    notify(
      'success',
      'Party Reassigned',
      `${partyCode} is now assigned to ${targetUser?.name || newUserId}.`
    );
  };

  const handleSyncUserSheet = () => {
    const token = getSheetsAccessToken();
    if (!token) {
      notify('error', 'Google Sign-In Required', 'Please Sign in with Google first.');
      return;
    }
    const targetId = integration.spreadsheetId || TARGET_SPREADSHEET_ID;
    setConfirmState({
      isOpen: true,
      title: 'Create / Initialize USER Sheet Tab?',
      description: `This will ensure the "USER" tab exists in spreadsheet ${targetId} with columns: USER ID, USER NAME, USER PASSWORD, ROLE, CRAETED DATE AND TIME, PAGE ACCESS.`,
      confirmLabel: 'Create / Sync USER Tab',
      details: [
        `Target Spreadsheet: ${integration.spreadsheetTitle || targetId}`,
        `If rows 2+ are empty, ${users.length} user record(s) will be seeded.`,
      ],
      onConfirm: async () => {
        const res = await ensureUserSheetInSpreadsheet(targetId, token, users);
        setIntegration((prev) => ({
          ...prev,
          spreadsheetId: targetId,
          mapping: { ...prev.mapping, usersTab: res.tabTitle },
        }));
        notify(
          'success',
          res.createdTab ? 'USER Tab Created' : 'USER Tab Synchronized',
          res.rowsWritten > 0
            ? `Populated ${res.rowsWritten} user rows into "${res.tabTitle}".`
            : `Verified headers in "${res.tabTitle}" (existing rows preserved).`
        );
      },
    });
  };

  const executeCreateUser = async (created: User) => {
    if (integration.mode === 'google_sheets') {
      const token = getSheetsAccessToken();
      const targetId = integration.spreadsheetId || TARGET_SPREADSHEET_ID;
      if (token) {
        let userTab = integration.mapping.usersTab || 'USER';
        if (!integration.mapping.usersTab) {
          const ensured = await ensureUserSheetInSpreadsheet(targetId, token, users);
          userTab = ensured.tabTitle;
          setIntegration((prev) => ({
            ...prev,
            mapping: { ...prev.mapping, usersTab: userTab },
          }));
        }
        await appendRowToGoogleSheet(
          targetId,
          userTab,
          [
            created.id,
            created.name,
            created.password || created.demoPin || '1234',
            created.role,
            created.createdAt || formatSheetTimestamp(),
            serializePageAccess(created.pageAccess),
          ],
          token
        );
      }
    } else if (integration.mode === 'apps_script' && currentUser) {
      await saveRowToAppsScriptSheet(
        integration.appsScriptUrl,
        'USER',
        'insert',
        {
          userName: created.name,
          userId: created.id,
          userPassword: created.password || created.demoPin || '1234',
          role: created.role === 'Admin' ? 'Admin' : 'User',
          craetedDateAndTime: created.createdAt || formatSheetTimestamp(),
          pageAccess: serializePageAccess(created.pageAccess),
        }
      );
    }

    setUsers((prev) => [...prev, created]);
    notify(
      'success',
      'User Created',
      `${created.name} (${created.id}) added as ${created.role}.`
    );
  };

  const handleCreateUser = (created: User) => {
    if (integration.mode !== 'sandbox') {
      setConfirmState({
        isOpen: true,
        title: 'Add New User to Connected Sheet?',
        description: `This will append ${created.name} (${created.id}) to the USER sheet tab.`,
        confirmLabel: 'Create & Write User',
        details: [
          `USER ID: ${created.id}`,
          `ROLE: ${created.role}`,
          `PAGE ACCESS: ${serializePageAccess(created.pageAccess)}`,
        ],
        onConfirm: () => executeCreateUser(created),
      });
      return;
    }
    void executeCreateUser(created);
  };

  const handleUpdateUserPageAccess = (
    userId: string,
    pageAccess: NavSection[] | 'ALL'
  ) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, pageAccess } : u))
    );
    if (currentUser?.id === userId) {
      setCurrentUser((prev) => (prev ? { ...prev, pageAccess } : prev));
    }
    notify('success', 'Page Access Updated', `Permissions saved for ${userId}.`);
  };

  const executeSaveInterest = async (
    draft: Omit<
      InterestUpdateEntry,
      'id' | 'calculatedInterest' | 'totalPayableWithInterest' | 'timestamp'
    >,
    updateRowIndex?: number
  ) => {
    const timestamp = formatSheetTimestamp();
    const calculatedInterest = calculateInterestAmount(
      draft.invoiceAmount,
      draft.ratePct,
      draft.rateBasis,
      draft.numberOfDays
    );
    const totalPayableWithInterest = draft.invoiceAmount + calculatedInterest;

    const entry: InterestUpdateEntry = {
      ...draft,
      id: updateRowIndex ? `int-row-${updateRowIndex}` : `int-${Date.now()}`,
      timestamp,
      calculatedInterest,
      totalPayableWithInterest,
      sheetRowIndex: updateRowIndex,
    };

    if (integration.mode === 'google_sheets') {
      const token = getSheetsAccessToken();
      const targetId = integration.spreadsheetId || TARGET_SPREADSHEET_ID;
      const interestTab = integration.mapping.interestTab || 'Interest Update';
      const rowValues: Array<string | number> = [
        entry.vchNo,
        entry.timestamp,
        entry.interestRateRaw,
        entry.numberOfDays,
        entry.invoiceAmount,
      ];
      if (token) {
        if (updateRowIndex && updateRowIndex >= 2) {
          await updateRowInGoogleSheet(
            targetId,
            interestTab,
            updateRowIndex,
            rowValues,
            token
          );
        } else {
          await appendRowToGoogleSheet(targetId, interestTab, rowValues, token);
        }
      }
    } else if (integration.mode === 'apps_script' && currentUser) {
      await saveRowToAppsScriptSheet(
        integration.appsScriptUrl,
        'Interest Update',
        updateRowIndex && updateRowIndex >= 2 ? 'update' : 'insert',
        {
          ...(updateRowIndex && updateRowIndex >= 2 ? { rowIndex: updateRowIndex } : {}),
          vchNo: entry.vchNo,
          timestamp: new Date().toISOString(),
          interestRate: entry.interestRateRaw,
          numberOfDays: `${entry.numberOfDays} days`,
          invoiceAmount: entry.invoiceAmount,
        }
      );
    }

    setInterestUpdates((prev) => {
      if (updateRowIndex && updateRowIndex >= 2) {
        return prev.map((item) =>
          item.sheetRowIndex === updateRowIndex ? { ...item, ...entry } : item
        );
      }
      return [...prev, entry];
    });

    notify(
      'success',
      updateRowIndex ? 'Interest Row Updated' : 'Interest Saved',
      `${entry.vchNo}: ${entry.interestRateRaw} for ${entry.numberOfDays} days (+${formatINR(
        calculatedInterest
      )})`
    );
  };

  const handleSaveInterest = (
    draft: Omit<
      InterestUpdateEntry,
      'id' | 'calculatedInterest' | 'totalPayableWithInterest' | 'timestamp'
    >,
    updateRowIndex?: number
  ) => {
    const previewInt = calculateInterestAmount(
      draft.invoiceAmount,
      draft.ratePct,
      draft.rateBasis,
      draft.numberOfDays
    );
    if (integration.mode !== 'sandbox') {
      setConfirmState({
        isOpen: true,
        title: updateRowIndex
          ? `Update Row #${updateRowIndex} in Interest Update Sheet?`
          : 'Save Interest Update to Google Sheet?',
        description: `This will ${
          updateRowIndex ? `update row ${updateRowIndex}` : 'append a new row'
        } in "${integration.mapping.interestTab || 'Interest Update'}" for voucher ${
          draft.vchNo
        }.`,
        confirmLabel: updateRowIndex ? 'Confirm & Update Row' : 'Confirm & Append Row',
        details: [
          `Vch No.: ${draft.vchNo}`,
          `Interest Rate: ${draft.interestRateRaw} · ${draft.numberOfDays} days`,
          `Invoice Amount: ${formatINR(draft.invoiceAmount)} (+${formatINR(
            previewInt
          )} interest)`,
        ],
        onConfirm: () => executeSaveInterest(draft, updateRowIndex),
      });
      return;
    }
    void executeSaveInterest(draft, updateRowIndex);
  };

  const handleApplyTallyDiff = (diff: TallyDiffResult) => {
    setConfirmState({
      isOpen: true,
      title: 'Apply Tally Reconciliation?',
      description:
        'Update party outstanding balances and import deduplicated Tally receipts while preserving all existing follow-up history and user assignments.',
      confirmLabel: 'Apply Sync',
      details: [
        `New Parties Added: ${diff.newParties.length}`,
        `Parties Updated: ${diff.updatedPartiesCount}`,
        `New Receipts Imported: ${diff.newReceipts.length} (${diff.duplicateReceiptsSkipped} duplicate(s) skipped)`,
      ],
      onConfirm: () => {
        setParties(diff.mergedParties);
        setPayments(diff.mergedPayments);
        setSyncLogs((prev) => [diff.log, ...prev]);
        notify(
          'success',
          'Tally Sync Applied',
          `Updated ${diff.updatedPartiesCount} parties and imported ${diff.newReceipts.length} receipts.`
        );
      },
    });
  };

  // Unauthenticated Screen
  if (!currentUser) {
    return (
      <MotionConfig reducedMotion="user">
        <LoginScreen
          users={users}
          onCredentialLogin={(u) => {
            setCurrentUser(u);
            notify('info', `Welcome, ${u.name}`, `Signed in as ${u.role}`);
          }}
          onGoogleLogin={handleGoogleSignIn}
          isGoogleLoading={isGoogleLoading}
          authError={authError}
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) =>
            setToasts((prev) => prev.filter((t) => t.id !== id))
          }
        />
      </MotionConfig>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.nonAdminOnly && currentUser.role === 'Admin') return false;
    return hasPageAccess(currentUser, item.id);
  });
  const currentNavMeta = NAV_ITEMS.find((n) => n.id === activeSection);
  const canRecordPayment =
    currentUser.role === 'Admin' || currentUser.canRecordPayment;

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[#FBF7F2] flex">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
            className="fixed inset-0 z-30 bg-stone-950/40 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-[#EAE2D9] text-stone-700 flex flex-col shrink-0 transition-transform duration-200 lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-[#EAE2D9] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#EA580C] shadow-[0_6px_14px_-4px_rgba(234,88,12,0.45)] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-stone-900 block truncate">
                Piramal Petroleum
              </span>
              <span className="text-[11px] text-stone-500 block truncate">
                Recovery Management
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden text-stone-400 hover:text-stone-800 p-1"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-white'
                    : 'text-stone-600 hover:bg-orange-50/70 hover:text-stone-900'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                    className="absolute inset-0 bg-[#EA580C] rounded-xl shadow-[0_6px_16px_-6px_rgba(234,88,12,0.5)]"
                  />
                )}
                <Icon className="w-4 h-4 shrink-0 relative z-10" />
                <span className="truncate relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-[#EAE2D9] bg-gradient-to-b from-[#FAF5EE] to-[#F5EDE2]">
          <div className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/80 border border-[#EAE2D9]/80 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#EA580C]/10 text-[#C2410C] font-bold text-xs flex items-center justify-center shrink-0">
                {currentUser.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-[#C2410C] font-medium truncate">
                  {currentUser.role}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 text-stone-500 hover:text-[#EA580C] hover:bg-orange-100/70 rounded-lg transition-colors shrink-0"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] font-medium text-stone-500">
            Developed by <span className="text-[#C2410C] font-semibold">Deepak Sahu</span>
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-[#EAE2D9] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-stone-600 hover:text-stone-900 rounded-lg border border-[#EAE2D9]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 truncate">
                {currentNavMeta?.label || 'Dashboard'}
              </h1>
              <p className="text-[11px] text-stone-500 hidden sm:block truncate">
                {integration.mode === 'google_sheets'
                  ? `Google Sheet: ${integration.spreadsheetTitle}`
                  : integration.mode === 'apps_script'
                  ? 'Apps Script Web App Connected'
                  : 'Sample Workspace · Connect Google Sheet in Settings'}
              </p>
            </div>
          </div>

          {/* Global Party Search */}
          <div className="relative flex-1 max-w-md hidden md:block">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onFocus={() => setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 180)}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowSearchDropdown(true);
              }}
              placeholder="Global search: Party Name or Customer Code..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-[#E2D8CE] rounded-xl bg-[#FBF7F2] focus:bg-white focus:outline-none focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
            />
            <AnimatePresence>
              {showSearchDropdown && searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
                  className="absolute left-0 right-0 mt-1.5 bg-white border border-[#EAE2D9] rounded-xl shadow-lg overflow-hidden z-30"
                >
                  {searchResults.map((p) => (
                    <button
                      key={p.customerCode}
                      type="button"
                      onMouseDown={() => openPartyProfile(p)}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-orange-50/70 flex items-center justify-between gap-3 border-b last:border-b-0 border-[#F4ECE3]"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-stone-900 truncate">
                          {p.partyName}
                        </p>
                        <p className="text-[11px] font-mono text-stone-500">
                          {p.customerCode} · {p.assignedUserName}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-semibold text-stone-900 shrink-0">
                        {formatINR(p.totalOutstanding)}
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Primary Top Action */}
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
              disabled={isSyncBusy}
              onClick={() => handleConnectAppsScript(defaultScriptUrl)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#EA580C] bg-orange-50 border border-orange-200 hover:bg-orange-100/80 rounded-xl whitespace-nowrap shrink-0 transition-colors"
              title="Fetch fresh data from Google Sheet tabs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncBusy ? 'animate-spin' : ''}`}
              />
              <span>{isSyncBusy ? 'Syncing...' : 'Sync Live Sheet'}</span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
              onClick={() => {
                setFollowUpModalParty(null);
                setIsFollowUpModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-xl shadow-[0_6px_14px_-6px_rgba(234,88,12,0.5)] whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Follow-up</span>
            </motion.button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <MotionPage key={activeSection}>
          {activeSection === 'dashboard' && (
            <DashboardView
              metrics={dashboardMetrics}
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
              customStart={customStart}
              customEnd={customEnd}
              setCustomStart={setCustomStart}
              setCustomEnd={setCustomEnd}
              todayISO={todayISO}
              currentUser={currentUser}
              parties={enrichedScopedParties}
              onNavigate={navigateTo}
              onSelectParty={openPartyProfile}
            />
          )}

          {activeSection === 'my_outstanding' && (
            <PartyListView
              title={`My Outstanding Parties (${currentUser.name})`}
              subtitle="Customer ledger balances assigned specifically to your account"
              parties={myAssignedParties}
              users={users}
              isAdmin={false}
              onSelectParty={openPartyProfile}
            />
          )}

          {activeSection === 'all_parties' &&
            (currentUser.role === 'Admin' ? (
              <PartyListView
                title="All Outstanding Parties (Company-wide)"
                subtitle="Complete Tally customer outstanding ledger across all collection officers"
                parties={enrichedScopedParties}
                users={users}
                isAdmin={true}
                onSelectParty={openPartyProfile}
              />
            ) : (
              <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
                <ShieldAlert className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-stone-900">
                  Access Restricted
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Only Administrators can view all company parties.
                </p>
              </div>
            ))}

          {activeSection === 'follow_ups' && (
            <FollowUpsView
              followUps={scopedWorkspace.followUps}
              parties={enrichedScopedParties}
              users={scopedWorkspace.users}
              isAdmin={currentUser.role === 'Admin'}
              onAddFollowUp={(party) => {
                setFollowUpModalParty(party || null);
                setIsFollowUpModalOpen(true);
              }}
              onSelectPartyByCode={openPartyByCode}
            />
          )}

          {activeSection === 'commitments' && (
            <CommitmentsView
              commitments={scopedCommitments}
              parties={enrichedScopedParties}
              users={scopedWorkspace.users}
              canRecordPayment={canRecordPayment}
              onSelectPartyByCode={openPartyByCode}
              onRecordPaymentForParty={(party) => {
                setPaymentModalParty(party);
                setIsPaymentModalOpen(true);
              }}
            />
          )}

          {activeSection === 'payment_recovery' && (
            <PaymentRecoveryView
              payments={scopedWorkspace.payments}
              commitments={scopedCommitments}
              totalOutstanding={dashboardMetrics.totalOutstanding}
              users={scopedWorkspace.users}
              todayISO={todayISO}
              canRecordPayment={canRecordPayment}
              onOpenRecordPayment={() => {
                setPaymentModalParty(null);
                setIsPaymentModalOpen(true);
              }}
              onSelectPartyByCode={openPartyByCode}
            />
          )}

          {activeSection === 'interest_management' && (
            <InterestManagementView
              interestUpdates={scopedInterestUpdates}
              invoices={scopedInvoices}
              creditNotes={scopedCreditNotes}
              parties={enrichedScopedParties}
              currentUser={currentUser}
              isLiveSheet={integration.mode === 'google_sheets'}
              initialVoucherNo={interestPreFillVch}
              onClearInitialVoucher={() => setInterestPreFillVch('')}
              onSaveInterest={handleSaveInterest}
              onSelectPartyByCode={openPartyByCode}
            />
          )}

          {activeSection === 'call_history' && (
            <CallHistoryView
              parties={enrichedScopedParties}
              followUps={scopedWorkspace.followUps}
              users={users}
              onSelectParty={openPartyProfile}
            />
          )}

          {activeSection === 'calendar' && (
            <CalendarView
              todayISO={todayISO}
              parties={enrichedScopedParties}
              followUps={scopedWorkspace.followUps}
              commitments={scopedCommitments}
              payments={scopedWorkspace.payments}
              users={users}
              onSelectParty={openPartyProfile}
            />
          )}

          {activeSection === 'reports' && (
            <ReportsView
              parties={enrichedScopedParties}
              payments={scopedWorkspace.payments}
              followUps={scopedWorkspace.followUps}
              commitments={scopedCommitments}
              users={currentUser.role === 'Admin' ? users : [currentUser]}
              currentUser={currentUser}
              todayISO={todayISO}
            />
          )}

          {activeSection === 'user_performance' && (
            <UserPerformanceView
              users={scopedWorkspace.users}
              parties={scopedWorkspace.parties}
              payments={scopedWorkspace.payments}
              followUps={scopedWorkspace.followUps}
              currentUser={currentUser}
              todayISO={todayISO}
            />
          )}

          {activeSection === 'user_management' &&
            currentUser.role === 'Admin' && (
              <UserManagementView
                users={users}
                parties={parties}
                isLiveSheet={integration.mode === 'google_sheets'}
                spreadsheetId={integration.spreadsheetId || TARGET_SPREADSHEET_ID}
                hasGoogleToken={hasGoogleToken}
                onCreateUser={handleCreateUser}
                onSyncUserSheet={handleSyncUserSheet}
                onUpdateUserPageAccess={handleUpdateUserPageAccess}
                onToggleUserActive={(userId) => {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === userId ? { ...u, active: !u.active } : u
                    )
                  );
                }}
                onToggleCanRecordPayment={(userId) => {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.id === userId
                        ? { ...u, canRecordPayment: !u.canRecordPayment }
                        : u
                    )
                  );
                }}
                onReassignParty={handleReassignParty}
              />
            )}

          {activeSection === 'tally_sync' && currentUser.role === 'Admin' && (
            <TallySyncView
              syncLogs={syncLogs}
              parties={parties}
              payments={payments}
              users={users}
              currentUser={currentUser}
              integration={integration}
              isSyncing={isSyncBusy}
              onSyncFromConnectedSource={handleRefreshLiveSync}
              onApplyTallyDiff={handleApplyTallyDiff}
              onOpenSettings={() => navigateTo('settings')}
              onNotify={notify}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              integration={integration}
              hasGoogleToken={hasGoogleToken}
              googleEmail={googleEmail}
              currentUser={currentUser}
              isBusy={isSyncBusy}
              onGoogleSignIn={handleGoogleSignIn}
              onAnalyzeSheet={handleAnalyzeSheet}
              onConnectSheetData={handleConnectSheetData}
              onSyncTargetFmsSheet={handleSyncTargetFmsSheet}
              onSyncUserSheet={handleSyncUserSheet}
              onConnectAppsScript={handleConnectAppsScript}
              onResetToSandbox={() => {
                const fresh = createInitialWorkspaceData(todayISO);
                setUsers(fresh.users);
                setParties(fresh.parties);
                setPayments(fresh.payments);
                setFollowUps(fresh.followUps);
                setSyncLogs(fresh.syncLogs);
                setInvoices(fresh.invoices);
                setCreditNotes(fresh.creditNotes);
                setInterestUpdates(fresh.interestUpdates);
                setIntegration({
                  mode: 'sandbox',
                  spreadsheetId: TARGET_SPREADSHEET_ID,
                  spreadsheetTitle: '',
                  appsScriptUrl: '',
                  mapping: {
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
                  lastConnectedAt: null,
                  analyzedTabs: [],
                });
                notify('info', 'Switched to Sandbox Workspace');
              }}
            />
          )}
            </MotionPage>
          </AnimatePresence>
        </main>
      </div>

      {/* Party Profile Drawer */}
      <PartyDetailDrawer
        party={selectedParty}
        onClose={() => {
          setSelectedPartyCode(null);
          window.history.pushState(null, '', `/${activeSection}`);
        }}
        followUps={scopedWorkspace.followUps}
        payments={scopedWorkspace.payments}
        commitments={scopedCommitments}
        invoices={scopedInvoices}
        creditNotes={scopedCreditNotes}
        interestUpdates={scopedInterestUpdates}
        users={scopedWorkspace.users}
        currentUser={currentUser}
        onAddFollowUp={(p) => {
          setFollowUpModalParty(p);
          setIsFollowUpModalOpen(true);
        }}
        onRecordPayment={(p) => {
          setPaymentModalParty(p);
          setIsPaymentModalOpen(true);
        }}
        onReassignParty={handleReassignParty}
        onUpdateInterest={(vchNo) => {
          setSelectedPartyCode(null);
          setInterestPreFillVch(vchNo);
          navigateTo('interest_management');
        }}
      />

      {/* Follow-up Modal */}
      <FollowUpModal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        parties={enrichedScopedParties}
        initialParty={followUpModalParty}
        currentUser={currentUser}
        onSave={handleSaveFollowUp}
      />

      {/* Payment Recovery Modal */}
      <PaymentRecoveryModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        parties={enrichedScopedParties}
        initialParty={paymentModalParty}
        currentUser={currentUser}
        users={users}
        onSave={handleSavePayment}
      />

      {/* Confirmation Dialog */}
      <ConfirmationModal
        state={confirmState}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Toast Notifications */}
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
    </MotionConfig>
  );
}
