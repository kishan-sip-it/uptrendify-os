export type OnboardingDraft = Record<string, unknown>;

export function mergeOnboardingDraft<T extends OnboardingDraft>(empty: T, stored: unknown): T {
  if (!stored || typeof stored !== 'object') return { ...empty };
  const source = stored as Record<string, unknown>;
  return { ...empty, ...Object.fromEntries(Object.keys(empty).map((key) => [key, source[key] ?? empty[key]])) } as T;
}

export function completedStepsWith(current: number[], step: number): number[] {
  return Array.from(new Set([...current, step])).sort((a, b) => a - b);
}
