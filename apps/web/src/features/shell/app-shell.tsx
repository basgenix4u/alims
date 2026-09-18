'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/provider';
import { useRouteFocus } from '@/hooks/use-route-focus';
import { useSession } from '@/features/session/session-provider';

const LINKS = [
  { href: '/', key: 'nav.home' as const },
  { href: '/dashboard', key: 'nav.dashboard' as const },
  { href: '/records/new', key: 'nav.newRecord' as const },
  { href: '/lineage', key: 'nav.lineage' as const },
  /* /verify belongs to the public surfaces. Link stays so the shell can route there. */
  { href: '/verify', key: 'nav.verify' as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { state, logout } = useSession();
  useRouteFocus();

  const isReviewer =
    state.status === 'authenticated' || state.status === 'mfa-challenge';

  // Member management: registry and institution administrators (PRD §4.3, §6.1).
  const isMemberManager =
    state.status === 'authenticated' &&
    state.user.memberships.some(
      (m) => m.status === 'active' && (m.role === 'registry' || m.role === 'inst_admin'),
    );

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
            <ul className="flex flex-wrap items-center gap-3 text-sm">
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
              {isReviewer ? (
                <li>
                  <Link
                    href="/review"
                    aria-current={pathname?.startsWith('/review') ? 'page' : undefined}
                    className={`rounded px-2 py-1 ${pathname?.startsWith('/review') ? 'bg-brand text-white' : 'text-ink hover:bg-surface-subtle'}`}
                  >
                    {t('nav.review')}
                  </Link>
                </li>
              ) : null}
              {isMemberManager ? (
                <li>
                  <Link
                    href="/institution/members"
                    aria-current={pathname?.startsWith('/institution/members') ? 'page' : undefined}
                    className={`rounded px-2 py-1 ${pathname?.startsWith('/institution/members') ? 'bg-brand text-white' : 'text-ink hover:bg-surface-subtle'}`}
                  >
                    {t('nav.members')}
                  </Link>
                </li>
              ) : null}
              <li aria-hidden="true" className="hidden text-surface-border sm:inline">
                |
              </li>
              {state.status === 'authenticated' ? (
                <>
                  <li>
                    <Link href="/account/mfa" className="rounded px-2 py-1 text-ink hover:bg-surface-subtle">
                      {state.user.displayName}
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-sm"
                      onClick={() => void logout()}
                    >
                      {t('nav.signOut')}
                    </button>
                  </li>
                </>
              ) : state.status === 'anonymous' ? (
                <>
                  <li>
                    <Link href="/login" className="rounded px-2 py-1 text-ink hover:bg-surface-subtle">
                      {t('nav.login')}
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="rounded px-2 py-1 text-brand hover:underline">
                      {t('nav.register')}
                    </Link>
                  </li>
                </>
              ) : null}
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
