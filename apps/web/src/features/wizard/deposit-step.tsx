'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { api, type DepositReceiptView, type UploadStatus } from '@/lib/api-client';
import { errorMessage } from '@/features/session/session-provider';
import { DEPOSIT_RECEIPT_STATEMENT } from '@alims/contracts';

/**
 * The deposit + submission step (api_specification.md §6–§7).
 *
 * After a draft exists: open a version, upload the file part by part to the
 * signed URLs (same-origin through the proxy), complete, watch the safety
 * scan settle honestly, then submit the record for review.
 */

type Phase =
  | { kind: 'choose-file' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'assembling' }
  | { kind: 'scanning'; status: UploadStatus }
  | { kind: 'ready'; receipt: DepositReceiptView; scan: UploadStatus }
  | { kind: 'submitted' }
  | { kind: 'error'; message: string };

export function DepositStep({
  recordId,
  onSubmitted,
}: {
  recordId: string;
  /** Invoked with the new version id when the file lands (before submit). */
  onSubmitted?: (versionId: string) => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'choose-file' });
  const [changeSummary, setChangeSummary] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const deposit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || changeSummary.trim().length < 10) return;
    setPhase({ kind: 'uploading', percent: 0 });
    try {
      // 1. Open the append-only version.
      const version = await api.records.createVersion(recordId, changeSummary.trim());

      // 2. Initialise the multipart session.
      const init = await api.uploads.init({
        versionId: version.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      });

      // 3. PUT each part to its signed URL, tracking progress.
      const declared: Array<{ partNumber: number; etag: string }> = [];
      for (const part of init.parts) {
        const start = (part.partNumber - 1) * init.partSizeBytes;
        const end = Math.min(part.partNumber * init.partSizeBytes, file.size);
        const blob = file.slice(start, end);
        const etag = await api.uploads.putPart(part.url, blob);
        declared.push({ partNumber: part.partNumber, etag });
        setPhase({
          kind: 'uploading',
          percent: Math.round((end / file.size) * 100),
        });
      }

      // 4. Complete: assemble, checksum, receipt.
      setPhase({ kind: 'assembling' });
      const completion = await api.uploads.complete(init.uploadId, declared);

      // 5. Watch the safety scan settle — honestly, whatever it says.
      let status = await api.uploads.status(init.uploadId);
      let attempts = 0;
      while (status.scanStatus === 'pending' && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = await api.uploads.status(init.uploadId);
        attempts += 1;
      }

      setPhase({ kind: 'ready', receipt: completion.receipt, scan: status });
      onSubmitted?.(completion.versionId);
    } catch (error) {
      setPhase({ kind: 'error', message: errorMessage(error) });
    }
  };

  const submit = async () => {
    setPhase((current) => (current.kind === 'ready' ? current : current));
    try {
      await api.records.submit(recordId);
      setPhase({ kind: 'submitted' });
    } catch (error) {
      setPhase({ kind: 'error', message: errorMessage(error) });
    }
  };

  const ready = phase.kind === 'ready';
  const canSubmit =
    ready && phase.scan.scanStatus !== 'infected' && phase.scan.scanStatus !== 'failed';

  return (
    <section className="space-y-5" aria-labelledby="deposit-step-title">
      <div>
        <h2 id="deposit-step-title" className="text-xl font-bold text-ink">
          {t('deposit.fileStepTitle')}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t('deposit.fileStepIntro')}</p>
      </div>

      <div>
        <label htmlFor="deposit-summary" className="block text-sm font-semibold text-ink">
          {t('deposit.changeSummary')}
        </label>
        <p className="text-sm text-ink-muted">{t('deposit.changeSummaryHelp')}</p>
        <textarea
          id="deposit-summary"
          className="input mt-1"
          rows={2}
          minLength={10}
          maxLength={1000}
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="deposit-file" className="block text-sm font-semibold text-ink">
          {t('deposit.chooseFile')}
        </label>
        <input
          id="deposit-file"
          ref={fileRef}
          type="file"
          className="input mt-1"
          aria-describedby="deposit-file-state"
        />
      </div>

      <button
        type="button"
        className="btn-primary"
        onClick={() => void deposit()}
        disabled={
          phase.kind === 'uploading' ||
          phase.kind === 'assembling' ||
          changeSummary.trim().length < 10 ||
          !fileRef.current?.files?.[0]
        }
      >
        {t('deposit.fileStepTitle')}
      </button>

      <div id="deposit-file-state" aria-live="polite" className="space-y-3">
        {phase.kind === 'uploading' ? (
          <p role="status" className="text-sm text-ink-muted">
            {t('deposit.uploading', { percent: phase.percent })}
          </p>
        ) : null}
        {phase.kind === 'assembling' ? (
          <p role="status" className="text-sm text-ink-muted">
            {t('deposit.uploaded')}
          </p>
        ) : null}
        {phase.kind === 'scanning' ? (
          <p role="status" className="text-sm text-ink-muted">
            {t('deposit.scanPending')}
          </p>
        ) : null}

        {ready ? (
          <>
            <div className="tone-verified rounded-md border-2 px-4 py-3">
              <p className="text-sm font-semibold">{t('deposit.receiptTitle')}</p>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-muted">SHA-256</dt>
                <dd className="break-all font-mono text-xs">{phase.receipt.sha256}</dd>
                <dt className="text-ink-muted">{t('verify.issued')}</dt>
                <dd>{new Date(phase.receipt.receivedAt).toLocaleString()}</dd>
              </dl>
              <p className="mt-2 text-xs text-ink-muted">{DEPOSIT_RECEIPT_STATEMENT}</p>
            </div>
            <div
              className={`rounded-md border-2 px-4 py-3 text-sm ${
                phase.scan.scanStatus === 'unsupported'
                  ? 'tone-advisory'
                  : phase.scan.scanStatus === 'infected'
                    ? 'tone-danger'
                    : 'tone-verified'
              }`}
            >
              <p className="font-semibold">{t('deposit.scanTitle')}</p>
              <p className="mt-1">
                {phase.scan.scanStatus === 'unsupported'
                  ? t('deposit.scanUnsupported')
                  : phase.scan.scanStatus === 'infected'
                    ? t('deposit.scanInfected')
                    : t('deposit.scanClean')}
              </p>
            </div>
          </>
        ) : null}

        {ready || phase.kind === 'submitted' ? (
          <div className="rounded-md border border-surface-border bg-surface-subtle px-4 py-3">
            <p className="text-sm font-semibold text-ink">{t('deposit.submitTitle')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('deposit.submitIntro')}</p>
            {phase.kind === 'submitted' ? (
              <p
                role="status"
                className="tone-verified mt-3 rounded-md border-2 px-3 py-2 text-sm"
              >
                ✓ {t('deposit.submitted')}
              </p>
            ) : (
              <button
                type="button"
                className="btn-primary mt-3"
                onClick={() => void submit()}
                disabled={!canSubmit}
              >
                {t('deposit.submit')}
              </button>
            )}
            {ready && !canSubmit ? (
              <p className="mt-2 text-sm" style={{ color: 'var(--color-danger-subtle-fg)' }}>
                {t('deposit.submitBlocked')}
              </p>
            ) : null}
          </div>
        ) : null}

        {phase.kind === 'error' ? (
          <p role="alert" className="tone-danger rounded-md border-2 px-3 py-2 text-sm">
            ✕ {t('deposit.error')} {phase.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
