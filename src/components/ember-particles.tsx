"use client";

import { memo } from "react";

/**
 * Floating ember particles — pure CSS animation, no JS runtime.
 * Renders as a fixed background layer.
 */
function EmberParticlesInner() {
  const embers = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${8 + (i * 7.3) % 84}%`,
    delay: `${(i * 1.7) % 6}s`,
    duration: `${4 + (i % 3) * 2}s`,
    size: i % 3 === 0 ? 3 : 2,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {embers.map((e) => (
        <span
          key={e.id}
          className="absolute rounded-full bg-accent/40"
          style={{
            left: e.left,
            bottom: "-10px",
            width: e.size,
            height: e.size,
            animation: `ember-float ${e.duration} ease-out ${e.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

export const EmberParticles = memo(EmberParticlesInner);
