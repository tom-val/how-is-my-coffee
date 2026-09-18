/** Small formatting helpers shared by cards, headers and lists. */

/** `2025-01-02T10:20:30Z` → "2 Jan 2025", in the active UI language. */
export function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A compact relative age for feed cards ("3h", "2d"), falling back to a date past a week. */
export function formatAge(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const seconds = Math.max(0, (Date.now() - d.getTime()) / 1000);
  // Units are the bare letters m/h/d rather than words: they need no translation, and a feed card
  // has room for two characters in the corner, not for "prieš kelias minutes".
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(iso, language);
}

/** Stars as one decimal — "4.5", "3.0". */
export function formatStars(value: number): string {
  return value.toFixed(1);
}
