// ============================================================================
// Biodata: the member's marriage biodata, made from their profile
//
// The traditional one-page biodata families pass around on WhatsApp, in one
// of three designs and in English, Hindi, Marathi, Gujarati, Tamil or
// Bengali (the labels; answers stay as the member wrote them). It carries a
// QR code and a private link that open the member's page on the website
// (shaadi24 …/b/<link>, BiodataPage.tsx), which sends people to the app.
//
// Never on it: a phone number or email, the date of birth unless the member
// asks (otherwise the age), or anything they hid on their profile.
// The link (biodata_links in the database) counts how often it was opened
// and can be turned off; the next biodata then gets a new one.
// ============================================================================

import { supabase } from './supabase';
import { LEGAL } from './legalInfo';
import { isNativeApp } from './nativeApp';
import type { UserProfile } from '../types';

export type BiodataLang = 'en' | 'hi' | 'mr' | 'gu' | 'ta' | 'bn';
export type BiodataTemplate = 'classic' | 'floral' | 'simple';

export const BIODATA_LANGS: { id: BiodataLang; label: string }[] = [
  { id: 'en', label: 'English' }, { id: 'hi', label: 'हिन्दी' }, { id: 'mr', label: 'मराठी' },
  { id: 'gu', label: 'ગુજરાતી' }, { id: 'ta', label: 'தமிழ்' }, { id: 'bn', label: 'বাংলা' },
];

export const BIODATA_TEMPLATES: { id: BiodataTemplate; label: string }[] = [
  { id: 'classic', label: 'Classic' }, { id: 'floral', label: 'Floral' }, { id: 'simple', label: 'Simple' },
];

export type BiodataLabel =
  | 'title'
  | 'personal'
  | 'horoscope'
  | 'career'
  | 'family'
  | 'about'
  | 'name'
  | 'dob'
  | 'age'
  | 'years'
  | 'height'
  | 'marital'
  | 'religion'
  | 'motherTongue'
  | 'caste'
  | 'subCaste'
  | 'gotra'
  | 'manglik'
  | 'rashi'
  | 'nakshatra'
  | 'birthTime'
  | 'birthPlace'
  | 'diet'
  | 'education'
  | 'college'
  | 'occupation'
  | 'employedIn'
  | 'income'
  | 'livesIn'
  | 'hometown'
  | 'father'
  | 'mother'
  | 'brothers'
  | 'sisters'
  | 'familyType'
  | 'familyValues'
  | 'familyLocation'
  | 'scan'
  | 'made'
  | 'share';

