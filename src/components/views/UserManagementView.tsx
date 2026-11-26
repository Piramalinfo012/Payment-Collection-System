import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NavSection, Party, User, UserRole } from '../../types';
import { formatSheetTimestamp, serializePageAccess } from '../../services/googleSheetsService';
import { formatINR } from '../../utils/formatters';
import { StatusText } from '../ui/CommonUI';
import { EASE_OUT_EXPO, MotionCard } from '../ui/MotionPrimitives';
import { PremiumSelect } from '../ui/PremiumSelect';

const PAGE_ACCESS_OPTIONS: Array<{ id: NavSection; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'my_outstanding', label: 'My Outstanding' },
  { id: 'all_parties', label: 'All Parties' },
  { id: 'follow_ups', label: 'Payment Follow-ups' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'payment_recovery', label: 'Payment Recovery' },
  { id: 'interest_management', label: 'Interest Update' },
  { id: 'call_history', label: 'Call History' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'reports', label: 'Reports' },
  { id: 'user_performance', label: 'User Performance' },
  { id: 'user_management', label: 'User Management' },
  { id: 'tally_sync', label: 'Tally Sync' },
  { id: 'settings', label: 'Settings' },
];

interface UserManagementViewProps {
  users: User[];
  parties: Party[];
  isLiveSheet: boolean;
  spreadsheetId: string;
  hasGoogleToken: boolean;
  onCreateUser: (user: User) => void;
  onSyncUserSheet: () => void;
  onUpdateUserPageAccess: (userId: string, pageAccess: NavSection[] | 'ALL') => void;
  onToggleUserActive: (userId: string) => void;
  onToggleCanRecordPayment: (userId: string) => void;
  onReassignParty: (partyCode: string, newUserId: string) => void;
}

