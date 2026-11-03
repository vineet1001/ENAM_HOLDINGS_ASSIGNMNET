'use client';

import React, { useEffect, useRef, useState } from 'react';

// Open sheets stack (a results sheet can open above a quick look); Escape closes the top one.
const openSheets: Array<React.MutableRefObject<() => void>> = [];

const PLACEMENT = {
  center: {
    wrapper: 'items-end md:items-center md:justify-center md:p-4',
    panel: 'w-full rounded-t-2xl md:rounded-xl max-h-[90vh] animate-slide-up',
  },
  right: {
    wrapper: 'items-end md:items-stretch md:justify-end',
    panel: 'w-full rounded-t-2xl md:rounded-none md:border-y-0 md:border-r-0 max-h-[90vh] md:max-h-none animate-slide-up md:animate-slide-left',
  },
  top: {
    wrapper: 'items-start justify-center md:pt-[12vh] md:px-4',
    panel: 'w-full md:rounded-xl max-h-[85vh] animate-fade-in',
  },
};

export function Sheet({
  open,
  onClose,
  label,
  placement = 'center',
  maxWidth = 'md:max-w-2xl',
  children
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  placement?: keyof typeof PLACEMENT;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openSheets.push(closeRef);
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Children may autofocus an input; only claim focus if nothing inside took it.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== closeRef) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openSheets.splice(openSheets.indexOf(closeRef), 1);
      document.body.style.overflow = previousOverflow;
      setDragY(0);
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const { wrapper, panel } = PLACEMENT[placement];

  return (
    <div
      className={`fixed inset-0 z-[60] flex bg-black/70 backdrop-blur-sm animate-fade-in ${wrapper}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`bg-[#111520] border border-[#1e2433] shadow-2xl overflow-y-auto overscroll-contain focus:outline-none ${panel} ${maxWidth}`}
      >
        {/* Drag handle: pull down to dismiss on touch screens */}
        {placement !== 'top' && (
          <div
            className="md:hidden flex justify-center py-2.5 touch-none cursor-grab sticky top-0 bg-[#111520] z-10"
            onPointerDown={(e) => {
              dragStart.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (dragStart.current !== null) setDragY(Math.max(0, e.clientY - dragStart.current));
            }}
            onPointerUp={() => {
              dragStart.current = null;
              if (dragY > 96) onClose();
              else setDragY(0);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              setDragY(0);
            }}
          >
            <span className="w-10 h-1 rounded-full bg-slate-600" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
