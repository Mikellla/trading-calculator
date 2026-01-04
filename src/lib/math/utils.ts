export function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function roundTo(n: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

export function assertPositive(name: string, n: number) {
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be > 0`);
}

export function assertNonNegative(name: string, n: number) {
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be >= 0`);
}
