'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';

export default function LoginPage() {
  const { t } = useI18n();
  const { login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await login(email, password);
    setBusy(false);
    if (result.kind === 'ok') {
      router.push('/dashboard');
    } else if (result.kind === 'mfa-required') {
      router.push('/login/mfa');
    } else {
      setError(result.message);
    }
  };

  return (
    <main id="main" className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-ink">{t('session.loginTitle')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('session.loginIntro')}</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-ink">
            {t('session.email')}
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-semibold text-ink">
            {t('session.password')}
          </label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>
        {error ? (
          <p
            id="login-error"
            role="alert"
            className="tone-danger rounded-md border-2 px-3 py-2 text-sm"
          >
            ✕ {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('session.signingIn') : t('session.signIn')}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        {t('session.noAccount')}{' '}
        <Link href="/register" className="text-brand hover:underline">
          {t('session.registerTitle')}
        </Link>
      </p>
    </main>
  );
}
