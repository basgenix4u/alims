import type { Metadata } from 'next';
import { translate } from '@/i18n';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: translate('en', 'meta.title'),
  description: translate('en', 'meta.description'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface-subtle text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
