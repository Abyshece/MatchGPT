// ============================================================================
// The legal age to marry in India (Prohibition of Child Marriage Act, 2006):
// 21 for men and 18 for women. Shaadi24 asks 21 of any other gender. The
// database checks it too (profiles_legal_rules(); the age check constraint).
// ============================================================================

/** The youngest age at which someone of this gender may use Shaadi24. */
export const minimumAge = (gender?: string | null): number => (gender === 'Female' ? 18 : 21);

/** Whether someone is younger than the legal age to marry. */
export const belowMarriageAge = (gender?: string | null, age?: number | null): boolean =>
  typeof age === 'number' && age < minimumAge(gender);

/** What to say to someone too young to use Shaadi24 (or about whoever the profile is for). */
export const tooYoungMessage = (gender?: string | null, forSomeoneElse = false): string => {
  const who = forSomeoneElse ? 'They' : 'You';
  return gender === 'Female'
    ? `${who} must be at least 18 to use Shaadi24.`
    : `${who} must be at least 21 to use Shaadi24: the legal age to marry in India is 21 for men and 18 for women.`;
};
