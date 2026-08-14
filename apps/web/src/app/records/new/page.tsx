'use client';

import { RecordWizard } from '@/features/wizard/record-wizard';
import { useI18n } from '@/i18n/provider';

export default function NewRecordPage() {
  const { t } = useI18n();
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('wizard.title')}</h1>
        <p className="text-ink-muted">{t('wizard.intro')}</p>
      </header>
      <RecordWizard />
    </main>
  );
}
