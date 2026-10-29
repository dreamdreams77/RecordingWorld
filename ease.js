// src/ease.js
// Smooth movement toward a target, used for the plates that sink when pressed.

const RATE = 14; // how quickly a value closes the gap, per second

// Moves current toward target over dt seconds. Under reduced motion it jumps straight there.
export function easeToward(current, target, dt, reduced) {
  if (reduced) return target;
  const k = Math.min(1, Math.max(0, dt) * RATE);
  return current + (target - current) * k;
}
