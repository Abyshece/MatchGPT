// ============================================================================
// How some profile answers read on a profile (Phase 12). Kept apart from the
// option lists (matrimonyOptions.ts), which only load where answers are edited.
// ============================================================================

// What the sect question is called for each religion
export const SECT_LABEL: Record<string, string> = { Muslim: 'Sect', Christian: 'Denomination' };

// How others see who manages the profile ("Son" -> managed by a parent).
export function profileManagedBy(createdFor: string | null | undefined): string | null {
  switch (createdFor) {
    case 'Myself': return 'Self';
    case 'Son': case 'Daughter': return 'Parent';
    case 'Brother': case 'Sister': return 'Sibling';
    case 'Relative': return 'Relative';
    case 'Friend': return 'Friend';
    default: return null;
  }
}

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
