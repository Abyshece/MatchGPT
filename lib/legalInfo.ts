// ============================================================================
// Who runs Shaadi24 and how to reach them, for the legal pages (Terms, Privacy,
// Grievances, Refunds), the website's footer and the app's Settings.
//
// Indian law asks for these to be shown: the operator's legal name and address
// and a customer-care contact (Consumer Protection (E-Commerce) Rules 2020,
// rule 4), the Grievance Officer's name and contact (IT Rules 2021, rule
// 3(2)(a)) and someone who answers questions about personal data (DPDP Rules
// 2025, rule 9). What's empty here is shown as "to be published before launch"
// until the owner fills it in (docs/legal/README.md).
// ============================================================================

export const LEGAL = {
  brand: 'Shaadi24',
  // The person or company that runs Shaadi24 (a proprietor's full name, or the
  // registered name of a company or LLP), and its registered address
  operator: 'Abhishek',
  operatorKind: 'sole proprietor' as 'sole proprietor' | 'company' | 'LLP',
  address: '',
  cin: '',     // a company's Corporate Identification Number, if any
  gstin: '',   // GST registration, if any

  supportEmail: 'support@shaadi24.com',
  privacyEmail: 'privacy@shaadi24.com',
  grievanceEmail: 'grievance@shaadi24.com',
  supportHours: 'Monday to Saturday, 10 am to 6 pm India time',

  // IT Rules 2021, rule 3(2)(a): named on the website and in the app
  grievanceOfficer: {
    name: 'Abhishek',
    designation: 'Grievance Officer',
    phone: '',
  },

  // Courts for disputes (Terms, "Governing law"), apart from consumer commissions
  jurisdictionCity: 'Bengaluru, Karnataka',

  // Where members' data is kept (Supabase project in ap-south-1)
  dataRegion: 'Mumbai, India',

  // The website, for links from inside the phone apps (account deletion, support)
  websiteUrl: 'https://shaadi-gpt.vercel.app',
} as const;

/** "to be published before launch" for anything the owner hasn't filled in yet. */
export const orPending = (value: string) => value.trim() || 'to be published before launch';

/** The date the current documents took effect, as shown on them. */
export const LEGAL_UPDATED = '9 October 2026';

/** The legal pages, at /<page> on the website and #<page> in the apps. */
export const LEGAL_PAGES = ['terms', 'privacy', 'grievances', 'safety', 'refunds'] as const;
export type LegalPageName = typeof LEGAL_PAGES[number];

/** Opens a legal page over the app (App.tsx follows the address, #<page>). */
export const openLegalPage = (page: LegalPageName) => {
  window.location.hash = '';
  window.location.hash = page;
};
