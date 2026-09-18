'use client';

import { useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useI18n } from '@/i18n/provider';
import { useSession } from '@/features/session/session-provider';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/features/session/session-provider';

type Enrolment =
  | { kind: 'idle' }
  | { kind: 'pending'; secret: string; otpauthUrl: string }
  | { kind: 'active'; recoveryCodes: string[] };

export default function AccountMfaPage() {
  const { t } = useI18n();
  const { state, refreshUser } = useSession();
  const [enrolment, setEnrolment] = useState<Enrolment>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrImgRef = useRef<HTMLImageElement>(null);

  const startEnrolment = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.auth.mfaEnroll();
      setEnrolment({ kind: 'pending', secret: result.secret, otpauthUrl: result.otpauthUrl });
      setQrDataUrl(await QRCode.toDataURL(result.otpauthUrl, { margin: 1, width: 220 }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.mfaVerify(code);
      await refreshUser();
      setEnrolment((current) =>
        current.kind === 'pending'
          ? { kind: 'active', recoveryCodes: [] }
          : current,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (state.status !== 'authenticated') {
    return (
      <main id="main" className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold text-ink">{t('session.accountTitle')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('common.signInPrompt')}</p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-bold text-ink">{t('session.mfaEnrollTitle')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('session.mfaEnrollIntro')}</p>

      {state.user.mfaEnabled ? (
        <p
          role="status"
          className="tone-verified mt-6 rounded-md border-2 px-4 py-3 text-sm"
        >
          ✓ {t('session.mfaActive')}
        </p>
      ) : null}

      {enrolment.kind === 'idle' ? (
        <button
          type="button"
          className="btn-primary mt-6"
          onClick={() => void startEnrolment()}
          disabled={busy || state.user.mfaEnabled}
        >
          {busy ? t('common.loading') : t('session.mfaActivate')}
        </button>
      ) : null}

      {enrolment.kind === 'pending' ? (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {qrDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data URI, no network */
              <img
                ref={qrImgRef}
                src={qrDataUrl}
                width={220}
                height={220}
                alt={t('session.mfaSecret')}
                className="rounded border border-surface-border bg-white"
              />
            ) : null}
            <div>
              <p className="text-sm font-semibold text-ink">{t('session.mfaSecret')}</p>
              <code className="mt-1 block break-all rounded bg-surface-subtle px-3 py-2 font-mono text-sm">
                {enrolment.secret}
              </code>
            </div>
          </div>

          <form onSubmit={activate} className="space-y-4">
            <div>
              <label htmlFor="activate-code" className="block text-sm font-semibold text-ink">
                {t('session.mfaCode')}
              </label>
              <input
                id="activate-code"
                className="input mt-1 tracking-[0.4em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="tone-danger rounded-md border-2 px-3 py-2 text-sm">
                ✕ {error}
              </p>
            ) : null}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('session.verifying') : t('session.verify')}
            </button>
          </form>
        </div>
      ) : null}

      {enrolment.kind === 'active' ? (
        <div className="mt-8 space-y-4">
          <p
            role="status"
            className="tone-verified rounded-md border-2 px-4 py-3 text-sm"
          >
            ✓ {t('session.mfaActive')}
          </p>
        </div>
      ) : null}

      {error && enrolment.kind === 'idle' ? (
        <p role="alert" className="tone-danger mt-4 rounded-md border-2 px-3 py-2 text-sm">
          ✕ {error}
        </p>
      ) : null}
    </main>
  );
}
