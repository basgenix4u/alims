'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/provider';
import { useRouteFocus } from '@/hooks/use-route-focus';

const LINKS = [
  { href: '/', key: 'nav.home' as const },
  { href: '/dashboard', key: 'nav.dashboard' as const },
  { href: '/records/new', key: 'nav.newRecord' as const },
  { href: '/lineage', key: 'nav.lineage' as const },
  /* /verify is Agent 3 (T-412 / public surfaces). Link stays so the shell can route there. */
  { href: '/verify', key: 'nav.verify' as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  useRouteFocus();

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        {t('a11y.skipToMain')}
      </a>
      <header className="border-b border-surface-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-bold tracking-tight text-ink">
            {t('brand.name')}
            <span className="ms-2 text-sm font-medium text-brand">{t('brand.motto')}</span>
          </Link>
          <nav aria-label={t('nav.primary')}>
            <ul className="flex flex-wrap gap-3 text-sm">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`rounded px-2 py-1 ${active ? 'bg-brand text-white' : 'text-ink hover:bg-surface-subtle'}`}
                    >
                      {t(link.key)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-surface-border">
        <p className="mx-auto max-w-6xl px-6 py-6 text-sm text-ink-muted">{t('brand.tagline')}</p>
      </footer>
    </div>
  );
}
