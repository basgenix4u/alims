'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { PASSWORD_MIN_LENGTH } from '@alims/contracts';

export default function RegisterPage() {
  const { t } = useI18n();
  const { register, login } = useSession();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await register(email, password, displayName);
    if (result.kind === 'error') {
      setBusy(false);
      setError(result.message);
      return;
    }
    // Sign straight in — email verification is on the roadmap and the UI
    // says so honestly rather than pretending a verification email exists.
    const signedIn = await login(email, password);
    setBusy(false);
    if (signedIn.kind === 'ok') {
      router.push('/dashboard');
    } else if (signedIn.kind === 'mfa-required') {
      router.push('/login/mfa');
    } else {
      router.push('/login');
    }
  };

  return (
    <main id="main" className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-ink">{t('session.registerTitle')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('session.registerIntro')}</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="reg-name" className="block text-sm font-semibold text-ink">
            {t('session.displayName')}
          </label>
          <input
            id="reg-name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className="input mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="reg-email" className="block text-sm font-semibold text-ink">
            {t('session.email')}
          </label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="reg-password" className="block text-sm font-semibold text-ink">
            {t('session.password')}
          </label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="reg-password-help"
          />
          <p id="reg-password-help" className="mt-1 text-sm text-ink-muted">
            ≥ {PASSWORD_MIN_LENGTH} characters.
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="tone-danger rounded-md border-2 px-3 py-2 text-sm"
          >
            ✕ {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('session.registering') : t('session.register')}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        {t('session.haveAccount')}{' '}
        <Link href="/login" className="text-brand hover:underline">
          {t('session.signIn')}
        </Link>
      </p>
    </main>
  );
}