// One row per label: English, Hindi, Marathi, Gujarati, Tamil, Bengali
const TABLE: Record<BiodataLabel, [string, string, string, string, string, string]> = {
  title: ['Marriage Biodata', 'विवाह बायोडाटा', 'विवाह बायोडाटा', 'લગ્ન બાયોડેટા', 'திருமண சுயவிவரம்', 'বিবাহের বায়োডাটা'],
  personal: ['Personal details', 'व्यक्तिगत जानकारी', 'वैयक्तिक माहिती', 'વ્યક્તિગત માહિતી', 'தனிப்பட்ட விவரங்கள்', 'ব্যক্তিগত তথ্য'],
  horoscope: ['Horoscope', 'कुंडली', 'पत्रिका', 'જન્મકુંડળી', 'ஜாதகம்', 'কোষ্ঠী'],
  career: ['Education & career', 'शिक्षा और व्यवसाय', 'शिक्षण आणि व्यवसाय', 'શિક્ષણ અને વ્યવસાય', 'கல்வி மற்றும் தொழில்', 'শিক্ষা ও পেশা'],
  family: ['Family', 'परिवार', 'कुटुंब', 'પરિવાર', 'குடும்பம்', 'পরিবার'],
  about: ['About me', 'मेरे बारे में', 'माझ्याबद्दल', 'મારા વિશે', 'என்னைப் பற்றி', 'আমার সম্পর্কে'],
  name: ['Name', 'नाम', 'नाव', 'નામ', 'பெயர்', 'নাম'],
  dob: ['Date of birth', 'जन्म तिथि', 'जन्मतारीख', 'જન્મ તારીખ', 'பிறந்த தேதி', 'জন্ম তারিখ'],
  age: ['Age', 'आयु', 'वय', 'ઉંમર', 'வயது', 'বয়স'],
  years: ['years', 'वर्ष', 'वर्षे', 'વર્ષ', 'வயது', 'বছর'],
  height: ['Height', 'कद', 'उंची', 'ઊંચાઈ', 'உயரம்', 'উচ্চতা'],
  marital: ['Marital status', 'वैवाहिक स्थिति', 'वैवाहिक स्थिती', 'વૈવાહિક સ્થિતિ', 'திருமண நிலை', 'বৈবাহিক অবস্থা'],
  religion: ['Religion', 'धर्म', 'धर्म', 'ધર્મ', 'மதம்', 'ধর্ম'],
  motherTongue: ['Mother tongue', 'मातृभाषा', 'मातृभाषा', 'માતૃભાષા', 'தாய்மொழி', 'মাতৃভাষা'],
  caste: ['Caste', 'जाति', 'जात', 'જ્ઞાતિ', 'சாதி', 'জাতি'],
  subCaste: ['Sub-caste', 'उपजाति', 'पोटजात', 'પેટાજ્ઞાતિ', 'உட்பிரிவு', 'উপজাতি'],
  gotra: ['Gotra', 'गोत्र', 'गोत्र', 'ગોત્ર', 'கோத்திரம்', 'গোত্র'],
  manglik: ['Manglik', 'मांगलिक', 'मांगलिक', 'માંગલિક', 'செவ்வாய் தோஷம்', 'মাঙ্গলিক'],
  rashi: ['Rashi', 'राशि', 'रास', 'રાશિ', 'ராசி', 'রাশি'],
  nakshatra: ['Nakshatra', 'नक्षत्र', 'नक्षत्र', 'નક્ષત્ર', 'நட்சத்திரம்', 'নক্ষত্র'],
  birthTime: ['Time of birth', 'जन्म समय', 'जन्मवेळ', 'જન્મ સમય', 'பிறந்த நேரம்', 'জন্মের সময়'],
  birthPlace: ['Place of birth', 'जन्म स्थान', 'जन्मस्थळ', 'જન્મ સ્થળ', 'பிறந்த இடம்', 'জন্মস্থান'],
  diet: ['Diet', 'आहार', 'आहार', 'આહાર', 'உணவு முறை', 'খাদ্যাভ্যাস'],
  education: ['Education', 'शिक्षा', 'शिक्षण', 'શિક્ષણ', 'கல்வி', 'শিক্ষা'],
  college: ['College', 'कॉलेज', 'महाविद्यालय', 'કોલેજ', 'கல்லூரி', 'কলেজ'],
  occupation: ['Occupation', 'व्यवसाय', 'व्यवसाय', 'વ્યવસાય', 'தொழில்', 'পেশা'],
  employedIn: ['Works in', 'कार्यक्षेत्र', 'कार्यक्षेत्र', 'કાર્યક્ષેત્ર', 'பணிபுரியும் துறை', 'কর্মক্ষেত্র'],
  income: ['Annual income', 'वार्षिक आय', 'वार्षिक उत्पन्न', 'વાર્ષિક આવક', 'ஆண்டு வருமானம்', 'বার্ষিক আয়'],
  livesIn: ['Lives in', 'निवास', 'राहण्याचे ठिकाण', 'રહેઠાણ', 'வசிக்கும் இடம்', 'বর্তমান নিবাস'],
  hometown: ['Native place', 'मूल निवास', 'मूळ गाव', 'મૂળ વતન', 'சொந்த ஊர்', 'আদি নিবাস'],
  father: ['Father', 'पिता', 'वडील', 'પિતા', 'தந்தை', 'পিতা'],
  mother: ['Mother', 'माता', 'आई', 'માતા', 'தாய்', 'মাতা'],
  brothers: ['Brothers', 'भाई', 'भाऊ', 'ભાઈ', 'சகோதரர்கள்', 'ভাই'],
  sisters: ['Sisters', 'बहनें', 'बहिणी', 'બહેન', 'சகோதரிகள்', 'বোন'],
  familyType: ['Family type', 'परिवार का प्रकार', 'कुटुंबाचा प्रकार', 'પરિવારનો પ્રકાર', 'குடும்ப வகை', 'পরিবারের ধরন'],
  familyValues: ['Family values', 'पारिवारिक मूल्य', 'कौटुंबिक मूल्ये', 'પારિવારિક મૂલ્યો', 'குடும்ப மதிப்புகள்', 'পারিবারিক মূল্যবোধ'],
  familyLocation: ['Family lives in', 'परिवार का निवास', 'कुटुंबाचे ठिकाण', 'પરિવારનું રહેઠાણ', 'குடும்பம் வசிக்கும் இடம்', 'পরিবারের নিবাস'],
  scan: ['Scan to see my profile on Shaadi24', 'मेरी प्रोफ़ाइल देखने के लिए स्कैन करें', 'माझे प्रोफाइल पाहण्यासाठी स्कॅन करा',
    'મારી પ્રોફાઇલ જોવા માટે સ્કેન કરો', 'என் சுயவிவரத்தைப் பார்க்க ஸ்கேன் செய்யவும்', 'আমার প্রোফাইল দেখতে স্ক্যান করুন'],
  made: ['Made with Shaadi24', 'Shaadi24 से बनाया गया', 'Shaadi24 वर बनवले', 'Shaadi24 પર બનાવ્યું', 'Shaadi24 இல் உருவாக்கப்பட்டது', 'Shaadi24-এ তৈরি'],
  share: ['My marriage biodata. See my full profile on Shaadi24:', 'मेरा विवाह बायोडाटा। Shaadi24 पर मेरी पूरी प्रोफ़ाइल देखें:',
    'माझा विवाह बायोडाटा. Shaadi24 वर माझे पूर्ण प्रोफाइल पहा:', 'મારો લગ્ન બાયોડેટા. Shaadi24 પર મારી પૂરી પ્રોફાઇલ જુઓ:',
    'என் திருமண சுயவிவரம். Shaadi24 இல் என் முழு சுயவிவரத்தைப் பாருங்கள்:', 'আমার বিবাহের বায়োডাটা। Shaadi24-এ আমার পুরো প্রোফাইল দেখুন:'],
};
const LANG_INDEX: Record<BiodataLang, number> = { en: 0, hi: 1, mr: 2, gu: 3, ta: 4, bn: 5 };

