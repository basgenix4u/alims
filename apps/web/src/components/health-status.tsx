'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { HealthResponse } from '@alims/contracts';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

/**
 * Live API probe. Demonstrates the loading / success / error triad that
 * every data-bound component in this app must implement (PRD §9.2).
 */
export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((data) => !cancelled && setState({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to reach the API';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <p role="status" aria-live="polite" className="text-ink-muted">
        Checking API status…
      </p>
    );
  }

  if (state.kind === 'error') {
    return (
      // Error is conveyed by text and an icon, never by colour alone (PRD §9.3).
      <div
        role="alert"
        className="rounded-md border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
      >
        <p className="font-semibold">✕ API unreachable</p>
        <p className="mt-1 text-sm">{state.message}</p>
        <p className="mt-1 text-sm">Start the API with `pnpm dev` and reload this page.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border-2 border-green-700 bg-green-50 px-4 py-3 text-green-900">
      <p className="font-semibold">✓ API reachable</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Status</dt>
        <dd>{state.data.status}</dd>
        <dt className="font-medium">Version</dt>
        <dd>{state.data.version}</dd>
        <dt className="font-medium">Uptime</dt>
        <dd>{state.data.uptime}s</dd>
      </dl>
    </div>
  );
}
