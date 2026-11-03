'use client';

import React from 'react';
import { ToastProvider } from '@/components/Toast';
import { QuickLookProvider } from '@/components/QuickLook';
import { CommandPalette } from '@/components/CommandPalette';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <QuickLookProvider>
        {children}
        <CommandPalette />
      </QuickLookProvider>
    </ToastProvider>
  );
}
