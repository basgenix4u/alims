'use client';

import { I18nProvider } from '@/i18n/provider';
import { QueryProvider } from '@/lib/query-provider';
import { AppShell } from '@/features/shell/app-shell';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <QueryProvider>
        <AppShell>{children}</AppShell>
      </QueryProvider>
    </I18nProvider>
  );
}
