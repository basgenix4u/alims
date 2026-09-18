'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { api } from '@/lib/api-client';
import { errorMessage } from './session-provider';

/**
 * Step-up assertion modal (PRD §9.1, api_specification.md §1).
 *
 * Consequential actions — verification, certificate issue/revoke — require
 * a fresh TOTP confirmation. The caller receives the short-lived token
 * only after a successful assertion; cancelling resolves null and the
 * action is never sent.
 */
export function StepUpModal({
  open,
  actionLabel,
  onClose,
  onAsserted,
}: {
  open: boolean;
  actionLabel: string;
  onClose: () => void;
  onAsserted: (stepUpToken: string) => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(t('stepUp.invalidCode'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.auth.stepUp(code);
      onAsserted(result.stepUpToken);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stepup-title"
    >
      <div className="w-full max-w-md rounded-lg border border-surface-border bg-surface p-6 shadow-xl">
        <h2 id="stepup-title" className="text-lg font-bold text-ink">
          {t('stepUp.title')}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {t('stepUp.explainer')} <span className="font-semibold text-ink">{actionLabel}</span>.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="stepup-code" className="block text-sm font-semibold text-ink">
              {t('stepUp.codeLabel')}
            </label>
            <input
              id="stepup-code"
              ref={inputRef}
              className="input mt-1 tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-describedby={error ? 'stepup-error' : undefined}
            />
            {error ? (
              <p id="stepup-error" role="alert" className="mt-1 text-sm" style={{ color: 'var(--color-danger-subtle-fg)' }}>
                ✕ {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('stepUp.checking') : t('stepUp.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
