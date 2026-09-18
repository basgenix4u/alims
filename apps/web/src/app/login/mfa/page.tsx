'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';

/** The login continuation when MFA is enabled (api_specification.md §3). */
export default function MfaLoginPage() {
  const { t } = useI18n();
  const { state, completeMfa } = useSession();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await completeMfa(code);
    setBusy(false);
    if (result.kind === 'ok') {
      router.push('/dashboard');
    } else {
      setError(result.message);
    }
  };

  if (state.status !== 'mfa-challenge') {
    return (
      <main id="main" className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold text-ink">{t('session.mfaTitle')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('common.signInPrompt')}</p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-ink">{t('session.mfaTitle')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('session.mfaIntro')}</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="mfa-code" className="block text-sm font-semibold text-ink">
            {t('session.mfaCode')}
          </label>
          <input
            id="mfa-code"
            className="input mt-1 tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-describedby={error ? 'mfa-error' : undefined}
          />
        </div>
        {error ? (
          <p
            id="mfa-error"
            role="alert"
            className="tone-danger rounded-md border-2 px-3 py-2 text-sm"
          >
            ✕ {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('session.verifying') : t('session.verify')}
        </button>
      </form>
    </main>
  );
}
