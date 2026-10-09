// ============================================================================
// Searches typed in Indian languages, for the rule-based parser
//
// Gemini (ai.ts) reads any language. When it can't help, the rules in
// matching.ts only know English, so this turns the common words and phrases
// of a search in Hindi or Hinglish ("Mere liye 6 foot ka ladka dhundho jo
// London me rehta ho"), Marathi, Punjabi, Gujarati, Bengali, Tamil, Telugu,
// Kannada or Malayalam, in their own scripts or in English letters, into the
// English the rules understand ("6 ft man London"). Words it doesn't know are
// left as they are (the rules drop letters that aren't English).
// ============================================================================

const L = String.raw`\p{L}\p{M}`;
// A whole word (scripts without spaces between suffixes use stem() instead)
const word = (alts: string) => new RegExp(String.raw`(?<![${L}\d])(?:${alts})(?![${L}])`, 'giu');
// A word starting with this stem: Tamil, Telugu, Kannada and Malayalam add
// endings to the word itself ("லண்டனில்", in London)
const stem = (alts: string) => new RegExp(String.raw`(?<![${L}])(?:${alts})[${L}]*`, 'giu');

// Digits of Indian scripts (०-९, ௦-௯ and the rest) → 0-9: each block's zero
// is at …66 or …E6
const INDIC_DIGIT = /[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯]/g;
const asciiDigits = (s: string) => s.replace(INDIC_DIGIT, (d) => String((d.charCodeAt(0) & 0xf) - 6));

// Phrases first: their word order isn't English ("30 saal se kam" is "under
// 30"; "sharab nahi peeta" is "doesn't drink")
const YEARS_HI = String.raw`(?:saal|sal|varsh|baras|साल|वर्ष|வயது)`;
const YEARS = String.raw`(?:${YEARS_HI}|years?|yrs?)`;
const LESS = String.raw`(?:kam|chhota|chhoti|chote|chhote|niche|neeche|कम|छोटा|छोटी|छोटे)`;
const MORE = String.raw`(?:zyada|jyada|jada|adhik|upar|uper|bada|badi|bade|ज़्यादा|ज्यादा|अधिक|ऊपर|बड़ा|बड़ी|बड़े)`;
const FROM = String.raw`(?:se|से)`;
const FEET = String.raw`(?:feet|foot|fut|ft|फुट|फ़ुट|फीट|அடி)`;
const INCH = String.raw`(?:inch(?:es)?|in|इंच|அங்குலம்)`;
const TALL = String.raw`(?:lamba|lambi|lambe|लंबा|लंबी|लंबे|லம்பா)`;
const NOT = String.raw`(?:nahi|nahin|nai|na|नहीं|नही|ना|मत)`;
const DOES = String.raw`(?:karta|karti|karte|karne|peeta|peeti|peete|pita|piti|pite|khata|khati|khate|करता|करती|करते|पीता|पीती|पीते|खाता|खाती|खाते)`;
const HEIGHT_PHRASE = String.raw`(?<!\d)(\d)\s*${FEET}(?:\s*(\d{1,2})\s*${INCH}?)?`;

const PHRASES: Array<[RegExp, string]> = [
  // ages: "25 se 30 saal", "30 saal se kam", "30 se upar", "30 saal ka"
  [new RegExp(String.raw`(?<!\d)([1-9]\d)\s*(?:${FROM}|-|–|to)\s*([1-9]\d)(?!\d)\s*${YEARS}?`, 'giu'), ' $1 to $2 '],
  [new RegExp(String.raw`(?:umar|umr|age|उम्र|उमर)?\s*(?<!\d)([1-9]\d)(?!\d)\s*${YEARS}?\s*${FROM}\s*${LESS}`, 'giu'), ' under $1 '],
  [new RegExp(String.raw`(?:umar|umr|age|उम्र|उमर)?\s*(?<!\d)([1-9]\d)(?!\d)\s*${YEARS}?\s*${FROM}\s*${MORE}`, 'giu'), ' over $1 '],
  [new RegExp(String.raw`(?<!\d)([1-9]\d)\s*${YEARS_HI}\s*(?:ka|ki|ke|का|की|के)?(?![${L}])`, 'giu'), ' $1 year old '],
  // heights: "6 foot se lamba", "5 feet 6 inch se kam", "6 fut ka"
  [new RegExp(String.raw`${HEIGHT_PHRASE}\s*${FROM}\s*(?:${TALL}|${MORE})`, 'giu'), ' taller than $1 ft $2 '],
  [new RegExp(String.raw`${HEIGHT_PHRASE}\s*${FROM}\s*${LESS}`, 'giu'), ' shorter than $1 ft $2 '],
  [new RegExp(String.raw`${HEIGHT_PHRASE}`, 'giu'), ' $1 ft $2 '],
  // "sharab nahi peeta", "smoke nahi karta": the "not" comes after the habit
  [new RegExp(String.raw`([${L}]+)\s+${NOT}\s+${DOES}(?![${L}])`, 'giu'), ' not $1 '],
  [new RegExp(String.raw`(?:aas\s*paas|aas-paas|paas\s*me|nazdeek|nazdik|mere\s+(?:sheher|shahar|shehar)\s*(?:me|mein)?|आस[\s-]?पास|नज़दीक|पास\s*में)`, 'giu'), ' near me '],
];

