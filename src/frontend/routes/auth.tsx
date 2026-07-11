import { createRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { authClient } from '../lib/auth-client';
import { rootRoute } from './__root';

function safeRedirect(value: unknown) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function AuthView() {
  const search = useSearch({ from: '/auth' }) as { redirect?: string };
  const redirect = safeRedirect(search.redirect);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  };

  const sendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await sendCode();
      setStep('otp');
      setOtp('');
      setMessage(`Code sent to ${email}. Check the terminal for the OTP.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await sendCode();
      setOtp('');
      setMessage(`New code sent to ${email}. Check the terminal for the OTP.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await authClient.signIn.emailOtp({ email, otp });
      window.location.href = redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setOtp('');
    setError(null);
    setMessage(null);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <h1 className="text-xl font-semibold">{step === 'email' ? 'Sign in' : 'Check your email'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {step === 'email' ? 'Enter your email to receive a one-time code.' : `Enter the code sent to ${email}.`}
        </p>
        {redirect.startsWith('/oauth/authorize') ? (
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Sign in to continue authorizing this connected app.
          </p>
        ) : null}
        {message && (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {step === 'email' ? (
          <form className="mt-5 space-y-4" onSubmit={sendOtp}>
            <input
              autoFocus
              required
              type="email"
              className="w-full rounded-md border bg-transparent px-3 py-2"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button variant="base" className="w-full" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={verifyOtp}>
            <input
              autoFocus
              required
              className="w-full rounded-md border bg-transparent px-3 py-2"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="base" type="button" onClick={changeEmail} disabled={loading}>
                Change email
              </Button>
              <Button variant="base" className="flex-1" type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
            <Button variant="base" className="w-full" type="button" onClick={resendOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Resend code'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthView });
