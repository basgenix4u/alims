'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/features/session/session-provider';

/**
 * Email verification landing (api_specification.md §3): the link from the
 * verification email lands here. The token is confirmed against the API
 * and the result is shown in plain language — success, already-used,
 * expired (with the resend hint), or invalid.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main id="main" className="mx-auto max-w-xl px-6 py-16"><p role="status">…</p></main>}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const { t } = useI18n();
  const params = useSearchParams();
  const token = params?.get('token') ?? '';

  const [state, setState] = useState<'busy' | 'ok' | 'error'>('busy');
  const [detail, setDetail] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('error');
      setDetail(t('verifyEmail.missingToken'));
      return;
    }
    void (async () => {
      try {
        await api.auth.verifyEmail.confirm(token);
        setState('ok');
      } catch (err) {
        setState('error');
        setDetail(errorMessage(err));
      }
    })();
  }, [token, t]);

  return (
    <main id="main" className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <h1 className="text-2xl font-bold text-ink">{t('verifyEmail.title')}</h1>

      {state === 'busy' ? <p role="status">{t('common.loading')}</p> : null}

      {state === 'ok' ? (
        <p role="status" className="tone-verified rounded-md border-2 px-4 py-3">
          {t('verifyEmail.success')}
        </p>
      ) : null}

      {state === 'error' ? (
        <p role="alert" className="tone-danger rounded-md border-2 px-4 py-3">
          {detail ?? t('verifyEmail.failure')}
        </p>
      ) : null}

      <p className="text-sm text-ink-muted">
        <Link href="/dashboard" className="text-brand hover:underline">
          {t('nav.dashboard')}
        </Link>
      </p>
    </main>
  );
}
