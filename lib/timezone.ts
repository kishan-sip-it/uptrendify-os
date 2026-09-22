const ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
};

export function normalizeTimezone(value: string | null | undefined, fallback = 'UTC'): string {
  if (!value) return fallback;
  return ALIASES[value] ?? value;
}
