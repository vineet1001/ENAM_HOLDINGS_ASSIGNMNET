'use client';

import React, { useRef, useState } from 'react';

const TRIGGER_DISTANCE = 88;

interface SwipeAction {
  label: string;
  className: string;
  onTrigger: () => void;
}

// Touch-only swipe gesture; every action is also available as a visible button on the card.
export function SwipeRow({
  right,
  left,
  children
}: {
  right?: SwipeAction;
  left?: SwipeAction;
  children: React.ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const suppressClick = useRef(false);
  const [dx, setDx] = useState(0);

  const reset = () => {
    start.current = null;
    swiping.current = false;
    setDx(0);
  };

  return (
    <div className="relative rounded-xl overflow-hidden">
      {dx !== 0 && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center px-5 text-xs font-mono font-bold ${
            dx > 0 ? `justify-start ${right?.className}` : `justify-end ${left?.className}`
          }`}
        >
          {Math.abs(dx) >= TRIGGER_DISTANCE ? '✓ ' : ''}
          {dx > 0 ? right?.label : left?.label}
        </div>
      )}
      <div
        className="relative touch-pan-y"
        style={dx !== 0 ? { transform: `translateX(${dx}px)` } : { transition: 'transform 150ms ease-out' }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          start.current = { x: e.clientX, y: e.clientY };
          suppressClick.current = false;
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const moveX = e.clientX - start.current.x;
          const moveY = e.clientY - start.current.y;
          if (!swiping.current) {
            if (Math.abs(moveY) > 10) {
              start.current = null;
              return;
            }
            if (Math.abs(moveX) < 10) return;
            swiping.current = true;
            suppressClick.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          if ((moveX > 0 && !right) || (moveX < 0 && !left)) return;
          setDx(moveX);
        }}
        onPointerUp={() => {
          if (dx >= TRIGGER_DISTANCE) right?.onTrigger();
          else if (dx <= -TRIGGER_DISTANCE) left?.onTrigger();
          reset();
        }}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
