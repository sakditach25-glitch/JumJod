'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { useState } from 'react';
import { ClipboardList, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const { signInWithGoogle, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const authErrorCode = searchParams.get('error');

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize Google Login.');
      setLoading(false);
    }
  };

  const errorMessage = authErrorCode === 'auth-code-exchange-failed'
    ? 'Authentication code exchange failed. Please try logging in again.'
    : error;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4">
      {/* Background ambient glowing blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl" />

      {/* Main Container */}
      <div className="relative w-full max-w-md z-10">
        <div className="backdrop-blur-md bg-slate-900/60 border border-slate-800 rounded-3xl p-8 shadow-2xl transition-all duration-300 hover:shadow-violet-500/5">
          
          {/* Logo / Branding */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 animate-pulse">
              <ClipboardList className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
              จำจด • JumJod
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xs">
              Smart procurement tracking and memory-assistant for budget planning.
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-950/40 border border-red-900/50 text-red-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Actions */}
          <div className="space-y-4">
            <button
              onClick={handleLogin}
              disabled={loading || authLoading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold bg-white text-slate-950 hover:bg-slate-100 transition-all duration-200 shadow-md shadow-white/5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="pt-4 border-t border-slate-800/80 text-center">
              <p className="text-[11px] text-slate-500">
                Secure authentication provided by Supabase OAuth.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
