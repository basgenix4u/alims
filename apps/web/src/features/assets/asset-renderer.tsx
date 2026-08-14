'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/provider';
import { classifyAsset, loadAsset, type AssetLoadState } from './asset-loader';

type Props = {
  src?: string;
  mimeHint?: string;
  title?: string;
};

export function AssetRenderer({ src, mimeHint, title }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<AssetLoadState>({ kind: 'idle' });

  useEffect(() => {
    if (!src) {
      setState({ kind: 'idle' });
      return;
    }
    if (mimeHint && classifyAsset(mimeHint) === 'unknown') {
      setState({ kind: 'unsupported', mime: mimeHint });
      return;
    }
    const controller = new AbortController();
    setState({ kind: 'loading', loaded: 0, total: null });
    loadAsset(
      src,
      (loaded, total) => setState({ kind: 'loading', loaded, total }),
      controller.signal,
    )
      .then((next) => setState(next))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : t('asset.error'),
        });
      });
    return () => {
      controller.abort();
    };
  }, [src, mimeHint, t]);

  useEffect(() => {
    return () => {
      if (state.kind === 'ready') URL.revokeObjectURL(state.objectUrl);
    };
  }, [state]);

  if (!src || state.kind === 'idle') {
    return <p className="text-sm text-ink-muted">{t('asset.empty')}</p>;
  }

  if (state.kind === 'loading') {
    const label =
      state.total !== null
        ? t('asset.progress', { loaded: state.loaded, total: state.total })
        : t('asset.loading');
    const percent = state.total
      ? Math.min(100, Math.round((state.loaded / state.total) * 100))
      : null;
    return (
      <div role="status" aria-live="polite" className="space-y-2">
        <p>{label}</p>
        <div className="h-2 overflow-hidden rounded bg-surface-border">
          <div
            className="h-full bg-brand"
            style={{ width: `${percent ?? 20}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="rounded-md border-2 border-red-700 bg-red-50 px-3 py-2 text-red-950"
      >
        <p className="font-semibold">✕ {t('asset.error')}</p>
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'unsupported') {
    return (
      <div
        role="status"
        className="rounded-md border-2 border-amber-700 bg-amber-50 px-3 py-2 text-amber-950"
      >
        <p className="font-semibold">⚠ {t('asset.unsupported')}</p>
        <p className="text-sm">{state.mime}</p>
      </div>
    );
  }

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm text-ink-muted">
        ✓ {t('asset.ready')}
        {title ? ` — ${title}` : ''}
      </figcaption>
      {state.assetKind === 'image' ? (
        // Decorative preview of an authorised asset; alt is the record title when known.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.objectUrl}
          alt={title ?? ''}
          className="max-h-96 w-auto rounded border border-surface-border"
        />
      ) : (
        <iframe
          title={title ?? t('asset.ready')}
          src={state.objectUrl}
          className="h-[32rem] w-full rounded border border-surface-border bg-white"
        />
      )}
    </figure>
  );
}
