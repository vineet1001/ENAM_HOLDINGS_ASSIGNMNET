import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { Providers } from '@/components/Providers';
import { THEME_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'FINN — Institutional Financial Investment Intelligence',
  description: 'AI-powered intelligence layer for Indian public-market investors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0a0d14" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-[#0a0d14] text-slate-100 min-h-screen flex antialiased">
        <Providers>
          {/* Navigation Sidebar */}
          <Navigation />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

