// ============================================================================
// How some profile answers read on a profile (Phase 12).
// ============================================================================

// "18:30" -> "6:30 PM"
export function formatBirthTime(time: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!m) return time ?? '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

// Brothers "2" with "1" married -> "2 (1 married)"; "0" -> "None"
export function formatSiblings(count: string | null | undefined, married: string | null | undefined): string {
  if (!count) return '';
  if (count === '0') return 'None';
  return married && married !== '0' ? `${count} (${married} married)` : count;
}

// "Yes, living together" with "2" -> "Yes, living together (2)"
export function formatChildren(children: string | null | undefined, count: string | null | undefined): string {
  if (!children) return '';
  return children !== 'No' && count ? `${children} (${count})` : children;
}
