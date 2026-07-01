"use client";

import { useEffect, useRef } from "react";

/**
 * Animated counter that rolls up to the target number.
 * Renders `count` as SSR/no-JS content (real value visible during LCP) and
 * animates from the currently displayed value to the new target whenever
 * `count` changes on the client — never resetting back to 0.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */
export function FireCounter({ count }: { count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Track the value currently shown so a count change animates from it,
  // not from 0. Initialised to the SSR value.
  const displayed = useRef(count);

  useEffect(() => {
    const from = displayed.current;
    if (!ref.current || from === count) return;

    const duration = 1800;
    const start = performance.now();
    let frame: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (count - from) * eased);

      if (ref.current) {
        ref.current.textContent = current.toString();
      }
      displayed.current = current;

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        displayed.current = count;
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [count]);

  return (
    <span ref={ref} className="tabular-nums">
      {count}
    </span>
  );
}
