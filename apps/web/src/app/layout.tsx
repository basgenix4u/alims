import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ALIMS — The Global Academic Knowledge Infrastructure',
  description: 'Preserve. Connect. Activate. Verified research records and academic lineage.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface-subtle text-ink antialiased">
        {/* PRD §9.3 — keyboard users must be able to skip repeated content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