export const label = (lang: BiodataLang, key: BiodataLabel): string => TABLE[key][LANG_INDEX[lang]];

/** The blessing printed at the top, by religion (the member can leave it off) */
export function invocation(religion?: string): string | null {
  const r = (religion ?? '').toLowerCase();
  if (r.startsWith('hindu')) return '॥ श्री गणेशाय नमः ॥';
  if (r.startsWith('jain')) return '॥ श्री महावीराय नमः ॥';
  if (r.startsWith('sikh')) return 'ੴ ਸਤਿ ਨਾਮੁ';
  if (r.startsWith('muslim') || r.startsWith('islam')) return 'بِسْمِ اللّٰهِ';
  if (r.startsWith('christian')) return '✝';
  if (r.startsWith('buddh')) return '☸';
  return null;
}

export interface BiodataOptions {
  lang: BiodataLang;
  template: BiodataTemplate;
  showDob: boolean;        // the date of birth instead of the age
  blessing: boolean;       // the line at the top
  photo: boolean;
  horoscope: boolean;
  family: boolean;
  about: boolean;
}

export const DEFAULT_OPTIONS: BiodataOptions = {
  lang: 'en', template: 'classic', showDob: false, blessing: true, photo: true, horoscope: true, family: true, about: true,
};

export interface BiodataSection {
  key: BiodataLabel;
  title: string;
  rows: { label: string; value: string }[];
}

