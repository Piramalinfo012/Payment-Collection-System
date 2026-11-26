import React, { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Database,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  SearchCode,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  IntegrationConfig,
  SheetMappingConfig,
  User,
} from '../../types';
import {
  generateAppsScriptTemplate,
  TARGET_SPREADSHEET_ID,
  validateAppsScriptUrl,
} from '../../services/googleSheetsService';
import { StatusText } from '../ui/CommonUI';
import { EASE_OUT_EXPO, MotionCard } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

interface SettingsViewProps {
  integration: IntegrationConfig;
  hasGoogleToken: boolean;
  googleEmail: string | null;
  currentUser: User;
  isBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
  onAnalyzeSheet: (sheetUrlOrId: string) => Promise<void>;
  onConnectSheetData: (mapping: SheetMappingConfig) => Promise<void>;
  onSyncTargetFmsSheet: () => Promise<void>;
  onSyncUserSheet: () => void;
  onConnectAppsScript: (scriptUrl: string) => Promise<void>;
  onResetToSandbox: () => void;
}

export function SettingsView({
  integration,
  hasGoogleToken,
  googleEmail,
  currentUser,
  isBusy,
  onGoogleSignIn,
  onAnalyzeSheet,
  onConnectSheetData,
  onSyncTargetFmsSheet,
  onSyncUserSheet,
  onConnectAppsScript,
  onResetToSandbox,
}: SettingsViewProps) {
  const [sheetInput, setSheetInput] = useState(
    integration.spreadsheetId || TARGET_SPREADSHEET_ID
  );
  const [scriptInput, setScriptInput] = useState(integration.appsScriptUrl || '');
  const [mapping, setMapping] = useState<SheetMappingConfig>(integration.mapping);
  const [copiedCode, setCopiedCode] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    setMapping(integration.mapping);
    if (integration.spreadsheetId) {
      setSheetInput(integration.spreadsheetId);
    }
  }, [integration.mapping, integration.spreadsheetId]);

  const isAdmin = currentUser.role === 'Admin';
  const appsScriptCode = generateAppsScriptTemplate(mapping);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(appsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAnalyzeSheet(sheetInput);
  };

  const handleAppsScriptConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setScriptError(null);
    const check = validateAppsScriptUrl(scriptInput);
    if (!check.valid) {
      setScriptError(check.error || 'Invalid URL');
      return;
    }
    await onConnectAppsScript(scriptInput);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status Overview */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            Backend Integration & Google Sheet Structure Analyzer
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Primary Sheet: <span className="font-mono">{TARGET_SPREADSHEET_ID}</span> (FOLLOW UP, INVOICE DETAILS, SALES DATA, RECEIPT REGISTER, AGING DATA, CREDIT NOTE, Interest Update, USER)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusText
            label={
              integration.mode === 'google_sheets'
                ? `Connected: ${integration.spreadsheetTitle || 'New Payment Collection FMS'}`
                : integration.mode === 'apps_script'
                ? 'Connected: Google Apps Script API'
                : 'Workspace Sandbox Mode'
            }
            tone={integration.mode === 'sandbox' ? 'info' : 'success'}
          />
          {integration.mode !== 'sandbox' && isAdmin && (
            <button
              type="button"
              onClick={onResetToSandbox}
              className="px-3 py-1.5 text-xs border border-[#E2D8CE] rounded-lg text-stone-700 hover:bg-[#FAF6F1]"
            >
              Switch to Sandbox
            </button>
          )}
        </div>
      </MotionCard>

      {!isAdmin && (
        <MotionCard
          delay={0.04}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800"
        >
          Spreadsheet connection, column mapping, and Apps Script configuration are restricted to Administrators. You may verify your Google sign-in session below.
        </MotionCard>
      )}

      {/* 1. Direct Google Sheets API + Analyzer */}
      <MotionCard
        delay={0.06}
        className="bg-white border border-[#EAE2D9] rounded-xl p-5 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0">
              <SearchCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                1. Live Google Sheet Sync & Tab Structure
              </h3>
              <p className="text-xs text-stone-500">
                Reads all tabs, headers, and formulas directly without altering existing Tally/FMS layouts
              </p>
            </div>
          </div>

          {!hasGoogleToken ? (
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                </div>
                <span>Sign in with Google to Access Sheets</span>
              </div>
            </button>
          ) : (
            <StatusText
              label={`Google Authorized (${googleEmail || 'Active Session'})`}
              tone="success"
            />
          )}
        </div>

        {isAdmin && (
          <div className="space-y-3">
            <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                required
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                placeholder="Paste Google Sheet URL or Spreadsheet ID"
                className="flex-1 px-3.5 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
              />
              <button
                type="submit"
                disabled={isBusy || !hasGoogleToken}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                <span>Analyze Sheet Structure</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={isBusy || !hasGoogleToken}
                onClick={onSyncTargetFmsSheet}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
              >
                <Database className="w-4 h-4" />
                <span>1-Click Connect & Load FMS Sheet</span>
              </button>

              <button
                type="button"
                disabled={isBusy || !hasGoogleToken}
                onClick={onSyncUserSheet}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#C2410C] bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Create / Initialize USER Sheet Tab</span>
              </button>
            </div>
          </div>
        )}

        {/* Analyzed Tabs & Formulas */}
        <AnimatePresence>
          {integration.analyzedTabs.length > 0 && isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              className="space-y-4 pt-3 border-t border-[#EAE2D9]"
            >
              <div>
                <h4 className="text-xs font-semibold text-stone-900">
                  Detected Tabs, Columns & Formulas ({integration.spreadsheetTitle})
                </h4>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {integration.analyzedTabs.map((tab) => (
                    <div
                      key={tab.sheetId}
                      className="p-3.5 rounded-lg border border-[#EAE2D9] bg-[#FAF6F1] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-stone-900">
                          {tab.title}
                        </span>
                        <span className="font-mono text-stone-500">
                          {tab.rowCount} rows · {tab.headers.length} cols
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-600">
                        <strong>Headers:</strong>{' '}
                        {tab.headers.length > 0
                          ? tab.headers.join(' · ')
                          : 'No headers in Row 1'}
                      </div>
                      {tab.detectedFormulas.length > 0 && (
                        <div className="text-[11px] font-mono text-[#9A3412] bg-orange-50 p-2 rounded border border-orange-200">
                          Formulas detected:{' '}
                          {tab.detectedFormulas
                            .slice(0, 3)
                            .map((f) => `${f.cell}: ${f.formula}`)
                            .join(' | ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Extended Tab Mapping */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                {(
                  [
                    ['partiesTab', 'FOLLOW UP / Parties Tab'],
                    ['invoicesTab', 'INVOICE DETAILS Tab'],
                    ['salesTab', 'SALES DATA Tab'],
                    ['agingTab', 'AGING DATA Tab'],
                    ['paymentsTab', 'RECEIPT REGISTER Tab'],
                    ['creditNoteTab', 'CREDIT NOTE Tab'],
                    ['interestTab', 'Interest Update Tab'],
                    ['usersTab', 'USER Tab'],
                    ['followUpsTab', 'Follow-up Log Tab'],
                    ['syncLogsTab', 'Sync History Tab'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">
                      {label}
                    </label>
                    <PremiumSelect
                      value={mapping[field] || ''}
                      onChange={(val) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: val,
                        }))
                      }
                      options={[
                        { value: '', label: '-- Not Mapped --' },
                        ...integration.analyzedTabs.map((t) => ({
                          value: t.title,
                          label: t.title,
                        })),
                      ]}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isBusy || !mapping.partiesTab}
                  onClick={() => onConnectSheetData(mapping)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
                >
                  <Database className="w-4 h-4" />
                  <span>Load & Sync Mapped Sheet Data</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionCard>

      {/* 2. Google Apps Script Web App API */}
      {isAdmin && (
        <MotionCard
          delay={0.12}
          className="bg-white border border-[#EAE2D9] rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#FAF6F1] text-stone-700 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                2. Google Apps Script Web App API Endpoint
              </h3>
              <p className="text-xs text-stone-500">
                Connect your existing Apps Script deployment (`https://script.google.com/macros/s/.../exec`)
              </p>
            </div>
          </div>

          {scriptError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {scriptError}
            </div>
          )}

          <form
            onSubmit={handleAppsScriptConnect}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="url"
              required
              value={scriptInput}
              onChange={(e) => setScriptInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="flex-1 px-3.5 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
            />
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg whitespace-nowrap disabled:opacity-50"
            >
              Connect Apps Script API
            </button>
          </form>

          {/* Copyable Code.gs Blueprint */}
          <div className="pt-3 border-t border-[#EAE2D9]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                <Code2 className="w-4 h-4 text-[#EA580C]" />
                <span>Reference Google Apps Script Adapter (`Code.gs`)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#E2D8CE] rounded-md hover:bg-[#FAF6F1] text-stone-700"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code.gs</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 rounded-lg bg-[#1C1917] text-stone-200 text-[11px] font-mono overflow-x-auto max-h-60">
              {appsScriptCode}
            </pre>
          </div>
        </MotionCard>
      )}
    </div>
  );
}
