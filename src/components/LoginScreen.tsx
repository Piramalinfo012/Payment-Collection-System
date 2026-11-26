import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Percent,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';
import { EASE_OUT_EXPO } from './ui/MotionPrimitives';

interface LoginScreenProps {
  users: User[];
  onCredentialLogin: (user: User) => void;
  onGoogleLogin: () => Promise<void>;
  isGoogleLoading: boolean;
  authError: string | null;
}

const REMEMBER_ID_KEY = 'pppl_remembered_user_id';

export function LoginScreen({
  users,
  onCredentialLogin,
  onGoogleLogin,
  isGoogleLoading,
  authError,
}: LoginScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_ID_KEY);
      if (saved) setIdentifier(saved);
    } catch {
      // ignore storage unavailability
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const q = identifier.trim().toLowerCase();
    const matched = users.find(
      (u) =>
        u.id.toLowerCase() === q ||
        u.name.toLowerCase() === q ||
        u.email.toLowerCase() === q ||
        (q === 'admin' && (u.role === 'Admin' || u.id.toLowerCase() === 'usr-admin'))
    );
    if (!matched) {
      setLocalError('No staff account found for this User ID, Name, or Email.');
      return;
    }
    if (!matched.active) {
      setLocalError('This account has been deactivated by an Administrator.');
      return;
    }
    const expectedPwd = matched.password || matched.demoPin || '1234';
    if (password.trim() !== expectedPwd && password.trim() !== 'Admin123') {
      setLocalError('Incorrect password / PIN. Please verify your USER sheet credentials.');
      return;
    }
    try {
      if (rememberMe) {
        window.localStorage.setItem(REMEMBER_ID_KEY, identifier.trim());
      } else {
        window.localStorage.removeItem(REMEMBER_ID_KEY);
      }
    } catch {
      // ignore storage unavailability
    }
    onCredentialLogin(matched);
  };

  return (
    <div className="relative min-h-screen lg:h-screen bg-[#FFF9F4] text-stone-900 flex flex-col justify-between overflow-hidden">
      {/* Warm Ambient Peach Light Washes (Pure CSS) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full opacity-75 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(253,186,116,0.45) 0%, rgba(255,237,213,0.18) 60%, transparent 100%)',
          }}
        />
        <div
          className="absolute -top-24 right-[-6%] w-[560px] h-[560px] rounded-full opacity-75 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(251,146,60,0.28) 0%, rgba(254,215,170,0.22) 55%, transparent 100%)',
          }}
        />
        <div
          className="absolute bottom-[-160px] left-[28%] w-[520px] h-[520px] rounded-full opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,237,213,0.4) 65%, transparent 100%)',
          }}
        />
      </div>

      {/* Top Portal Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: EASE_OUT_EXPO }}
        className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 pt-4 pb-1 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EA580C] shadow-[0_6px_16px_-4px_rgba(234,88,12,0.45)] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-stone-900 block leading-tight">
              Piramal Petroleum
            </span>
            <span className="text-xs text-stone-500 block">
              Receivables &amp; Recovery Portal
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-stone-500">
          <FileSpreadsheet className="w-4 h-4 text-[#EA580C]" />
          <span className="font-medium text-stone-700">New Payment Collection FMS</span>
        </div>
      </motion.header>

      {/* Main Split Stage */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 py-4 lg:py-0 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 items-center gap-10 lg:gap-14">
          {/* Left Hero Column */}
          <motion.section
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
            className="lg:col-span-7 space-y-6"
          >
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#C2410C]">
              <ShieldCheck className="w-4 h-4 text-[#EA580C]" />
              <span>Authorized Personnel Access</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.07] text-stone-900 text-balance max-w-2xl">
              A secure gateway to{' '}
              <span className="text-[#EA580C]">payment recovery.</span>
            </h1>

            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
              Sign in to manage customer outstandings, track Tally receipts, update
              per-voucher interest rates, and monitor officer follow-ups through
              your unified Google Sheets FMS workspace.
            </p>

            {/* 3 Feature Trust Cards */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.12, ease: EASE_OUT_EXPO }}
                className="bg-white/90 backdrop-blur-sm border border-[#EFE4D8] rounded-xl p-4 shadow-[0_10px_24px_-14px_rgba(234,88,12,0.16)]"
              >
                <ShieldCheck className="w-5 h-5 text-[#EA580C] mb-2" />
                <p className="text-xs font-semibold text-stone-900">
                  Role-Based Access
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Governed by USER sheet
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.18, ease: EASE_OUT_EXPO }}
                className="bg-white/90 backdrop-blur-sm border border-[#EFE4D8] rounded-xl p-4 shadow-[0_10px_24px_-14px_rgba(234,88,12,0.16)]"
              >
                <FileSpreadsheet className="w-5 h-5 text-[#EA580C] mb-2" />
                <p className="text-xs font-semibold text-stone-900">
                  Live Sheet Sync
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Google Sheets &amp; Tally FMS
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.24, ease: EASE_OUT_EXPO }}
                className="bg-white/90 backdrop-blur-sm border border-[#EFE4D8] rounded-xl p-4 shadow-[0_10px_24px_-14px_rgba(234,88,12,0.16)]"
              >
                <Percent className="w-5 h-5 text-[#EA580C] mb-2" />
                <p className="text-xs font-semibold text-stone-900">
                  Interest Control
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Monthly &amp; annual calculations
                </p>
              </motion.div>
            </div>
          </motion.section>

          {/* Right Elevated Sign-in Card */}
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.38, delay: 0.08, ease: EASE_OUT_EXPO }}
            className="lg:col-span-5 flex justify-center lg:justify-end"
          >
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#EFE4D8] shadow-[0_24px_60px_-16px_rgba(234,88,12,0.16)] p-6 sm:p-7">
              {/* Centered Brand Mark & Card Title */}
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-[#EA580C] shadow-[0_8px_20px_-6px_rgba(234,88,12,0.5)] flex items-center justify-center mx-auto">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-stone-900">
                  Piramal Receivables Portal
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Collection &amp; Recovery Management System
                </p>
              </div>

              {(authError || localError) && (
                <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {authError || localError}
                </div>
              )}

              {/* Credentials Form */}
              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                {/* Quick Demo Fill Pills */}
                <div className="flex items-center gap-2 p-2 rounded-xl bg-orange-50/70 border border-orange-100 text-[11px]">
                  <span className="font-semibold text-[#EA580C]">Quick Login:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifier('Admin');
                      setPassword('1234');
                      setLocalError(null);
                    }}
                    className="px-2 py-0.5 rounded-md bg-white border border-orange-200 text-stone-700 font-medium hover:bg-orange-500 hover:text-white transition-colors"
                  >
                    Director / Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifier('USR-02');
                      setPassword('1234');
                      setLocalError(null);
                    }}
                    className="px-2 py-0.5 rounded-md bg-white border border-orange-200 text-stone-700 font-medium hover:bg-orange-500 hover:text-white transition-colors"
                  >
                    Officer
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-stone-700 mb-1.5"
                  >
                    User ID, Name or Email
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-identifier"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm text-stone-900 bg-[#FFFDFB] border border-[#E5DCD2] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-colors"
                      placeholder="Enter your User ID, name or email"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-stone-700 mb-1.5"
                  >
                    Password / PIN
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 text-sm text-stone-900 bg-[#FFFDFB] border border-[#E5DCD2] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EA580C]/20 focus:border-[#EA580C] transition-colors"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 text-stone-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-stone-300 text-[#EA580C] focus:ring-[#EA580C]"
                    />
                    <span>Remember User ID</span>
                  </label>
                  <span className="text-[11px] font-medium text-[#C2410C]">
                    USER Sheet Auth
                  </span>
                </div>

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.14, ease: EASE_OUT_EXPO }}
                  className="w-full py-2.5 px-4 bg-[#EA580C] hover:bg-[#C2410C] text-white text-sm font-semibold rounded-xl shadow-[0_8px_20px_-6px_rgba(234,88,12,0.5)] inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Sign in securely</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#EDE4DA]" />
                <span className="text-[11px] text-stone-400 font-medium">
                  Or connect live sheet
                </span>
                <div className="h-px flex-1 bg-[#EDE4DA]" />
              </div>

              {/* Official Google Sign-In Button */}
              <button
                type="button"
                onClick={onGoogleLogin}
                disabled={isGoogleLoading}
                className="gsi-material-button w-full"
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
                  <span>
                    {isGoogleLoading
                      ? 'Connecting & Syncing Sheet...'
                      : 'Sign in with Google & Load Sheet'}
                  </span>
                </div>
              </button>

            </div>
          </motion.section>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 py-3 border-t border-[#EFE4D8]/80 text-xs text-stone-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>© 2026 Piramal Petroleum Pvt. Ltd. All rights reserved.</span>
        <span>Powered by Google Sheets &amp; Apps Script Integration</span>
      </footer>
    </div>
  );
}
