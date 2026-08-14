'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { layoutLineage } from '@/features/lineage/layout';
import { WebGlViewport } from '@/features/lineage/webgl-viewport';
import { api } from '@/lib/api-client';
import { useI18n } from '@/i18n/provider';

export default function LineagePage() {
  const { t } = useI18n();
  const [recordId, setRecordId] = useState('');
  const [submitted, setSubmitted] = useState('');

  const query = useQuery({
    queryKey: ['lineage', submitted],
    queryFn: () => api.records.lineage(submitted, 3),
    enabled: Boolean(submitted),
  });

  const layout = query.data ? layoutLineage(query.data) : null;

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-3xl font-bold">{t('lineage.title')}</h1>
        <p className="text-ink-muted">{t('lineage.intro')}</p>
      </header>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(recordId.trim());
        }}
      >
        <label htmlFor="record-id" className="sr-only">
          {t('lineage.recordId')}
        </label>
        <input
          id="record-id"
          className="input max-w-md"
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
          placeholder="00000000-0000-7000-8000-000000000000"
        />
        <button type="submit" className="btn-primary">
          {t('lineage.load')}
        </button>
      </form>

      {query.isLoading ? <p role="status">{t('lineage.loading')}</p> : null}
      {query.isError ? (
        <div
          role="alert"
          className="rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-amber-950"
        >
          ⚠ {t('lineage.error')}
        </div>
      ) : null}
      {query.isSuccess && layout && layout.nodes.length === 0 ? <p>{t('lineage.empty')}</p> : null}

      {layout && layout.nodes.length > 0 ? (
        <>
          <WebGlViewport layout={layout} />
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-semibold">{t('lineage.tableCaption')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col">{t('lineage.node')}</th>
                <th scope="col">{t('lineage.type')}</th>
              </tr>
            </thead>
            <tbody>
              {layout.nodes.map((node) => (
                <tr key={node.id} className="border-t border-surface-border">
                  <th scope="row" className="py-1 font-medium">
                    {node.title}
                  </th>
                  <td>{node.outputType ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('lineage.edge')}</caption>
            <thead>
              <tr className="text-left text-ink-muted">
                <th scope="col">{t('lineage.from')}</th>
                <th scope="col">{t('lineage.to')}</th>
                <th scope="col">{t('lineage.type')}</th>
                <th scope="col">{t('lineage.evidence')}</th>
              </tr>
            </thead>
            <tbody>
              {layout.edges.map((edge) => (
                <tr
                  key={`${edge.from}-${edge.to}-${edge.relType}`}
                  className="border-t border-surface-border"
                >
                  <td className="py-1">{edge.from}</td>
                  <td>{edge.to}</td>
                  <td>{edge.relType}</td>
                  <td>{edge.evidenceState}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </main>
  );
}