// "15 August 1996": a date the way it's printed on a biodata
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** What the biodata says, in sections; empty answers and anything hidden are left out */
export function biodataSections(p: UserProfile, o: BiodataOptions): BiodataSection[] {
  const hidden = new Set(p.hiddenFields ?? []);
  const t = (k: BiodataLabel) => label(o.lang, k);
  const val = (field: string, v: unknown): string => {
    if (hidden.has(field)) return '';
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
    return s;
  };
  const place = hidden.has('location') ? '' : [p.city, p.state, p.country].filter(Boolean).join(', ');
  const section = (key: BiodataLabel, rows: [BiodataLabel, string][]): BiodataSection => ({
    key, title: t(key), rows: rows.filter(([, v]) => !!v).map(([k, v]) => ({ label: t(k), value: v })),
  });
  const siblings = (count?: string, married?: string) =>
    !count || count === '0' || /^none$/i.test(count) ? '' : married ? `${count} (${married})` : count;

  const sections = [
    section('personal', [
      ['name', hidden.has('name') ? '' : (p.name ?? '').trim()],
      o.showDob && p.dateOfBirth ? ['dob', longDate(p.dateOfBirth)] : ['age', p.age ? `${p.age} ${t('years')}` : ''],
      ['height', val('height', p.height)],
      ['marital', val('maritalStatus', p.maritalStatus)],
      ['religion', val('religion', p.religion)],
      ['motherTongue', val('motherTongue', p.motherTongue)],
      ['caste', val('caste', p.caste)],
      ['subCaste', val('subCaste', p.subCaste)],
      ['diet', val('dietaryPreferences', p.dietaryPreferences)],
      ['livesIn', place],
      ['hometown', val('hometown', p.hometown)],
    ]),
    o.horoscope ? section('horoscope', [
      ['gotra', val('gotra', p.gotra)],
      ['manglik', val('manglik', p.manglik)],
      ['rashi', val('rashi', p.rashi)],
      ['nakshatra', val('nakshatra', p.nakshatra)],
      ['birthTime', val('birthTime', p.birthTime)],
      ['birthPlace', val('birthPlace', p.birthPlace)],
    ]) : null,
    section('career', [
      ['education', val('degree', p.degree) || val('educationLevel', p.educationLevel)],
      ['college', val('university', p.university)],
      ['occupation', val('occupation', p.occupation) || val('jobTitle', p.jobTitle)],
      ['employedIn', val('employedIn', p.employedIn)],
      ['income', val('annualIncome', p.annualIncome)],
    ]),
    o.family ? section('family', [
      ['father', val('fatherOccupation', p.fatherOccupation)],
      ['mother', val('motherOccupation', p.motherOccupation)],
      ['brothers', hidden.has('brothers') ? '' : siblings(p.brothers, p.brothersMarried)],
      ['sisters', hidden.has('sisters') ? '' : siblings(p.sisters, p.sistersMarried)],
      ['familyType', val('familyType', p.familyType)],
      ['familyValues', val('familyValues', p.familyValues)],
      ['familyLocation', val('familyLocation', p.familyLocation)],
    ]) : null,
  ];
  const about = o.about ? val('description', p.description) : '';
  const out = sections.filter((s): s is BiodataSection => !!s && s.rows.length > 0);
  if (about) out.push({ key: 'about', title: t('about'), rows: [{ label: '', value: about.slice(0, 420) }] });
  return out;
}

// ---- The link -------------------------------------------------------------------

export interface BiodataLink {
  token: string;
  url: string;
  opens: number;
  lastOpenedAt: string | null;
}

export const biodataUrl = (token: string) => `${LEGAL.websiteUrl}/b/${token}`;

/** The member's link (made the first time) */
export async function fetchBiodataLink(): Promise<BiodataLink> {
  const { data, error } = await supabase.rpc('my_biodata_link');
  if (error || !data) throw new Error(error?.message ?? 'Could not make your link');
  const d = data as { token: string; opens: number; last_opened_at: string | null };
  return { token: d.token, url: biodataUrl(d.token), opens: d.opens, lastOpenedAt: d.last_opened_at };
}

/** Turns the link off: biodatas already shared open nothing */
export async function revokeBiodataLink(): Promise<void> {
  const { error } = await supabase.rpc('revoke_biodata_link');
  if (error) throw new Error(error.message);
}

// ---- Sharing --------------------------------------------------------------------

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/**
 * The picture to WhatsApp (or anywhere): in the apps the phone's share sheet,
 * with the link as its caption. On the website the picture downloads and
 * WhatsApp opens with the link. False if the person closed the share sheet.
 */
export async function shareBiodata(image: Blob, text: string, fileName: string): Promise<boolean> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: await toBase64(image), directory: Directory.Cache });
    try {
      await Share.share({ title: fileName, text, files: [uri], dialogTitle: 'Share your biodata' });
      return true;
    } catch (e) {
      if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return false;
      throw e;
    }
  }
  downloadBiodata(image, fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return true;
}

/** Saves the picture: the share sheet in the apps (Save image), a download on the website */
export async function saveBiodata(image: Blob, fileName: string): Promise<boolean> {
  if (isNativeApp()) return shareBiodata(image, '', fileName);
  downloadBiodata(image, fileName);
  return true;
}

function downloadBiodata(image: Blob, fileName: string) {
  const url = URL.createObjectURL(image);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
