import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '@/components/Navigation';

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
    <html lang="en" className="dark">
      <body className="bg-[#0a0d14] text-slate-100 min-h-screen flex antialiased">
        {/* Navigation Sidebar */}
        <Navigation alertCount={2} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0 overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}