// Words → English (or nothing: "mere liye … dhundho" only says "find me")
const WORDS: Array<[RegExp, string]> = [
  // who: Hindi, Punjabi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, in English letters too
  [word('ladka|ladke|ladkaa|larka|larke|munda|munde|mulga|mulgaa|chhokro|chokro|chele|paiyan|payyan|abbayi|abbai|huduga|dulha|dulhe|var|लड़का|लड़के|लडका|लडके|दूल्हा|मुलगा|ਮੁੰਡਾ|છોકરો|ছেলে|ఆబ్బాయి|అబ్బాయి|ಹುಡುಗ|പയ്യൻ|ആൺകുട്ടി'), ' man '],
  [stem('பையன்|ஆண்|மாப்பிள்ளை'), ' man '],
  [word('ladki|ladkiyan|ladkiyaan|larki|kudi|kudiyan|mulgi|mulgee|chhokri|chokri|meye|ponnu|ammayi|ammai|hudugi|dulhan|dulhaniya|vadhu|bahu|लड़की|लडकी|लड़कियां|दुल्हन|वधू|मुलगी|ਕੁੜੀ|છોકરી|মেয়ে|అమ్మాయి|ಹುಡುಗಿ|പെൺകുട്ടി'), ' woman '],
  [stem('பெண்|மணப்பெண்'), ' woman '],
  // work
  [word('डॉक्टर|डाक्टर|daktar|ডাক্তার|ડૉક્ટર|ಡಾಕ್ಟರ್|డాక్టర్'), ' doctor '],
  [stem('மருத்துவர்|டாக்டர்'), ' doctor '],
  [word('इंजीनियर|इंजिनियर|enjiniyar|ইঞ্জিনিয়ার|એન્જિનિયર'), ' engineer '],
  [stem('பொறியாளர்|இன்ஜினியர்|என்ஜினியர்'), ' engineer '],
  [word('वकील|vakil|wakil'), ' lawyer '],
  [stem('வழக்கறிஞர்'), ' lawyer '],
  [word('शिक्षक|टीचर|adhyapak|अध्यापक'), ' teacher '],
  [stem('ஆசிரியர்'), ' teacher '],
  [word('व्यापारी|बिज़नेस|बिजनेस|vyapari|dhandha|dhanda|kaarobaar|karobar'), ' business '],
  [word('सरकारी|sarkari'), ' government '],
  [word('फाइनेंस|फ़ाइनेंस|वित्त'), ' finance '],
  [word('आईटी|सॉफ्टवेयर'), ' software '],
  // habits and food
  [word('sharab|sharaab|daru|daaru|शराब|दारू'), ' drink '],
  [word('cigarette|sigret|sigaret|sigrate|dhumrapan|beedi|bidi|सिगरेट|धूम्रपान|बीड़ी'), ' smoke '],
  [word('shakahari|shaakahaari|shakahaari|शाकाहारी|ಸಸ್ಯಾಹಾರಿ'), ' vegetarian '],
  [stem('சைவ'), ' vegetarian '],
  [word('mansahari|maansahari|मांसाहारी'), ' non vegetarian '],
  [stem('அசைவ'), ' non vegetarian '],
  // marital status, religion, community
  [word('talakshuda|talaakshuda|तलाकशुदा'), ' divorced '],
  [word('avivahit|kunwara|kunwari|kuwara|kuwari|अविवाहित|कुंवारा|कुंवारी'), ' never married '],
  [word('vidhwa|vidhava|vidhur|विधवा|विधुर'), ' widowed '],
  [word('हिंदू|हिन्दू'), ' hindu '], [word('मुस्लिम|मुसलमान'), ' muslim '], [word('सिख'), ' sikh '],
  [word('जैन'), ' jain '], [word('ईसाई'), ' christian '], [word('ब्राह्मण|बामन|baman'), ' brahmin '],
  [word('मांगलिक'), ' manglik '],
  // looks
  [word(TALL), ' tall '],
  [word('sundar|khoobsurat|khubsurat|सुंदर|सुन्दर|खूबसूरत'), ' beautiful '],
  [word('ऑनलाइन'), ' online '],
  // places: their usual English names, as profiles have them
  [word('dilli|दिल्ली'), ' delhi '], [word('bambai|bombay|मुंबई|मुम्बई|बंबई'), ' mumbai '],
  [word('पुणे|पूना|poona'), ' pune '], [word('बेंगलुरु|बेंगलुरू|बैंगलोर|bengaluru'), ' bangalore '],
  [word('हैदराबाद'), ' hyderabad '], [word('चेन्नई|madras|मद्रास'), ' chennai '], [word('कोलकाता|कलकत्ता|calcutta'), ' kolkata '],
  [word('अहमदाबाद'), ' ahmedabad '], [word('जयपुर'), ' jaipur '], [word('लखनऊ'), ' lucknow '], [word('सूरत'), ' surat '],
  [word('इंदौर'), ' indore '], [word('भोपाल'), ' bhopal '], [word('पटना'), ' patna '], [word('चंडीगढ़'), ' chandigarh '],
  [word('नागपुर'), ' nagpur '], [word('landan|लंदन|লন্ডন'), ' london '], [word('amrika|amerika|अमेरिका|अमरीका'), ' usa '],
  [word('kanada|कनाडा'), ' canada '], [word('दुबई'), ' dubai '], [word('ऑस्ट्रेलिया|astreliya'), ' australia '],
  [word('सिंगापुर'), ' singapore '], [word('videsh|bidesh|विदेश'), ' settled abroad '],
  [stem('சென்னை'), ' chennai '], [stem('கோயம்புத்தூர்|கோவை'), ' coimbatore '], [stem('மதுரை'), ' madurai '],
  [stem('திருச்சி'), ' trichy '], [stem('பெங்களூர|பெங்களூரு'), ' bangalore '], [stem('லண்டன'), ' london '],
  [stem('அமெரிக்க'), ' usa '], [stem('சிங்கப்பூர'), ' singapore '], [stem('துபாய'), ' dubai '], [stem('கனடா'), ' canada '],
  [stem('ఆమెరికా|అమెరికా'), ' usa '], [stem('హైదరాబాద'), ' hyderabad '],
  // "not"
  [word(NOT), ' not '],
  // words that only say "find me someone": dropped
  [word([
    'mere|mera|meri|mujhe|mujhko|hamare|hamara|hamari|liye|liyeh|lie|ke|ka|ki|ko|se|mein|mai|main|par|pe|aur|ya|jo|jis|jiska|jiski',
    'jinka|wala|wali|wale|vala|vali|vale|ho|hai|hain|hon|hona|chahiye|chahie|chaiye|chahta|chahti|chahte|dhundho|dhundo|dhoondo|dhoondho',
    'dhundh|dhoondh|dhundhna|khojo|dikhao|dikha|batao|bata|bhejo|koi|kuch|sab|bhi|bahut|bohot|accha|achha|acchi|achi|ache|acche|jaisa',
    'jaisi|rehta|rehti|rehte|rehne|rahta|rahti|rahte|rahne|basa|basi|kaam|karta|karti|karte|karne|karna|kare|naukri|vala|ek|ik',
    'chahiye|chahida|pahije|hava|beku|kavali|venum|vendum|lagbhag|kareeb|kareeban|takriban',
    'मेरे|मेरा|मेरी|मुझे|लिए|के|का|की|को|से|में|मे|पर|और|या|जो|जिसका|जिसकी|वाला|वाली|वाले|हो|है|हैं|चाहिए|ढूंढो|ढूँढो|ढूंढें|ढूँढें|खोजो|दिखाओ',
    'बताओ|कोई|एक|रहता|रहती|रहते|रहने|काम|करता|करती|करते|करने|नौकरी|लगभग|करीब|माझ्यासाठी|मला|हवा|हवी',
  ].join('|')), ' '],
  [stem('எனக்கு|ஒரு|வேண்டும்|தேடு|காட்டு|வசிக்க|வேலை|செய்'), ' '],
];

/** The search with Indian-language words put into English, for the rules */
export function toEnglishWords(prompt: string): string {
  let text = asciiDigits(prompt);
  for (const [pattern, english] of PHRASES) text = text.replace(pattern, english);
  for (const [pattern, english] of WORDS) text = text.replace(pattern, english);
  return text.replace(/\s+/g, ' ').trim();
}