export function UserManagementView({
  users,
  parties,
  isLiveSheet,
  spreadsheetId,
  hasGoogleToken,
  onCreateUser,
  onSyncUserSheet,
  onUpdateUserPageAccess,
  onToggleUserActive,
  onToggleCanRecordPayment,
  onReassignParty,
}: UserManagementViewProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userIdInput, setUserIdInput] = useState(`USR-${String(users.length + 1).padStart(2, '0')}`);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('1234');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Collection Officer');
  const [role, setRole] = useState<UserRole>('Collection User');
  const [monthlyTarget, setMonthlyTarget] = useState('1500000');
  const [canRecordPayment, setCanRecordPayment] = useState(true);
  const [allPageAccess, setAllPageAccess] = useState(false);
  const [selectedPages, setSelectedPages] = useState<NavSection[]>([
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
  ]);

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [editingAccessUserId, setEditingAccessUserId] = useState<string | null>(null);
  const [editingAccessPages, setEditingAccessPages] = useState<NavSection[]>([]);
  const [editingAccessAll, setEditingAccessAll] = useState(false);

  const [selectedPartyCode, setSelectedPartyCode] = useState(
    parties[0]?.customerCode || ''
  );
  const [targetUserId, setTargetUserId] = useState(
    users[1]?.id || users[0]?.id || ''
  );

  const toggleCreatePage = (sec: NavSection) => {
    setSelectedPages((prev) =>
      prev.includes(sec) ? prev.filter((p) => p !== sec) : [...prev, sec]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !userIdInput.trim() || !password.trim()) return;

    const cleanId = userIdInput.trim().toUpperCase();
    const derivedEmail =
      email.trim().toLowerCase() ||
      `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@piramalpetroleum.com`;
    const pageAccess: NavSection[] | 'ALL' =
      role === 'Admin' || allPageAccess
        ? 'ALL'
        : selectedPages.length > 0
        ? selectedPages
        : ['dashboard', 'my_outstanding', 'follow_ups', 'interest_management'];

    onCreateUser({
      id: cleanId,
      name: name.trim(),
      email: derivedEmail,
      phone: phone.trim(),
      designation: designation.trim() || (role === 'Admin' ? 'Administrator' : 'Collection Officer'),
      role,
      active: true,
      canRecordPayment: role === 'Admin' ? true : canRecordPayment,
      monthlyTarget: Number(monthlyTarget) || 1500000,
      password: password.trim(),
      demoPin: password.trim(),
      createdAt: formatSheetTimestamp(),
      pageAccess,
    });

    setUserIdInput(`USR-${String(users.length + 2).padStart(2, '0')}`);
    setName('');
    setEmail('');
    setPassword('1234');
    setPhone('');
    setShowCreateForm(false);
  };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyCode || !targetUserId) return;
    onReassignParty(selectedPartyCode, targetUserId);
  };

  const startEditAccess = (u: User) => {
    setEditingAccessUserId(u.id);
    if (!u.pageAccess || u.pageAccess === 'ALL') {
      setEditingAccessAll(true);
      setEditingAccessPages(PAGE_ACCESS_OPTIONS.map((o) => o.id));
    } else {
      setEditingAccessAll(false);
      setEditingAccessPages(u.pageAccess);
    }
  };

  const saveEditAccess = (userId: string) => {
    onUpdateUserPageAccess(
      userId,
      editingAccessAll ? 'ALL' : editingAccessPages
    );
    setEditingAccessUserId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <MotionCard className="bg-white border border-[#EAE2D9] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">
            User Management, Credentials & Sheet Page Access
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Synced with Google Sheet tab <span className="font-mono font-semibold text-stone-700">USER</span> (USER ID · USER NAME · USER PASSWORD · ROLE · CRAETED DATE AND TIME · PAGE ACCESS)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={onSyncUserSheet}
            disabled={!hasGoogleToken}
            title={
              hasGoogleToken
                ? `Create or initialize USER tab in spreadsheet ${spreadsheetId}`
                : 'Sign in with Google first to create/sync USER tab'
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg whitespace-nowrap disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>
              {isLiveSheet
                ? 'Create / Sync USER Sheet Tab'
                : 'Create USER Tab in Sheet'}
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>{showCreateForm ? 'Close Form' : 'Add Staff User'}</span>
          </motion.button>
        </div>
      </MotionCard>

      {/* Create User Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            onSubmit={handleCreate}
            className="bg-white border border-[#EAE2D9] rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-stone-900">
              Create New Staff Account (Appends to USER Sheet)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  USER ID *
                </label>
                <input
                  type="text"
                  required
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  placeholder="e.g. USR-05"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  USER NAME *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Amit Kulkarni"
                  className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  USER PASSWORD *
                </label>
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password / PIN"
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  ROLE *
                </label>
                <PremiumSelect
                  value={role}
                  onChange={(val) => {
                    const nextRole = val as UserRole;
                    setRole(nextRole);
                    if (nextRole === 'Admin') setAllPageAccess(true);
                  }}
                  searchable={false}
                  options={[
                    { value: 'Collection User', label: 'Collection User' },
                    { value: 'Admin', label: 'Admin' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Corporate Email (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="amit@piramalpetroleum.com"
                  className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Monthly Target (₹)
                </label>
                <input
                  type="number"
                  value={monthlyTarget}
                  onChange={(e) => setMonthlyTarget(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98..."
                  className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                />
              </div>
            </div>

            {/* PAGE ACCESS selector */}
            <div className="p-4 rounded-xl bg-[#FAF6F1] border border-[#EAE2D9] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800">
                  PAGE ACCESS Permissions
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#C2410C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={role === 'Admin' || allPageAccess}
                    disabled={role === 'Admin'}
                    onChange={(e) => setAllPageAccess(e.target.checked)}
                    className="rounded border-[#E2D8CE] accent-[#EA580C]"
                  />
                  <span>ALL Pages Access</span>
                </label>
              </div>
              {!(role === 'Admin' || allPageAccess) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {PAGE_ACCESS_OPTIONS.filter(
                    (opt) =>
                      opt.id !== 'all_parties' &&
                      opt.id !== 'user_management' &&
                      opt.id !== 'tally_sync'
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className="inline-flex items-center gap-1.5 text-xs text-stone-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPages.includes(opt.id)}
                        onChange={() => toggleCreatePage(opt.id)}
                        className="rounded border-[#E2D8CE] accent-[#EA580C]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={role === 'Admin' ? true : canRecordPayment}
                  disabled={role === 'Admin'}
                  onChange={(e) => setCanRecordPayment(e.target.checked)}
                  className="rounded border-[#E2D8CE] accent-[#EA580C]"
                />
                <span>Authorize user to record payment receipts</span>
              </label>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Create User & Sync
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Quick Party Assignment Panel */}
      <MotionCard
        delay={0.05}
        className="bg-white border border-[#EAE2D9] rounded-xl p-5"
      >
        <form onSubmit={handleAssignSubmit}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[#EA580C]" />
            <h3 className="text-sm font-semibold text-stone-900">
              Assign / Reassign Customer Party
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Select Party
              </label>
              <PremiumSelect
                value={selectedPartyCode}
                onChange={setSelectedPartyCode}
                placeholder="Select Party..."
                searchPlaceholder="Search party name or code..."
                options={parties.map((p) => ({
                  value: p.customerCode,
                  label: p.partyName,
                  subLabel: p.customerCode,
                  badge: formatINR(p.totalOutstanding),
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Assign To Employee
              </label>
              <PremiumSelect
                value={targetUserId}
                onChange={setTargetUserId}
                placeholder="Select Employee..."
                searchPlaceholder="Search employee..."
                options={users
                  .filter((u) => u.active)
                  .map((u) => ({
                    value: u.id,
                    label: u.name,
                    subLabel: `${u.id} · ${u.role}`,
                  }))}
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg h-[34px]"
            >
              Update Party Assignment
            </button>
          </div>
        </form>
      </MotionCard>

      {/* Users Table */}
      <MotionCard
        delay={0.1}
        className="bg-white border border-[#EAE2D9] rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAF6F1] border-b border-[#EAE2D9] text-stone-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">USER ID</th>
                <th className="text-left px-4 py-3 font-semibold">USER NAME</th>
                <th className="text-left px-4 py-3 font-semibold">USER PASSWORD</th>
                <th className="text-left px-4 py-3 font-semibold">ROLE</th>
                <th className="text-left px-4 py-3 font-semibold">CREATED DATE & TIME</th>
                <th className="text-left px-4 py-3 font-semibold">PAGE ACCESS</th>
                <th className="text-right px-4 py-3 font-semibold">Parties</th>
                <th className="text-left px-4 py-3 font-semibold">Payment Entry</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4ECE3]">
              {users.map((u) => {
                const assignedCount = parties.filter(
                  (p) => p.assignedUserId === u.id
                ).length;
                const isRevealed = Boolean(revealedPasswords[u.id]);
                const pwd = u.password || u.demoPin || '1234';
                const accessLabel = serializePageAccess(u.pageAccess);
                const isEditingAccess = editingAccessUserId === u.id;

                return (
                  <React.Fragment key={u.id}>
                    <tr className="hover:bg-orange-50/45 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-stone-900 whitespace-nowrap">
                        {u.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{u.name}</div>
                        <div className="text-[11px] text-stone-500">
                          {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-stone-700">
                          <KeyRound className="w-3 h-3 text-stone-400" />
                          <span>{isRevealed ? pwd : '••••••'}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswords((prev) => ({
                                ...prev,
                                [u.id]: !prev[u.id],
                              }))
                            }
                            className="p-0.5 text-stone-400 hover:text-stone-700"
                            aria-label="Toggle password visibility"
                          >
                            {isRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-medium text-stone-800">
                          {u.role === 'Admin' && (
                            <ShieldCheck className="w-3.5 h-3.5 text-[#EA580C]" />
                          )}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-stone-600 whitespace-nowrap">
                        {u.createdAt || '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[11px] font-mono text-stone-700">
                            {accessLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              isEditingAccess
                                ? setEditingAccessUserId(null)
                                : startEditAccess(u)
                            }
                            className="text-[11px] text-[#C2410C] hover:underline shrink-0"
                          >
                            {isEditingAccess ? 'Close' : 'Edit'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                        {assignedCount}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.role === 'Admin' ? (
                          <span className="text-emerald-700 font-medium">
                            Full Access
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleCanRecordPayment(u.id)}
                            className={`px-2 py-1 rounded border text-[11px] font-medium ${
                              u.canRecordPayment
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-[#FAF6F1] text-stone-600 border-[#EAE2D9]'
                            }`}
                          >
                            {u.canRecordPayment ? 'Authorized' : 'View Only'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusText
                          label={u.active ? 'Active' : 'Deactivated'}
                          tone={u.active ? 'success' : 'danger'}
                        />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {u.email !== 'info@piramalpetroleum.com' &&
                          u.id !== 'USR-ADMIN' && (
                            <button
                              type="button"
                              onClick={() => onToggleUserActive(u.id)}
                              className="px-2.5 py-1 border border-[#E2D8CE] rounded text-[11px] font-medium text-stone-700 hover:bg-[#FAF6F1]"
                            >
                              {u.active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                      </td>
                    </tr>
                    {isEditingAccess && (
                      <tr className="bg-orange-50/50">
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-stone-800">
                                Configure Page Access for {u.name} ({u.id})
                              </span>
                              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C2410C] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingAccessAll}
                                  onChange={(e) => setEditingAccessAll(e.target.checked)}
                                  className="accent-[#EA580C]"
                                />
                                <span>ALL Pages</span>
                              </label>
                            </div>
                            {!editingAccessAll && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                                {PAGE_ACCESS_OPTIONS.map((opt) => (
                                  <label
                                    key={opt.id}
                                    className="inline-flex items-center gap-1.5 text-[11px] text-stone-700 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editingAccessPages.includes(opt.id)}
                                      onChange={() =>
                                        setEditingAccessPages((prev) =>
                                          prev.includes(opt.id)
                                            ? prev.filter((x) => x !== opt.id)
                                            : [...prev, opt.id]
                                        )
                                      }
                                      className="accent-[#EA580C]"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingAccessUserId(null)}
                                className="px-3 py-1 text-xs border border-[#E2D8CE] rounded bg-white text-stone-700 hover:bg-[#FAF6F1]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEditAccess(u.id)}
                                className="px-3 py-1 text-xs rounded bg-[#EA580C] hover:bg-[#C2410C] text-white font-medium"
                              >
                                Save Page Access
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </MotionCard>
    </div>
  );
}
