'use client';

import { I18nProvider } from '@/i18n/provider';
import { QueryProvider } from '@/lib/query-provider';
import { SessionProvider } from '@/features/session/session-provider';
import { AppShell } from '@/features/shell/app-shell';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <SessionProvider>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
