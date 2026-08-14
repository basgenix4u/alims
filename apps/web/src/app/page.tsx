import { HealthStatus } from '@/components/health-status';

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-16">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">ALIMS</h1>
        <p className="mt-2 text-lg text-ink-muted">
          The Global Academic Knowledge Infrastructure
        </p>
        <p className="mt-1 font-medium text-brand">Preserve. Connect. Activate.</p>
      </header>

      <section aria-labelledby="status-heading" className="mt-12">
        <h2 id="status-heading" className="text-xl font-semibold">
          Environment status
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Live check against the API — this page holds no mock data.
        </p>
        <div className="mt-4">
          <HealthStatus />
        </div>
      </section>

      <section aria-labelledby="next-heading" className="mt-12">
        <h2 id="next-heading" className="text-xl font-semibold">
          Build status
        </h2>
        <p className="mt-2 text-ink-muted">
          Scaffold complete (T-002). Feature work is tracked in{' '}
          <code className="rounded bg-surface-border px-1.5 py-0.5 text-sm">
            coordination_board.json
          </code>
          .
        </p>
      </section>
    </main>
  );
}
