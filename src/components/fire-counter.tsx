"use client";

import { useEffect, useRef } from "react";

/**
 * Animated counter that rolls up from 0 to the target number.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */
export function FireCounter({ count }: { count: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current || count === 0) return;

    const duration = 1800;
    const start = performance.now();
    let frame: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * count);

      if (ref.current) {
        ref.current.textContent = current.toString();
      }

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [count]);

  return (
    <span ref={ref} className="tabular-nums">
      0
    </span>
  );
}
