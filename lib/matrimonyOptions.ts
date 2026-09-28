// ============================================================================
// Answers for the profile's India fields (Phase 12)
//
// Taken from the sign-up forms of Jeevansathi, BharatMatrimony and Shaadi.com
// (September 2026) and tidied: one spelling per answer, today's names for
// states and languages, and a few answers those sites leave out (Bodo, Bhili,
// Gondi, Kodava; Parsi, Bahai and "No religion"; every country). Lists that
// people may not find themselves in (caste, sub-caste, gotra, occupation,
// city) also take a typed answer.
//
// Counts: 78 mother tongues, 479 castes over 4 religions, 1203 sub-castes
// under 62 castes, 155 gotras, 168 degrees, 245 occupations, 226 countries.
// ============================================================================

export interface OptionGroup {
  label: string;
  options: string[];
}

// ---- who and basics --------------------------------------------------------

export const PROFILE_CREATED_FOR = ['Myself', 'Son', 'Daughter', 'Brother', 'Sister', 'Relative', 'Friend'];

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

export const MARITAL_STATUS = ['Never Married', 'Awaiting Divorce', 'Divorced', 'Widowed', 'Annulled'];
export const CHILDREN = ['No', 'Yes, living together', 'Yes, living separately'];
export const CHILDREN_COUNT = ['1', '2', '3', '3+'];
export const DISABILITY = ['None', 'Mobility impairment', 'Visual impairment', 'Hearing impairment',
  'Speech impairment', 'Other disability'];

// 4' 0" to 7' 0", one inch apart, with the height in cm (the database works
// out height_cm from the same text; see height_to_cm() in the Phase 12
// migration).
export function heightLabel(inches: number): string {
  return `${Math.floor(inches / 12)}' ${inches % 12}" (${Math.round(inches * 2.54)} cm)`;
}
export const HEIGHTS: string[] = Array.from({ length: 37 }, (_, i) => heightLabel(48 + i));

// ---- religion and community --------------------------------------------------

export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Parsi', 'Jewish', 'Bahai',
  'Spiritual', 'Agnostic', 'Atheist', 'No religion', 'Other'];

// Grouped by region; Hindi also by region, as families often look for that.
export const MOTHER_TONGUES: OptionGroup[] = [
  { label: 'North', options: [
    'Hindi', 'Hindi (Delhi)', 'Hindi (UP / Uttarakhand)', 'Hindi (MP / Chhattisgarh)',
    'Hindi (Bihar / Jharkhand)', 'Hindi (Rajasthan)', 'Punjabi', 'Urdu', 'Haryanvi', 'Rajasthani', 'Marwari',
    'Mewari', 'Mewati / Ahirwati', 'Shekhawati', 'Dhundhari / Jaipuri', 'Harauti', 'Bagri', 'Wagdi', 'Awadhi',
    'Braj', 'Kannauji', 'Bundeli', 'Garhwali', 'Kumaoni', 'Himachali / Pahari', 'Dogri', 'Kashmiri',
    'Ladakhi', 'Gujari / Gojri',
  ] },
  { label: 'Central', options: ['Chhattisgarhi', 'Malvi', 'Nimadi', 'Gondi', 'Bhili'] },
  { label: 'West', options: ['Marathi', 'Gujarati', 'Kutchi', 'Konkani', 'Sindhi', 'Khandeshi'] },
  { label: 'East', options: [
    'Bengali', 'Odia', 'Bhojpuri', 'Maithili', 'Magahi', 'Angika', 'Bihari', 'Santali', 'Nagpuri / Sadri',
    'Kurukh', 'Kosli',
  ] },
  { label: 'North-East', options: [
    'Assamese', 'Bodo', 'Manipuri', 'Mizo', 'Khasi', 'Garo', 'Tripuri / Kokborok', 'Nagamese', 'Nepali',
    'Lepcha', 'Arunachali', 'Monpa', 'Miji',
  ] },
  { label: 'South', options: [
    'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Tulu', 'Kodava', 'Badaga', 'Sourashtra', 'Lambadi / Banjara',
  ] },
  { label: 'Other', options: ['English', 'Sanskrit', 'French', 'Nicobarese', 'Other'] },
];

export const PREFER_NOT_TO_SAY = 'Prefer not to say';

// Caste lists by religion. Other religions take a typed answer.
export const CASTES: Record<string, string[]> = {
  'Hindu': [
    'Ad Dharmi', 'Adi Andhra', 'Adi Dravida', 'Adi Karnataka', 'Agamudayar', 'Agri', 'Ahir', 'Ahirwar',
    'Ahom', 'Ambalavasi', 'Amma Kodava', 'Arakh Arakvanshiya', 'Arekatica', 'Arunthathiyar', 'Arya Vysya',
    'Ayyaraka', 'Badaga', 'Badhai', 'Bagdi', 'Baghel Gaderiya', 'Bahi', 'Baidya', 'Bairwa', 'Baishnab',
    'Baishya', 'Baishya Kapali', 'Bajantri', 'Balai', 'Balija', 'Balija Naidu', 'Banayat Oriya', 'Bania',
    'Banik', 'Banjara', 'Barai', 'Bari', 'Baria', 'Beldar', 'Besta', 'Bhajantri', 'Bhatia', 'Bhatraju',
    'Bhavsar', 'Bhil', 'Bhovi / Bhoi', 'Bhoyar', 'Bhulia / Meher', 'Billava', 'Bishnoi / Vishnoi', 'Bondili',
    'Boyer', 'Brahmakshatriya', 'Brahmbatt', 'Brahmin', 'Brahmo', 'Buddar', 'Bunt Shetty',
    'Chalawadi / Holeya', 'Chamar', 'Chambhar', 'Chandravanshi Kahar', 'Charan', 'Chasa',
    'Chattada Sri Vaishnava', 'Chaudary', 'Chaurasia', 'Chennadasar', 'Cheramar', 'Chettiar', 'Chhetri',
    'Chippolu Mera', 'CKP', 'Coorgi', 'Dabgar', 'Dasapalanjika Kannada Saineegar', 'Devadigas',
    'Devang Koshthi', 'Devanga', 'Devendra Kula Vellalar', 'Devipujak (Vaghri)', 'Dewar / Dhibara', 'Dhanak',
    'Dhangar', 'Dhanuk', 'Dheevara', 'Dhiman', 'Dhoba', 'Dhobi', 'Dhor / Dhoar', 'Dommala', 'Dumal', 'Dusadh',
    'Edigas', 'Ezhava', 'Ezhuthachan', 'Gabit', 'Ganda', 'Gangai / Ganesh', 'Ganiga', 'Garhwali', 'Gatti',
    'Gavali', 'Gavandi', 'Gavara', 'Ghasi', 'Ghisadi', 'Ghumar', 'Goala', 'Goan', 'Gond Gondi Raj Gond',
    'Gondhali', 'Gopal', 'Goud', 'Gounder', 'Gowda', 'Gramani', 'Gudia', 'Gujjar', 'Guptan', 'Gurav',
    'Halba Koshti', 'Hegde', 'Helava', 'Holar', 'Jaalari', 'Jaiswal', 'Jandra', 'Jangam', 'Jat', 'Jatav',
    'Jetty Malla', 'Jingar', 'Julaha', 'Kachara', 'Kahar', 'Kaibarta', 'Kaikaala', 'Kakkalan', 'Kalal',
    'Kalanji', 'Kalar', 'Kalinga', 'Kalinga Vysya', 'Kalita', 'Kalwar', 'Kamboj', 'Kamma', 'Kammala',
    'Kanakaan Padonna', 'Kanakkan Padanna', 'Kandara', 'Kaniyan', 'Kansari', 'Kansyakaar', 'Kapol', 'Kapu',
    'Kapu Munnuru', 'Karakala Bhakthula', 'Karana', 'Karmakar', 'Karuneegar', 'Kasar', 'Kashyap', 'Katiya',
    'Kayastha', 'Khandayat', 'Kharvi', 'Kharwar', 'Khatik', 'Khatri', 'Koeri / Koiri', 'Koli', 'Koli Mahadev',
    'Kondara', 'Kongu Vellala Gounder', 'Konkani', 'Koracha', 'Korama', 'Kori', 'Kori / Koli', 'Korvi',
    'Koshti', 'Krishnavaka', 'Kshatriya', 'Kshatriya Agnikula', 'Kudumbi', 'Kulalar', 'Kulita', 'Kumaoni',
    'Kumawat', 'Kumbhakar', 'Kumhar / Kumbhar', 'Kummari', 'Kunbi', 'Kurava', 'Kuravan / Kuravar', 'Kurmi',
    'Kurmi Kshatriya', 'Kuruba', 'Kuruhina Shetty', 'Kurumbar', 'Kuruva', 'Kushwaha', 'Kutchi',
    'Kutchi Gurjar', 'Lambadi', 'Laxminarayan Gola', 'Leva Patidar', 'Leva Patil', 'Lingayat', 'Lohana',
    'Lohar', 'Lubana', 'Madiga', 'Mahar', 'Mahendra', 'Maheshwari', 'Mahindra', 'Mahisya', 'Majabi Mazhbi',
    'Mala', 'Mali', 'Mallah', 'Manikpuri', 'Manipuri', 'Manjhi', 'Mannan / Velon / Vannan', 'Mapila',
    'Maratha', 'Maravar', 'Maruthuvar', 'Matang', 'Maurya', 'Meda', 'Meena', 'Meenavar', 'Meghwal', 'Mehra',
    'Mehtar', 'Menon', 'Meru', 'Meru darji', 'Mochi', 'Modak', 'Mogaveera', 'Monchi', 'Motati Reddy',
    'Mudaliar', 'Mudaliar Arcot', 'Mudiraj', 'Muthuraja', 'Naagavamsam', 'Nadar', 'Nagaralu', 'Naicker',
    'Naidu', 'Naik Nayak Nayaka', 'Nair', 'Nair Veluthedathu', 'Nair Vilakkithala', 'Namasudra / Namosudra',
    'Nambiar', 'Nambisan', 'Namboodiri', 'Namdev Chhipa', 'Nandiwale', 'Napit', 'Nath Jogi', 'Nayee (Barber)',
    'Nepali', 'Nessi / Kurni', 'Nhavi', 'Nonia', 'OBC', 'Odan', 'Oraon', 'Oswal', 'Otari', 'Padmashali',
    'Pal', 'Panan', 'Panchal', 'Panchamsali', 'Pandaram', 'Panicker', 'Pano', 'Paravan Bhartar',
    'Parkava Kulam', 'Parvatha Rajakulam', 'Pasi', 'Paswan / Dusadh', 'Patel', 'Patel Dodia', 'Patel Kadva',
    'Patel Leva', 'Patel Lodhi', 'Pathare Prabhu', 'Patnaick', 'Patra', 'Perika', 'Pillai',
    'Pollon Devandra Kula Vellalan', 'Ponan', 'Poosala', 'Poundra', 'Prajapati', 'Pulaya Chruman', 'Rabari',
    'Raigar', 'Raikwar', 'Rajaka', 'Rajbhar', 'Rajbongshi', 'Rajpurohit', 'Rajput', 'Rajput Garhwali',
    'Rajput Kumaoni', 'Rajput Rohella Tank', 'Ramdasia', 'Ramgarhia', 'Ramoshi Berad Bedar', 'Ravidasia',
    'Rawat', 'Reddy', 'Relli', 'Rohit Chamar', 'Ror', 'Sadgope', 'Saha', 'Sahu', 'Saini', 'Saliya', 'Samagar',
    'Sambava', 'Santhali', 'Sargara', 'Sathwara', 'Satnami', 'Savji', 'Sawantwadi', 'Scheduled Caste',
    'Scheduled Tribe', 'Senai Thalaivar', 'Senguntha Mudaliyar', 'Settibalija', 'Shah', 'Shilpkar', 'Shimpi',
    'Silawat', 'Sillekyatha', 'Sindhi', 'Siyal', 'SKP', 'Somvanshi', 'Somvanshi Kayastha Prabhu',
    'Sonar / Sunar', 'Sonkar', 'Sourashtra', 'Sozhiya Vellalar', 'Srisayani', 'SSK', 'Subarna Banik',
    'Sudi Suri Sundhi Shaundik', 'Sugali (Naika)', 'Sutar', 'Swakula sali', 'Swarnkar', 'Tamboli', 'Tammali',
    'Tanti', 'Tantuway', 'Telaga', 'Teli', 'Thachar', 'Thakkar', 'Thandan', 'Tharakan', 'Thevar Mukkulathor',
    'Thigala', 'Thiyya', 'Tili', 'Togata', 'Tonk Kshatriya', 'Tribe', 'Turi', 'Turupu Kapu', 'Uppara',
    'Vadar', 'Vaddera', 'Vaduka', 'Vaidiki Velanadu', 'Vaish', 'Vaishnav', 'Vaishnav Vanik', 'Vaishnava',
    'Vaishya', 'Vaishya Vani', 'Vallala', 'Valluvar', 'Valmiki', 'Valuvan', 'Vania', 'Vaniya', 'Vanjara',
    'Vanjari', 'Vankar', 'Vannar', 'Vannia Kula Kshatriyar', 'Vanniyar', 'Variar', 'Varshney',
    'Veershaiva Veera Saivam', 'Velaan', 'Velama', 'Velan', 'Vellalar', 'Vettuva Gounder', 'Vettuvan',
    'Vishwakarma', 'Vokkaliga', 'Vysya', 'Wani', 'Yadav / Yadava', 'Yellapu', 'Other',
  ],
  'Muslim': [
    'Ansari', 'Arain', 'Awan', 'Barhai', 'Bohra', 'Chikwa', 'Dekkani', 'Dhunia', 'Dudekula', 'Hajjam',
    'Hanafi', 'Jat', 'Kabaria', 'Khoja', 'Kumhar', 'Lebbai', 'Malik', 'Manihar', 'Mapila', 'Maraicar',
    'Memon', 'Mughal', 'Pathan', 'Qureshi', 'Rajput', 'Sheikh', 'Sheikh Syed', 'Syed', 'Teli', 'Other',
  ],
  'Sikh': [
    'Arora', 'Bhatia', 'Gursikh', 'Jat', 'Kamboj', 'Kesadhari', 'Khashap Rajpoot', 'Khatri', 'Labana',
    'Mazhbi', 'Nai', 'Prajapati', 'Rai Sikh', 'Rajput', 'Ramdasia', 'Ramgarhia', 'Ravidasia', 'Saini',
    'Scheduled Caste', 'Tonk Kshatriya', 'Other',
  ],
  'Jain': ['Digamber', 'Shwetamber', 'Other'],
};

// Sub-castes by caste (Jeevansathi's full list). Other castes take a typed answer.
export const SUB_CASTES: Record<string, string[]> = {
  'Ahir': ['Ahir shimpi'],
  'Ambalavasi': ['Pisharody', 'Poduval'],
  'Baishya': ['Saha'],
  'Balija': [
    'Balija Naidu', 'Balija Reddy', 'Ediga / Goud (Balija)', 'Gajula / Kavarai', 'Kapu', 'Kavara',
    'Linga Balija', 'Modikarlu', 'Munnuru Kapu', 'Musukama', 'Namdarlu', 'Pagadala', 'Perika', 'Setti Balija',
    'Surya Balija', 'Telaga', 'Thota', 'Vada Balija', 'Velama', 'Waada Balija',
  ],
  'Balija Naidu': [
    'Balija Naidu', 'Balija Reddy', 'Setti Balija', 'Surya Balija', 'Vada Balija', 'Waada Balija',
  ],
  'Bania': [
    'Agarwal', 'Agrahari', 'Asathi', 'Ayodhyavasi', 'Baniya Kumuti', 'Barnwals', 'Bisa Agarwal', 'Chaturth',
    'Choudharys', 'Dosar / Dusra', 'Gahoi', 'Gandha Vanika', 'Gulahre', 'Jaiswal', 'Kalwar', 'Kandu / Kanu',
    'Kanojia Kanu', 'Kanykubj Bania', 'Kasaundhan', 'Keshris / Kesarwani', 'Khandelwal', 'Komti Arya Vaishya',
    'Lad', 'Madhesiya / Kawa / Halwai', 'Mahajan', 'Mahawar', 'Maheshwari / Meshri', 'Mahor', 'Mahuri',
    'Marwari', 'Modh Ghanchi', 'Modi', 'Nema', 'Oswal', 'Padmavati Porwal', 'Patwa', 'Porwal / Porwar',
    'Rastogi', 'Rathi', 'Rauniars', 'Rauniyar', 'Shaw / Sahu / Teli', 'Sinduriya',
    'Sudi / Suri / Sundhi / Shaundik', 'Ummar / Umre / Bagaria', 'Vaishnav', 'Vani / Vaishya', 'Varshneys',
    'Vijayvargia',
  ],
  'Banjara': ['Lambani'],
  'Brahmin': [
    '6000 Niyogi', 'Anavil', 'Andhra', 'Audichya', 'Audichyasahastra', 'Bajkhedwal', 'Bardai', 'Barendra',
    'Bengali', 'Bhargava', 'Bhatt', 'Bhumihar', 'Brahacharanam', 'BrahmBhatt', 'Brajastha Maithil',
    'Chittpavan Kokanastha', 'Dadhich', 'Daivadnya', 'Danua', 'Deshastha', 'Devrukhe', 'Dhiman', 'Dravida',
    'Dunua', 'Embrandiri', 'Garhwali', 'Gaud Saraswat (GSB)', 'Gaur', 'Gautam', 'Goswami', 'Gujar Gaur',
    'Gujrati', 'Gurukkal', 'Halua', 'Havyaka', 'Hoysala', 'Iyengar', 'Iyer', 'Jangid', 'Jangra', 'Jhadua',
    'Jhijhotiya', 'Jogi', 'Jyotish', 'Kannada', 'Kanyakubj', 'Karhade', 'Karnataka', 'Kashmiri Pandit',
    'Khadayat', 'Khandelwal', 'Khedaval', 'Koknastha', 'Kota', 'Kulin', 'Kumaoni', 'Madhwa', 'Maharastra',
    'Maithil', 'Malviya', 'Marwari', 'Mevada', 'Modh', 'Mohapatra Mahapatra', 'Mohyal', 'Nagar', 'Namboodiri',
    'Narmadiya', 'Nayi / Nai', 'Paliwal', 'Panda', 'Pandit', 'Panicker', 'Pareek', 'Pushkarna',
    'Rajapuri Saraswat', 'Rajasthani', 'Rajgor', 'Rarhi', 'Rigvedi', 'Rudraj', 'Sachora', 'Sakaldwipi',
    'Sanadya', 'Sanchihar', 'Sanketi', 'Saraswat', 'Sarotri', 'Sarua', 'Saryuparin', 'Shivalli', 'Shrimali',
    'Sikhwal', 'Smartha', 'Sri Vishnava', 'Stanika', 'Tapodhan', 'Tyagi', 'Utkal', 'Vaidiki', 'Vaikhanasa',
    'Vaikhawas', 'Vaishnav', 'Valam', 'Velanadu', 'Viswa', 'Vyas', 'Yajurvedi', 'Zalora',
  ],
  'Chaudary': ['Ghrit'],
  'Chettiar': [
    '24 Manai Telugu Chettiar', '24 Manai Telugu Chettiar 16 Veedu', '24 Manai Telugu Chettiar 8 Veedu',
    'Achirapakkam Chettiar', 'Agaram Vellan Chettiar', 'Arya Vysya', 'Ayira Vysya', 'Beri Chettiar',
    'Devanga Chettiar', 'Elur Chetty', 'Gandla / Ganiga', 'Kasukara', 'Kongu Chettiar', 'Kuruhini Chetty',
    'Manjapudur Chettiar', 'Nattukottai Chettiar', 'Padma Saliar', 'Pannirandam Chettiar',
    'Parvatha Rajakulam', 'Pattinavar', 'Pattusali', 'Sadhu Chetty', 'Saiva Vellan Chettiar',
    'Senai Thalaivar', 'Sozhia Chettiar', 'Telugupatti', 'Vadambar', 'Vaniya Chettiar', 'Vellan Chettiar',
  ],
  'Coorgi': ['Kodava'],
  'Devang Koshthi': ['Devanga', 'Devanga Chettiar'],
  'Dhobi': ['Kanaujia'],
  'Digamber': [
    'Agarwal', 'Bania', 'Jaiswal', 'Khandelwal', 'Kutchi', 'KVO', 'Oswal', 'Porwal', 'Vaishta', 'Intercaste',
  ],
  'Ezhava': ['Ezhava panicker', 'Ezhava Thandan', 'Kavuthiya', 'Thiyya'],
  'Ganiga': ['Shiva Jyothipana'],
  'Gounder': [
    'Kongu Vellala Gounder', 'Nattu Gounder', 'Urali Gounder', 'Vanniya Kula Kshatriyar', 'Vettuva Gounder',
  ],
  'Gowda': [
    'Arebashe', 'Bunt', 'Das', 'Gangadikar', 'Gowda-Kuruba Gowda', 'Hallikar', 'Hosadevaru', 'Kunchitaga',
    'Morasu', 'Musuku', 'Namadari', 'Okkaliga', 'Reddy', 'Sarpa', 'Uttamakula',
  ],
  'Gujjar': ['Dode', 'Leva'],
  'Jat': [
    'Achara', 'Agharia', 'Agoh', 'Agra', 'Ahlawat', 'Alwal', 'Antil / Antal', 'Arya', 'Badhwar', 'Bagaria',
    'Bagri', 'Bains', 'Balhara', 'Balyan', 'Bana', 'Barach', 'Bargoti', 'Beniwal', 'Bhakar', 'Bhal', 'Bhambu',
    'Bhodu', 'Bomal', 'Budania', 'Bugaliya', 'Burdak', 'Chahal', 'Chaudhry', 'Chauhan', 'Chhikara / Chikara',
    'Chillar', 'Dabas', 'Dagar', 'Dagua', 'Dahiya', 'Dalal', 'Dangi', 'Dara', 'Deshwal', 'Dhaka', 'Dhama',
    'Dhanchak', 'Dhanda', 'Dhankhar', 'Dhatarwal', 'Dhillon', 'Dhomi', 'Dhoot', 'Dhoriwal', 'Dhull', 'Dollya',
    'Dudi', 'Duhan', 'Gahlot', 'Garhwal', 'Gehlawat', 'Ghangas', 'Gill', 'Godara', 'Grewal', 'Gulia', 'Heer',
    'Hooda', 'Jaglon', 'Jakhar', 'Jam', 'Janu', 'Jaswal', 'Jatasra', 'Jewlia', 'Jutrana', 'Kadian', 'Kahlon',
    'Kajala', 'Kakran', 'Kalen', 'Kaliramna', 'Kalkhanse', 'Karwasra', 'Kaswan', 'Kataria', 'Khakar',
    'Khallia', 'Kharb', 'Khatkar', 'Khatri', 'Kherwa', 'Khichad', 'Kothari', 'Kuhar', 'Kulhari', 'Kundu',
    'Kuntal', 'Lakhlan', 'Lakra', 'Lamba', 'Lamoria', 'Lather', 'Lathwal', 'Latiyan', 'Laur', 'Lehga', 'Maan',
    'Mahan', 'Malhan', 'Malik', 'Mandhan', 'Mangat', 'Mann Rai', 'Meel', 'Mehria', 'Mhla', 'Mohar', 'Moond',
    'Mor / More', 'Nain', 'Nairwal', 'Nandal', 'Nara', 'Natt / Nat', 'Nauhr', 'Nehra', 'Nitharwal', 'Ola',
    'Pachehra', 'Palsania', 'Panghal', 'Panwar', 'Parihar', 'Pattor', 'Pawar', 'Phalaswal', 'Phogat',
    'Pilania', 'Pooni', 'Poria', 'Punia', 'Rahan', 'Rajaura', 'Rana', 'Rangi', 'Ranwa', 'Rao', 'Rathi',
    'Rawal', 'Redhu', 'Repswal', 'Saharan', 'Sandhi', 'Sangawan', 'Sansanwal', 'Saran', 'Saroha', 'Sarot',
    'Sehrawat', 'Sheokhand', 'Sheoran', 'Shokeen', 'Sidhu', 'Sikarwar', 'Sindhu', 'Singhal', 'Sinsinwar',
    'Sirohi', 'Siwach', 'Solanki', 'Suhag', 'Sunda', 'Takhar', 'Tanar', 'Tangar', 'Tanwar', 'Tevatia',
    'Thakaran', 'Thenua', 'Thori', 'Tokas', 'Tomar',
  ],
  'Kapu': [
    'Balija / Balija Naidu', 'Ediga / Goud (Balija)', 'Gajula / Kavarai', 'Kapu All', 'Kapu Munnuru',
    'Kapu Naidu', 'Kurupu / Kapu', 'Ontari', 'Perika', 'Reddy', 'Setty Balija', 'Surya Balija', 'Telaga',
    'Turupu Kapu', 'Velama',
  ],
  'Kashyap': ['Nishad'],
  'Kayastha': [
    'Ambastha', 'Ambastha Kayastha', 'Asthana', 'Barujibi', 'Basu', 'Bengali Kayastha', 'Bhatnagar', 'Bose',
    'Chanda', 'Dass', 'Dey', 'Dhar', 'Dutta', 'Ghosh', 'Gour', 'Guha', 'Johri', 'Karna', 'Kars', 'Kulin',
    'Kulshreshtha', 'Mathur', 'Mitra', 'Nag', 'Nandi', 'Nigam', 'Palit', 'Paul', 'Rakshit', 'Rarhi', 'Roy',
    'Saxena', 'Sen', 'Sil', 'Sinha', 'Srivastava',
  ],
  'Khandayat': ['Kalinja'],
  'Khatri': [
    'Anand', 'Arora', 'Bagga', 'Bahl', 'Batra', 'Batta', 'Bedi', 'Behal', 'Behl', 'Beri', 'Bhalla',
    'Bhandari', 'Bhasin', 'Bhatti', 'Bindra', 'Chaddha', 'Chadha', 'Chandok', 'Chaudhary', 'Chhabra',
    'Chopra', 'Choudhuri', 'Dang', 'Dhawan', 'Dhingara', 'Dhir', 'Duggal', 'Ghai', 'Handa', 'Jaggi',
    'Jairath', 'Jerath', 'Jham', 'Kakkar', 'Kapur / Kapoor', 'Kehar', 'Khanna', 'Khosla', 'Khukrain',
    'Khullar', 'Kochar', 'Kohli', 'Lamba', 'Mahendru', 'Malhotra', 'Marwah', 'Mehra', 'Mehra / Malhotra',
    'Mehta', 'Nagrath', 'Nanda', 'Nayyar', 'Oberoi', 'Ohri', 'Passi', 'Puri', 'Sabharwal', 'Sahni', 'Sareen',
    'Sarin', 'Sawhney', 'Sehgal', 'Sekhri', 'Seth', 'Sethi', 'Sobto', 'Sodhi', 'Sondhi', 'Soni', 'Sood',
    'Suri', 'Talwar', 'Tandon', 'Thapar', 'Tuli', 'Uppal', 'Vadhera', 'Verma', 'Vij', 'Vohra', 'Wadhawan',
    'Wahi', 'Walia',
  ],
  'Koli': ['Koli Mahadev', 'Koli Patel', 'Mangela'],
  'Kongu Vellala Gounder': [
    'Aadai', 'Aadhi', 'Aanthai', 'Aavan', 'Alagan', 'Andai', 'Andhuvan', 'Cheran', 'Devendran', 'Eenjan',
    'Ennai', 'Kaadai', 'Kaari', 'Kanakkan', 'Kannan', 'Kannandhai', 'Keeran', 'Koorai', 'Koventhar',
    'Kuzhlaayan', 'Maadai', 'Maniyan', 'Medhi', 'Muthan', 'Muzhlukkadhan', 'Nattu Gounder', 'Odhaalar',
    'Paandian', 'Padaithalaiyan', 'Panaiyan', 'Panangadai', 'Pannai', 'Pannan', 'Pavalan', 'Payiran',
    'Periyan', 'Perizhanthan', 'Perunkudi', 'Pillan', 'Podiyan', 'Ponnan', 'Poochadhai Poodhiyan', 'Poosan',
    'Sathandhai', 'Sedan', 'Sellan', 'Sempoothan', 'Sengannan', 'Sengunni', 'Seralan', 'Sevadi', 'Thodai',
    'Thooran', 'Vannakkan', 'Veliyan', 'Vellamban', 'Venduvan', 'Viliyan', 'Villi',
  ],
  'Kshatriya': [
    'Agnikula Kshatriya', 'Aguri Ugra Kshatriya', 'Amethia', 'Bachhil', 'Bagel', 'Baghela / Veghela',
    'Banafar', 'Bhadoria', 'Bhandari', 'Bhardwaj', 'Bhatraju', 'Bhavasar Kshatriya', 'Bundela', 'Chopra',
    'Chudasa', 'Dangi', 'Dhawan', 'Dixit', 'Gaherwar', 'Gargvansi', 'Gaur', 'Hada', 'Haihaivanshi', 'Jaiswar',
    'Janwar', 'Kandera', 'Kapur', 'Katiyar', 'Khandayat', 'Khanna', 'Khare', 'Kshatriya Raju',
    'Kshatriya Raju Chandravamsam', 'Kshatriya Raju Suryavamsam', 'Kumawat', 'Kurmi', 'Mehra', 'Nagvanshi',
    'Negi', 'Niari', 'Nikhumbh', 'Paliwal', 'Pawar', 'Perika Puragiri Kshatriya', 'Pundir', 'Raikwar',
    'Rajkumar', 'Rajwar', 'Rama Kshatriya', 'Rathor', 'Rawal', 'Rawat', 'Sahni', 'Saithwar- Mall', 'Sami',
    'Sengar', 'Seth', 'Shrinet', 'Singh', 'Sisodiya', 'Soma Vamsha Arya Kshatriya',
    'Somavanshi Sahasrarjun Kshatriya', 'Somvanshi', 'Tandon', 'Tanwar', 'Thogata Veera Kshatriya',
    'Tomar / Tanwar', 'Tong Kshatriya', 'Vahi', 'Vohra', 'Wadhwa',
  ],
  'Kunbi': [
    'Ghatode', 'Kunbi- Dhanoje', 'Kunbi- Khaire', 'Kunbi- Khedule', 'Kunbi- Lonari', 'Kunbi- Maratha',
    'Kunbi- Tirale', 'Zade',
  ],
  'Kurmi': [
    'Awadhiya', 'Baghel', 'Chandel', 'Chandra', 'Chandrakar', 'Chandrawanshi', 'Chaudhary', 'Chaudhury',
    'Deshmukh', 'Gangwar', 'Ghamaila', 'Jaiswar', 'Kashyap', 'Katiyar', 'Kochyasa', 'Kumar',
    'Kushwaha (Koiri)', 'Mahata', 'Mahato', 'Mahto', 'Parganiha', 'Patel', 'Patidar', 'Prasad', 'Rai',
    'Sachan', 'Singh', 'Verma',
  ],
  'Kurmi Kshatriya': [
    'Awadhya', 'Baghel', 'Chandel', 'Chandra', 'Chandrakar', 'Chandrawanshi', 'Chaudhury', 'Deshmukh',
    'Gangwar', 'Ghamaila', 'Jaiswar', 'Kashyap', 'Katiyar', 'Kochaisa', 'Kumar', 'Kushwaha Koiri', 'Mahata',
    'Mahato', 'Mahto', 'Parganiha', 'Patel', 'Prasad', 'Rai', 'Sachan', 'Singh', 'Verma',
  ],
  'Lingayat': [
    'Agasa', 'Akkasali', 'Aradhya', 'Balegala', 'Banagar', 'Banajiga', 'Bhandari', 'Bilijedaru', 'Bilimagga',
    'Chaturtha', 'Dikshwant', 'Ganiga', 'Gowda', 'Gowli', 'Gurav', 'Hadapada', 'Hatgar',
    'Hoogar / Hugar / Jeer', 'Jadaru', 'Jangam', 'Kudu Vokkaliga', 'Kumbar / Kumbara', 'Kumbhar',
    'Kuruhina Setty', 'Lamba', 'Lolagonda', 'Madivala', 'Malgar', 'Mali', 'Neelagar', 'Neeli / Neelagar',
    'Neygi', 'Nolamba', 'Pancham', 'Panchamasali', 'Pattasali', 'Reddy Reddi', 'Sadar',
    'Sajjan / Sajjanaganigar', 'Setty', 'Shilwant', 'Shiva Simpi', 'Vani', 'Veerashaiva',
  ],
  'Lohana': ['Ghoghari', 'Halai', 'Kutchi', 'Vaishnav'],
  'Mallah': ['Kewat / Keot', 'Nishad'],
  'Maratha': [
    '96 Kuli Maratha', '96K Kokanastha', 'Aramari Gabit', 'Deshastha Maratha', 'Deshmukh', 'Deshtha Maratha',
    'Gomantak Maratha', 'Jhadav', 'Kokanastha Maratha', 'Kunbi Dhanoje', 'Kunbi Khaire', 'Kunbi Khedule',
    'Kunbi Lonari', 'Kunbi Maratha', 'Kunbi Tirale', 'Malwani', 'Maratha Kshatriya', 'Parit', 'Patil',
    'Sonar', 'Suthar', 'Vani',
  ],
  'Maurya': ['Kachchi', 'Kushwaha'],
  'Mudaliar': [
    'Agamudayar / Arcot / Thuluva Vellala', 'Isai Vellalar', 'Kerala Mudali', 'Kongu Vellala Gounder',
    'Mudailiar Arcot', 'Mudaliar All', 'Mudaliar Saiva', 'Mudaliar Sengupta', 'Saiva Pillai Tirunelveli',
    'Sengunthar / Kaikolar', 'Sozhiya Vellalar', 'Thondai Mandala Vellala', 'Veerakodi Vellala',
  ],
  'Nadar': ['Kongu Nadar'],
  'Naicker': ['Naicker others', 'Naicker-Vanniya Kula Kshatriyar', 'Rajaka Chakali Dhobi'],
  'Naidu': [
    'Balija Naidu', 'Ediga / Goud', 'Gajula Kavarai', 'Gavara', 'Kamma', 'Kapu Naidu', 'Munnuru Kapu',
    'Mutharaja', 'Perika', 'Raja Kambalathu Naicker', 'Raju', 'Reddy', 'Shetty Balija', 'Surya Balija',
    'Telaga', 'Turupu Kapu', 'Vada Balija', 'Vadugan', 'Velama', 'Yadava Naidu',
  ],
  'Nair': [
    'Adiyodi', 'Anthur', 'Chekkala Nair', 'Illam', 'Kaimal', 'Kartha', 'Kiryathil', 'Kurup', 'Maniyani',
    'Mannadiar', 'Marar', 'Menon', 'Nair All', 'Nair-Vaniya', 'Nambiar', 'Panicker', 'Pillai', 'Poduval',
    'Thampi', 'Tharakan', 'Unnithan', 'Vellala Pillai', 'Veluthedathu', 'Vilakkithala',
  ],
  'Padmashali': [
    'Devanga', 'Jaandra', 'Kaikaala', 'Karakala Bhakthula', 'Karni Bhakthula', 'Kurni', 'Neeli Saali',
    'Nessi', 'Pattusali', 'Shettigar', 'Swakula Saali', 'Thogata Veerakshathriya',
  ],
  'Patel': [
    'Anjana (Chowdary) Patel', 'Desai', 'Dodia', 'Kadava Patel', 'Leva Patel', 'Matia Patel', 'Patel Desai',
  ],
  'Patel Leva': [
    '27 Gam', 'Baavis Gam', 'Chaa Gam', 'Chovis Gam', 'Mota Sattavi', 'Nani Sattavi', 'Panch Gam',
  ],
  'Pillai': [
    'Aaru Nattu Vellala', 'Agamudayar / Arcot / Thuluva Vellala', 'Cherakula Vellalar', 'Desikar',
    'Desikar Thanjavur', 'Illaththu Pillai', 'Isai Vellalar', 'Karkathar', 'Kodikal Pillai', 'Nanjil',
    'Nanjil Mudali', 'Nankudi Vellalar', 'Othuvaar', 'Pandiya Vellalar', 'Saiva Pillai Thanjavur',
    'Saiva Pillai Tirunelvi', 'Sengunthar / Kaikolar', 'Sozhiya Vellalar', 'Thondai Mandala Vellala',
    'Veerakodi Vellala', 'Vellala Pillai',
  ],
  'Rajaka': ['Rajaka Vannar'],
  'Rajput': [
    'Aheria Rajput', 'Baghel', 'Bais', 'Bankawat', 'Bargujar', 'Bhadauria', 'Bharbhunja', 'Bhatti',
    'Bhriguvansha', 'Bisen', 'Bisht', 'Chandel', 'Chandravanshi', 'Chandrawat', 'Chauhan', 'Chawda / Chavada',
    'Chib', 'Chundawat', 'Dhakare', 'Dixit', 'Doad', 'Dogra', 'Durgavanshi', 'Gahlot', 'Garhwal', 'Gautam',
    'Gogawat', 'Gohil', 'Goud / Gaur', 'Jadeja', 'Jadon', 'Jamwal', 'Janjua', 'Jasrotia', 'Jaswal', 'Jhala',
    'Kachwaha', 'Kalyanot', 'Kalyat', 'Karadiya / Nadoda', 'Katoch', 'Kaushik', 'Khadagvanshi Khagi',
    'Khangarot', 'Khati', 'Kirar', 'Kumaoni', 'Kuruvanshi', 'Kushwaha', 'Lodhi Rajput', 'Loniya Lonia Lunia',
    'Madad', 'Mahror', 'Mahthan', 'Mahyavanshi', 'Mair Rajput Swarnkar', 'Manhas', 'Nagvanshi', 'Naruka',
    'Nathawat', 'Negi', 'Nikumbh', 'Oad Rajput', 'Parihar', 'Parmar', 'Pathania', 'Pratihar', 'Pundir',
    'Raghuvanshi', 'Rajawal', 'Rajput Swarnkar', 'Rana', 'Rao', 'Rathore', 'Rawa Rajput', 'Rawal', 'Rawat',
    'Rohilla', 'Sagar Rajput', 'Sainthwar Rajput', 'Sarangdevot', 'Sengar', 'Shakya', 'Shekhawat', 'Sikarwar',
    'Singh', 'Sisodia', 'Solanki', 'Somvansha', 'Surwar', 'Suryavanshi', 'Tanwar', 'Thakur', 'Tomar',
    'Ujjain', 'Vaishhya', 'Verma',
  ],
  'Reddy': [
    'Ayodhi', 'Bhoomanchi Reddy', 'Chowdary', 'Desuru', 'Gandla', 'Ganjam', 'Gone Kapu', 'Gudati', 'Kapu',
    'Motati', 'Palle', 'Palnati', 'Panta', 'Pedakanti', 'Poknati', 'Reddiar', 'Sajjana', 'Vanni', 'Velanati',
  ],
  'Shwetamber': [
    'Agarwal', 'Bania', 'Jaiswal', 'Khandelwal', 'Kutchi', 'KVO', 'Oswal', 'Porwal', 'Vaishta', 'Intercaste',
  ],
  'Sindhi': [
    'Sindhi Amil', 'Sindhi Baibhand', 'Sindhi Bhanusali', 'Sindhi Bhatia', 'Sindhi Chhapru', 'Sindhi Daru',
    'Sindhi Hydrabadi', 'Sindhi Larai', 'Sindhi Larkan', 'Sindhi Larkana', 'Sindhi Lohana', 'Sindhi Rohiri',
    'Sindhi Sahiti', 'Sindhi Sakkhar', 'Sindhi Sehwani', 'Sindhi Shikarpuri', 'Sindhi Thatai',
  ],
  'Thevar Mukkulathor': [
    'Agamudayar', 'Ambalakarar', 'Appanad Kondayamkottai Maravar', 'Easanattu Kallar', 'Kallar',
    'Maniyakarar', 'Maravar', 'Piramalai Kallar', 'Rajakula Agamudayar', 'Sembanad Maravar', 'Servai',
    'Thanjavur Kallar', 'Vallambar',
  ],
  'Thiyya': ['Ezhava', 'Kavuthiya', 'Thiyya Thandan'],
  'Vaish': ['Vaish Dhaneshawat'],
  'Vaishnav': [
    'Bairagi Swami', 'Vaishnav Bhatia', 'Vaishnav Dishaval', 'Vaishnav Kapol', 'Vaishnav Khadyata',
    'Vaishnav Lad', 'Vaishnav Modh', 'Vaishnav Porvad', 'Vaishnav Shrimali', 'Vaishnav Sorathaiya',
    'Vaishnav Vania',
  ],
  'Vaishnava': ['Brahmin Sri Vaishnava', 'Chhatada Sri Vaishnava', 'Sri Vaishnava'],
  'Vaishya': ['Mahuri', 'Mathur Vaishya'],
  'Vaniya': ['Nair-Vaniya', 'Vaniya Chettiar'],
  'Vannia Kula Kshatriyar': [
    'Arasu', 'Gounder', 'Naicker', 'Padayachi', 'Palli', 'Pandal', 'Urs', 'Vannia Reddiar', 'Vanniyar',
  ],
  'Velama': ['Adivelama', 'Koppula', 'Padmanayaka', 'Polinati', 'Yellapa'],
  'Vellalar': [
    'Aaru Nattu Vellala', 'Agamudayar / Arcot / Thuluva Vellala', 'Cherakula Vellalar', 'Desikar',
    'Devendra Kula Vellalar', 'Illaththu Pillai', 'Isai Vellalar', 'Karkathar', 'Kodikal Pillai',
    'Kongu Vellala Gounder', 'Nanjil Mudali', 'Nanjil Nattu Vellalar', 'Nanjil Vellalar', 'Nankudi Vellalar',
    'Othuvaar', 'Pandiya Vellalar', 'Saiva Pillai Thanjavur', 'Saiva Pillai Tirunelveli', 'Saiva Vellalar',
    'Sengunthar / Kaikolar', 'Sozhiya Vellalar', 'Thondai Mandala Vellala', 'Veerakodi', 'Vellalar All',
  ],
  'Vishwakarma': ['Black Smith', 'Carpentry (Vadrangi, Vadla)', 'Goldsmiths', 'Sculptor (Shilpi)'],
  'Yadav / Yadava': [
    'Aheer / Ahir', 'Ala Golla', 'Daddi', 'Das', 'Dhador', 'Erragola', 'Gadri / Gadariya', 'Gauda', 'Gawli',
    'Goal / Gola / Golla', 'Gop / Gopal / Gopala', 'Goriya', 'Gwala', 'Gwalvanshi', 'Jadav', 'Kohar', 'Konar',
    'Korna', 'Krishnauth', 'Kurudas Gollas', 'Kuruma', 'Mandal', 'Manjrauth', 'Nandvanshi', 'Pakanati',
    'Puja', 'Raut', 'Suryavanshi', 'Thethwar', 'Yadav Golla', 'Yaduvanshi',
  ],
};

// Muslim sect; Christian denomination.
export const SECTS: Record<string, string[]> = {
  'Muslim': ['Sunni', 'Shia', 'Other'],
  'Christian': [
    'Anglo Indian', 'Born Again', 'Brethren', 'Catholic', 'Catholic - Knanaya', 'Catholic - Latin',
    'Catholic - Malankara', 'Catholic - Roman', 'Catholic - Syrian', 'Chaldean', 'CMS', 'CSI', 'Evangelical',
    'Indian Orthodox', 'Jacobite', 'Jacobite - Knanaya', 'Jacobite - Syrian', 'Kharvi', 'Knanaya',
    'Mangalorean', 'Marthomite', 'Nadar', 'Pentecost', 'Protestant', 'Syrian', 'Syrian - Malabar',
    'Syrian - Orthodox', 'Syro - Malabar', 'Other',
  ],
};
export const SECT_LABEL: Record<string, string> = { Muslim: 'Sect', Christian: 'Denomination' };
export const GOTRA_RELIGIONS = ['Hindu', 'Jain', 'Sikh'];
export const GOTRAS = [
  'Aatharvas', 'Agasthi', 'Ahabhunasa', 'Alampayana', 'Angiras', 'Arrishinimi', 'Athreyasa', 'Atri',
  'Attarishi', 'Aukshanas', 'Aushanas', 'Babrahvya', 'Badarayana', 'Baijvayas', 'Bashan', 'Bharadwaj',
  'Bhargava', 'Bhasyan', 'Bhrigu', 'Birthare', 'Bodhaaynas', 'Chandratri', 'Chikithasa', 'Chyavanasa',
  'Daksa', 'Dalabhya', 'Darbhas', 'Devrata', 'Dhananjaya', 'Dhanvantri', 'Dhara Gautam', 'Dharanas', 'Dixit',
  'Duttatreyas', 'Galiva', 'Ganganas', 'Gangyanas', 'Gardhmukh Sandilya', 'Garga', 'Gargya Sainasa',
  'Ghrit Kaushika', 'Gouthama', 'Gowri Veetham', 'Harithasa', 'Jaiminiyas', 'Jamadagni', 'Jatukarna',
  'Kaakavas', 'Kabi', 'Kalabouddasa', 'Kalpangeerasa', 'Kamakayana Vishwamitra', 'Kamsa', 'Kanav', 'Kanva',
  'Kapi', 'Kapila Baradwaj', 'Kapinjal', 'Kapishthalas', 'Kaplish', 'Kashish', 'Kashyapa', 'Katyayan',
  'Kaundinya', 'Kaunsa', 'Kaushal', 'Kausikasa', 'Keshoryas', 'Koushika Visvamitrasa', 'Krishnatrey', 'Kusa',
  'Kutsasa', 'Laakshmanas', 'Laugakshi', 'Lavania', 'Lodwan', 'Lohit', 'Lokaakhyas', 'Lomasha', 'Madelia',
  'Maitraya', 'Manava', 'Mandavya', 'Marica', 'Markendeya', 'Maudlas', 'Maunas', 'Mihir', 'Moudgalya',
  'Mouna Bhargava', 'Munish', 'Mythravaruna', 'Nagasya', 'Naidrupa Kashyapa', 'Narayanas', 'Nithyandala',
  'Paaniyas', 'Pachori', 'Paing', 'Parashara', 'Parthivasa', 'Paulastya', 'Poothamanasa', 'Pourugutsa',
  'Prachinas', 'Raghuvanshi', 'Rajoria', 'Rathitar', 'Rohinya', 'Rohita', 'Sakalya', 'Sakhyanasa',
  'Salankayanasa', 'Sandilyasa', 'Sankash', 'Sankha-Pingala-Kausta', 'Sankrut', 'Sankyanasa', 'Savanaka',
  'Savarana', 'Shaalaksha', 'Shadamarshana', 'Shakhanas', 'Shalavatsa', 'Sharkaras', 'Sharkvas', 'Shaunak',
  'Shravanesya', 'Shrimukh Shandilya', 'Shukla Atreyas', 'Sigidha', 'Sri Vatsa / Vatsa',
  'Srungi Bharadwajasa', 'Suparnasa', 'Swathantra Kapisa', 'Tharakayanam', 'Titwal', 'Tushar', 'Udbahu',
  'Udhalaka', 'Uditha Gautham', 'Udithya', 'Upamanyu', 'Upamanyu Vasishtasa', 'Upathya', 'Vadulasa', 'Vainya',
  'Vardheyasa', 'Vashishtha', 'Veethahavya', 'Vishnordhageerasa', 'Vishnu Vridhha', 'Vishwamitra', 'Yaska',
  'Other',
];

// "Caste no bar": open to marrying outside their community.
export const OPEN_TO_OTHER_COMMUNITIES = ['Yes, caste no bar', 'Prefer my own community', 'Only my own community'];

// ---- horoscope -------------------------------------------------------------

export const MANGLIK = ['Manglik', 'Non Manglik', 'Angshik (partial Manglik)', "Don't know"];
export const RASHI = [
  'Mesh (Aries)', 'Vrishabh (Taurus)', 'Mithun (Gemini)', 'Kark (Cancer)', 'Simha (Leo)', 'Kanya (Virgo)',
  'Tula (Libra)', 'Vrishchik (Scorpio)', 'Dhanu (Sagittarius)', 'Makar (Capricorn)', 'Kumbh (Aquarius)',
  'Meen (Pisces)', "Don't know",
];
// In their traditional order, with the names used across India.
export const NAKSHATRA = [
  'Ashwini / Ashwathi', 'Bharani', 'Krithika / Karthika', 'Rohini', 'Mrigasira / Makayiram',
  'Ardra / Thiruvathira', 'Punarvasu / Punarpusam', 'Pushya / Poosam / Pooyam', 'Ashlesha / Ayilyam',
  'Makha / Magam', 'Poorvapalguni / Puram / Pubbhe', 'Uttarapalguni / Uthram', 'Hastha / Atham',
  'Chitra / Chitha', 'Swati / Chothi', 'Vishaka / Vishakam', 'Anuradha / Anusham / Anizham',
  'Jyesta / Kettai', 'Moolam / Moola', 'Poorvashada / Pooradam', 'Uttarashada / Uthradam',
  'Shravan / Thiruvonam', 'Dhanista / Avittam', 'Shatataraka / Sadayam / Sadabist',
  'Poorvabadrapada / Puratathi', 'Uttrabadrapada / Uthratadhi', 'Revathi', "Don't know",
];
export const HOROSCOPE_MATCH = ['Must match', 'Not required'];

// ---- education and work ----------------------------------------------------------

export const EDUCATION_LEVELS = ['High School', 'Diploma', "Bachelor's", "Master's", 'PhD', 'Trade School', 'Self-taught'];

export const DEGREES: OptionGroup[] = [
  { label: 'Engineering / Technology / Design', options: [
    'A.M.E. (Aircraft Maintenance Engineering)', 'B.Arch (Bachelor of Architecture)',
    'B.Des (Bachelor of Design)', 'B.E/B.Tech (Bachelor of Engineering / Bachelor of Technology)',
    'B.FAD (Bachelor of Fashion Accessory Design)', 'B.FTech (Bachelor of Fashion Technology)',
    'B.Pharma (Bachelor of Pharmacy)', 'B.Tech LL.B. (Bachelor of Technology and Bachelor of Laws)',
    'BID (Bachelor of Interior Design)', 'CISE (Certified Information Security Expert)',
    'ITIL (Information Technology Infrastructure Library)', 'M.Arch (Master of Architecture)',
    'M.Des (Master of Design)', 'M.E/M.Tech (Master of Engineering / Master of Technology)',
    'M.FTech (Master of Fashion Technology)', 'M.Pharma (Master of Pharmacy)', 'M.Plan (Master of Planning)',
    'M.S. (Engineering) (Master of Science in Engineering)', 'MIB (Master of International Business)',
    'MID (Master in Interior Design)', 'MPH (Master of Public Health)',
  ] },
  { label: 'Computers', options: [
    'ADCA (Advanced Diploma in Computer Applications)', 'B.IT (Bachelor of Information Technology)',
    'BCA (Bachelor of Computer Applications)', 'DCA (Diploma in Computer Applications)',
    'MCA (Master of Computer Applications)', 'MCM (Master in Computer Management)',
    'PGDCA (Post Graduate Diploma in Computer Applications)',
  ] },
  { label: 'Medicine / Health', options: [
    'ANM (Auxiliary Nurse Midwifery)', 'B.O.Th (Bachelor of Orthoptics Therapy)',
    'B.P.E.S (Bachelor of Physical Education and Sports)', 'B.P.Ed (Bachelor of Physical Education)',
    'BAMS (Bachelor of Ayurvedic Medicine and Surgery)', 'BCVT (Bachelor of Cardio Vascular Technology)',
    'BDS (Bachelor of Dental Surgery)', 'BHMS (Bachelor of Homeopathic Medicine and Surgery)',
    'BMLT (Bachelor of Medical Laboratory Technology)',
    'BMRIT (Bachelor of Medical Radiology and Imaging Technology)',
    'BMRT (Bachelor of Medical Record Technology)', 'BNYS (Bachelor of Naturopathy and Yogic Sciences)',
    'BOPTM (Bachelor of Optometry)', 'BOT (Bachelor of Occupational Therapy)',
    'BPH (Bachelor of Public Health)', 'BPMT (Bachelor of Paramedical Technology)',
    'BPO (Bachelor of Prosthetics and Orthotics)', 'BPT (Bachelor of Physiotherapy)',
    'BRDIT (Bachelor of Radiodiagnosis and Imaging Technology)',
    'BUMS (Bachelor of Unani Medicine and Surgery)', 'BVSc. (Bachelor of Veterinary Science)',
    'D.P.Ed (Diploma in Physical Education)', 'D.Pharm (Diploma in Pharmacy)', 'DM (Doctorate of Medicine)',
    'DMLT (Diploma in Medical Laboratory Technology)', 'GNM (General Nursing and Midwifery)',
    'M.D. (Doctor of Medicine)', 'M.Optom. (Master of Optometry)', 'M.S. (Medicine) (Master of Surgery)',
    'MBBS (Bachelor of Medicine and Bachelor of Surgery)',
    'MCh (Magister Chirurgiae / Master of Surgery (Super Speciality))', 'MDS (Master of Dental Surgery)',
    'MOT (Master of Occupational Therapy)', 'MPT (Master of Physiotherapy)', 'MS (Master of Surgery)',
    'MVSc. (Master of Veterinary Science)',
  ] },
  { label: 'Finance / Commerce / Economics', options: [
    'B.Com (Bachelor of Commerce)', 'B.Com (Hons) (Bachelor of Commerce (Honours))',
    'BBE (Bachelor of Business Economics)', 'BBI (Bachelor of Banking and Insurance)',
    'CA (Chartered Accountant)', 'CFA (Chartered Financial Analyst)', 'CFP (Certified Financial Planner)',
    'CIA (Certified Internal Auditor)', 'CPA (Certified Public Accountant)', 'CS (Company Secretary)',
    'ICWA (Institute of Cost and Works Accountants)', 'M.Com (Master of Commerce)',
    'MBE (Master of Business Economics)', 'MBF (Master of Banking and Finance)',
    'MFC (Master of Finance and Control)', 'MFM (Master of Financial Management)',
  ] },
  { label: 'Management', options: [
    'B.H.A. (Bachelor of Hospital Administration)', 'BAM (Bachelor of Ayurvedic Medicine)',
    'BBA (Bachelor of Business Administration)', 'BBM (Bachelor of Business Management)',
    'BFM (Bachelor of Financial Markets)', 'BFT (Bachelor of Foreign Trade)',
    'BHM (Bachelor of Hotel Management)', 'BHMCT (Bachelor of Hotel Management and Catering Technology)',
    'BHMTT (Bachelor of Hotel Management, Travel and Tourism)', 'BMS (Bachelor of Management Studies)',
    'CWM (Certified Wealth Manager)', 'Executive MBA/PGDM', 'MAM (Master of Applied Management)',
    'MBA/PGDM (Master of Business Administration / PG Diploma in Management)',
    'MBM (Master of Business Management)', 'MHA (Master of Hospital Administration)',
    'MHRM (Master of Human Resource Management)', 'MMM (Master in Marketing Management)',
    'MMS (Master of Management Studies)', 'MTA (Master of Tourism Administration)',
    'MTM (Master of Tourism Management)',
  ] },
  { label: 'Law', options: [
    'B.A. LL.B. (Bachelor of Arts and Bachelor of Laws)', 'B.A. LL.B. (Hons)',
    'B.Com LL.B (Bachelor of Commerce and Bachelor of Laws)',
    'B.L.S. LL.B. (Bachelor of Legal Science and Bachelor of Laws)',
    'BBA LL.B. (Bachelor of Business Administration and Bachelor of Laws)', 'BBA LL.B. (Hons)',
    'L.L.B (Bachelor of Laws)', 'L.L.M. (Master of Laws)', 'M.B.L (Master of Business Laws)',
  ] },
  { label: 'Arts / Science', options: [
    'B.A (Bachelor of Arts)', 'B.A. (Hons) (Bachelor of Arts (Honours))', 'B.Agri. (Bachelor of Agriculture)',
    'B.Ed (Bachelor of Education)', 'B.El.Ed (Bachelor of Elementary Education)',
    'B.F.Sc. (Bachelor of Fisheries Science)', 'B.J. (Bachelor of Journalism)',
    'B.Lib.I.Sc. (Bachelor of Library and Information Science)', 'B.Lib.Sc. (Bachelor of Library Science)',
    'B.Litt (Bachelor of Literature)', 'B.M.C. (Bachelor of Mass Communication)',
    'B.M.M. (Bachelor of Mass Media)', 'B.M.M.M.C. (Bachelor of Multimedia Mass Communication)',
    'B.Mus. (Bachelor of Music)', 'B.Sc (Bachelor of Science)', 'B.Sc. (Post Basic)',
    'B.Voc (Bachelor of Vocation)', 'BCT & CA (Bachelor in Computer Technology & Computer Application)',
    'BFA (Bachelor of Fine Arts)', 'BJMC (Bachelor of Journalism and Mass Communication)',
    'BPA (Bachelor of Performing Arts)', 'BSW (Bachelor of Social Work)', 'BVA (Bachelor of Visual Arts)',
    'CPT (Common Proficiency Test (CA Foundation))', 'D.Ed (Diploma in Education)',
    'D.El.Ed (Diploma in Elementary Education)', 'D.Voc (Diploma in Vocation)',
    'ETT (Elementary Teacher Training)', 'M.A (Master of Arts)', 'M.Ed (Master of Education)',
    'M.F.Sc. (Master of Fisheries Science)', 'M.H.Sc. (Master of Health Science)',
    'M.J. (Master of Journalism)', 'M.Lib.I.Sc. (Master of Library and Information Science)',
    'M.Lib.Sc. (Master of Library Science)', 'M.M.C. (Master of Mass Communication)',
    'M.O.L. (Master of Organisational Leadership)', 'M.P.Ed (Master of Physical Education)',
    'M.Sc (Master of Science)', 'M.Voc (Master of Vocation)', 'MFA (Master of Fine Arts)',
    'MJMC (Master of Journalism and Mass Communication)', 'MPA (Master of Public Administration)',
    'MSW (Master of Social Work)', 'MVA (Master of Visual Arts)',
    'P.P.T.T.C (Pre-Primary Teacher Training Certificate)', 'TTC (Teacher Training Certificate)',
  ] },
  { label: 'Doctorate', options: [
    'D.Litt (Doctor of Literature)', 'FPM (Fellow Programme in Management)', 'LL.D. (Doctor of Laws)',
    'M.Phil (Master of Philosophy)', 'Pharm.D (Doctor of Pharmacy)', 'PhD (Doctor of Philosophy)',
  ] },
  { label: 'Non-graduate', options: ['Diploma / Certifications', 'Class XII', 'Class X or below', 'Trade School'] },
  { label: 'Other', options: ['Other'] },
];

// The education level a degree implies, to fill in the level when it's empty.
export function educationLevelForDegree(degree: string): string | null {
  if (/^(Class XII|Class X or below)$/.test(degree)) return 'High School';
  if (degree === 'Trade School') return 'Trade School';
  if (/\(Doctor of Medicine\)|^M\.Phil|^Executive MBA/.test(degree)) return "Master's";
  if (/\((Doctor|Doctorate|Fellow Programme)/.test(degree)) return 'PhD';
  if (/\((Master|Magister)/.test(degree)) return "Master's";
  if (/\(Bachelor/.test(degree)) return "Bachelor's";
  if (/Diploma|Teacher Training|Certificat/.test(degree)) return 'Diploma';
  return null;
}

export const EMPLOYED_IN = [
  'Private Sector', 'Government / Public Sector', 'Civil Services', 'Defence', 'Business / Self Employed',
  'Not working',
];

export const OCCUPATIONS: OptionGroup[] = [
  { label: 'Administration', options: [
    'Admin Professional', 'Clerk', 'Operator / Technician', 'Secretary / Front Office',
  ] },
  { label: 'Advertising, Media & Entertainment', options: [
    'Actor / Model', 'Advertising Professional', 'Film / Entertainment Professional', 'Journalist',
    'Media Professional', 'PR Professional',
  ] },
  { label: 'Agricultural', options: ['Agriculture Professional', 'Farming'] },
  { label: 'Agriculture / Agro-based business', options: [
    'Agri-Tech / Precision Farming', 'Cold Storage / Warehousing', 'Dairy / Poultry / Livestock',
    'Farming / Crop Production', 'Food Processing', 'Seed / Fertilizer Distribution',
  ] },
  { label: 'Airline & Aviation', options: ['Airline Professional', 'Flight Attendant', 'Pilot'] },
  { label: 'Architecture', options: ['Architect'] },
  { label: 'Armed Forces', options: ['Air Force', 'Army', 'Defence Services', 'Navy'] },
  { label: 'Auto / Automobile dealership', options: [
    'Auto Repair / Service Centers', 'Car Accessories', 'Car Rental / Leasing', 'EV Dealerships',
    'Spare Parts Dealers', 'Two-wheeler / Four-wheeler Dealers', 'Used Car Showrooms',
  ] },
  { label: 'Banking & Finance', options: [
    'Accounting Professional', 'Auditor', 'Banking Professional', 'Chartered Accountant',
    'Finance Professional',
  ] },
  { label: 'BPO & Customer Service', options: ['BPO / ITes Professional', 'Customer Service'] },
  { label: 'Civil Services', options: ['Civil Services (IAS / IPS / IRS / IES / IFS)'] },
  { label: 'Corporate Management Professionals', options: [
    'Analyst', 'Consultant', 'Corporate Communication', 'Corporate Planning', 'HR Professional',
    'Marketing Professional', 'Operations Management', 'Product manager', 'Program Manager',
    'Project Manager - IT', 'Project Manager - Non IT', 'Sales Professional', 'Sr. Manager / Manager',
    'Subject Matter Expert',
  ] },
  { label: 'Doctor', options: ['Dentist', 'Doctor', 'Surgeon'] },
  { label: 'Education & Training', options: [
    'Education Professional', 'Educational Institution Owner', 'Librarian', 'Professor / Lecturer',
    'Research Assistant', 'Teacher',
  ] },
  { label: 'Education / Coaching business', options: [
    'Corporate Training', 'Hobby / Music / Arts Classes', 'Language / Test Prep Institutes',
    'Online Education / EdTech', 'Schools / Colleges', 'Skill Development / Vocational Training',
    'Tuition / Coaching Centers',
  ] },
  { label: 'Engineering', options: [
    'Electronics Engineer', 'Hardware / Telecom Engineer', 'Non - IT Engineer', 'Quality Assurance Engineer',
  ] },
  { label: 'Event Management / Wedding Planning', options: [
    'Artist / DJ / Performer Booking', 'Corporate Events', 'Decoration / Lighting / Themes',
    'Photography / Videography', 'Venue Management', 'Weddings / Social Functions',
  ] },
  { label: 'Fashion / Beauty / Lifestyle', options: [
    'Apparel / Accessories Design', 'Makeup Artists / Stylists', 'Salons / Spas / Grooming',
    'Skincare / Personal Care Brands', 'Sustainable / Ethical Fashion', 'Wellness Coaches',
  ] },
  { label: 'Finance / Investment / Accounting business', options: [
    'Bookkeeping / Payroll Services', 'Chartered Accountants / Tax Consultants',
    'Financial Planning / Insurance Advisory', 'Investment Advisory / Wealth Management',
    'Loan / Mortgage Agencies', 'NBFCs / Microfinance', 'Stock Brokers / Trading Firm',
  ] },
  { label: 'Franchise Owner', options: [
    'Cleaning / Service Franchise', 'Education / Coaching Franchise', 'Gym / Fitness Franchise',
    'Preschool / Daycare Franchise', 'QSR / Restaurant Franchise', 'Retail / Apparel Franchise',
    'Salon / Spa Franchise',
  ] },
  { label: 'Home-based / Cottage industry', options: [
    'Candle / Gift Box Making', 'Food Products (pickles, snacks, etc.)', 'Handicrafts / Artisanal Products',
    'Handmade Soaps / Beauty Products', 'Home Baker / Cook', 'Tailoring / Embroidery / Boutique',
  ] },
  { label: 'Hospitality', options: ['Hotels / Hospitality Professional'] },
  { label: 'Hospitality / Food services business', options: [
    'Bars / Lounges / Pubs', 'Catering Services', 'Cloud Kitchens', 'Food Trucks', 'Hotels / Resorts',
    'Restaurants / Cafes',
  ] },
  { label: 'IT / Software / Tech services business', options: [
    'Cloud Services / DevOps', 'Cybersecurity Solutions', 'Game Development', 'Mobile / Web App Development',
    'SaaS Products', 'Tech Consultancy', 'Tech Support / Helpdesk Services', 'UI / UX Design',
  ] },
  { label: 'Law Enforcement', options: ['Law Enforcement Officer', 'Police'] },
  { label: 'Legal', options: ['Lawyer & Legal Professional'] },
  { label: 'Legal / Consultancy / Professional services', options: [
    'Business Consultancy', 'Company Registration / Compliance', 'Financial / Strategic Advisory',
    'Legal Practice / Law Firms', 'Risk & Audit Services', 'Trademark / IPR Services',
  ] },
  { label: 'Manufacturing / Production', options: [
    'Chemicals / Fertilizers / Paints', 'Electronics / Electricals', 'FMCG / Packaged Goods',
    'Furniture / Woodwork', 'Machinery / Equipment', 'Paper / Printing Materials',
    'Plastic / Rubber / Packaging', 'Silver Jewelry / Gold Jewelry', 'Steel / Cement / Building Materials',
    'Textile / Apparel Manufacturing', 'Toy / Craft Manufacturing',
  ] },
  { label: 'Media / Advertising business', options: [
    'Advertising Agencies', 'Animation / VFX', 'Content Marketing', 'Digital Marketing Firms',
    'PR / Communication Firms', 'Video / Film Production',
  ] },
  { label: 'Medical / Healthcare / Pharma business', options: [
    'Clinics / Hospitals / Labs', 'Health & Wellness Products', 'Medical Equipment Suppliers',
    'Mental Health Services', 'Online Health Platforms', 'Pharmaceutical Manufacturing',
  ] },
  { label: 'Merchant Navy', options: ['Mariner', 'Merchant Naval Officer'] },
  { label: 'Not working', options: ['Looking for job', 'Not planning to work', 'Retired', 'Student'] },
  { label: 'Other Medical & Healthcare', options: [
    'Medical / Healthcare Professional', 'Nurse', 'Paramedic', 'Pharmacist', 'Physiotherapist',
    'Psychologist', 'Veterinary Doctor',
  ] },
  { label: 'Others', options: [
    'Agent', 'Artist', 'Beautician', 'Broker', 'Business Owner / Entrepreneur', 'Businessperson',
    'Fashion Designer', 'Fitness Professional', 'Interior Designer', 'Others', 'Politician',
    'Security Professional', 'Singer', 'Social Services / NGO / Volunteer', 'Sportsperson',
    'Travel Professional', 'Writer',
  ] },
  { label: 'Printing / Publishing', options: [
    'Business Cards / Marketing Collateral', 'Custom Packaging', 'Digital / Offset Printing Services',
    'Magazine / Book Publishing', 'Newspaper Distribution',
  ] },
  { label: 'Real Estate / Construction', options: [
    'Architecture / Urban Planning', 'Building Materials Supply', 'Civil Contracting',
    'Commercial Development', 'Interior Design / Fit-outs', 'Property Brokerage', 'Residential Development',
  ] },
  { label: 'Retail / E-commerce', options: [
    'Beauty / Wellness Products', 'Bookstores / Stationery', 'Electronics / Gadgets',
    'Fashion / Apparel Retail', 'Furniture & Home Decor', 'Grocery / Supermarket', 'Niche / Specialty Stores',
    'Online Marketplace / D2C Brand',
  ] },
  { label: 'Science & Research', options: ['Research Professional', 'Science Professional', 'Scientist'] },
  { label: 'Social Services / NGO', options: [
    'Education / Literacy Programs', 'Environmental NGOs', 'Healthcare Initiatives', 'Women / Child Welfare',
  ] },
  { label: 'Software & IT', options: [
    'Animator', 'Cyber / Network Security', 'Project Lead - IT', 'Quality Assurance Engineer - IT',
    'Software Professional', 'UI / UX designer', 'Web / Graphic Designer',
  ] },
  { label: 'Sports / Fitness / Recreation', options: [
    'Fitness Equipment Dealers', 'Gyms / Fitness Studios', 'Sports Coaching / Academies',
    'Sports Retail / Apparel', 'Yoga / Meditation Centers',
  ] },
  { label: 'Top Management', options: ['CxO / Chairman / President / Director', 'VP / AVP / GM / DGM'] },
  { label: 'Trading / Wholesale', options: [
    'Agricultural Commodities', 'B2B Wholesale', 'Commodity Trading', 'Electricals / Hardware Supplies',
    'Import / Export', 'Industrial Goods Trading', 'Textile / Apparel Trading',
  ] },
  { label: 'Transport / Logistics', options: [
    'Courier / Parcel Services', 'E-commerce Delivery Services', 'Fleet Management', 'Packers / Movers',
    'Supply Chain Tech Solutions', 'Warehouse / Cold Chain Logistics',
  ] },
  { label: 'Travel / Tourism', options: [
    'Adventure / Experiential Travel', 'Corporate Travel Management', 'Local Guide / Homestay Services',
    'Pilgrimage / Heritage Tours', 'Tour Operators / Package Providers', 'Travel Agents / Visa Consultants',
    'Travel Tech Platforms',
  ] },
];

export const ANNUAL_INCOME: OptionGroup[] = [
  { label: 'In India (per year)', options: ['No income', 'Under ₹1 lakh', '₹1–2 lakh', '₹2–3 lakh', '₹3–4 lakh',
    '₹4–5 lakh', '₹5–7.5 lakh', '₹7.5–10 lakh', '₹10–15 lakh', '₹15–20 lakh', '₹20–25 lakh', '₹25–35 lakh',
    '₹35–50 lakh', '₹50–70 lakh', '₹70 lakh–1 crore', '₹1 crore and above'] },
  { label: 'Outside India (per year)', options: ['Under $25,000', '$25,000–40,000', '$40,000–60,000',
    '$60,000–80,000', '$80,000–100,000', '$100,000–150,000', '$150,000–200,000', '$200,000 and above'] },
];

// ---- where they live ---------------------------------------------------------

export const COUNTRIES: OptionGroup[] = [
  { label: 'India', options: ['India'] },
  { label: 'Where many Indians live', options: [
    'United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates', 'Singapore',
    'New Zealand', 'Germany', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Ireland', 'Netherlands',
    'Malaysia', 'Hong Kong', 'Japan', 'South Africa',
  ] },
  { label: 'All countries', options: [
    'Afghanistan', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola', 'Anguilla',
    'Antigua and Barbuda', 'Argentina', 'Armenia', 'Aruba', 'Austria', 'Azerbaijan', 'Bahamas', 'Bangladesh',
    'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
    'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'British Virgin Islands', 'Brunei', 'Bulgaria',
    'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Cape Verde', 'Cayman Islands',
    'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Cook Islands', 'Costa Rica',
    "Côte d'Ivoire", 'Croatia', 'Cuba', 'Curaçao', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica',
    'Dominican Republic', 'DR Congo', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea',
    'Estonia', 'Eswatini', 'Ethiopia', 'Falkland Islands', 'Faroe Islands', 'Fiji', 'Finland', 'France',
    'French Guiana', 'French Polynesia', 'Gabon', 'Gambia', 'Georgia', 'Ghana', 'Gibraltar', 'Greece',
    'Greenland', 'Grenada', 'Guadeloupe', 'Guam', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
    'Honduras', 'Hungary', 'Iceland', 'Indonesia', 'Iran', 'Iraq', 'Isle of Man', 'Israel', 'Italy',
    'Jamaica', 'Jersey', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kyrgyzstan', 'Laos',
    'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macao',
    'Madagascar', 'Malawi', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Martinique', 'Mauritania',
    'Mauritius', 'Mayotte', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro',
    'Montserrat', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'New Caledonia',
    'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Pakistan', 'Palau',
    'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
    'Puerto Rico', 'Republic of the Congo', 'Réunion', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis',
    'Saint Lucia', 'Saint Vincent and Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Senegal',
    'Serbia', 'Seychelles', 'Sierra Leone', 'Sint Maarten', 'Slovakia', 'Slovenia', 'Solomon Islands',
    'Somalia', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden',
    'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
    'Trinidad and Tobago', 'Tunisia', 'Türkiye', 'Turkmenistan', 'Turks and Caicos Islands', 'Tuvalu',
    'Uganda', 'Ukraine', 'Uruguay', 'US Virgin Islands', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela',
    'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ] },
];

// 28 states and 8 union territories.
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
  'Puducherry',
];

// Suggestions only: any city can be typed.
export const CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati', 'Rajahmundry', 'Kakinada',
    'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Amaravati',
  ],
  'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang'],
  'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tezpur', 'Tinsukia'],
  'Bihar': [
    'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai',
  ],
  'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon'],
  'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  'Gujarat': [
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand',
    'Navsari', 'Morbi', 'Bharuch', 'Vapi', 'Mehsana', 'Bhuj',
  ],
  'Haryana': [
    'Gurgaon', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat', 'Panchkula',
    'Yamunanagar',
  ],
  'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Mandi', 'Solan', 'Kullu', 'Manali', 'Hamirpur'],
  'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh'],
  'Karnataka': [
    'Bangalore', 'Mysore', 'Mangalore', 'Hubli-Dharwad', 'Belgaum', 'Davanagere', 'Ballari', 'Kalaburagi',
    'Shivamogga', 'Tumakuru', 'Udupi',
  ],
  'Kerala': [
    'Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad',
    'Kottayam', 'Malappuram',
  ],
  'Madhya Pradesh': [
    'Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa', 'Satna', 'Ratlam',
  ],
  'Maharashtra': [
    'Mumbai', 'Pune', 'Nagpur', 'Thane', 'Navi Mumbai', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur',
    'Amravati', 'Nanded', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Ahmednagar',
  ],
  'Manipur': ['Imphal'],
  'Meghalaya': ['Shillong', 'Tura'],
  'Mizoram': ['Aizawl', 'Lunglei'],
  'Nagaland': ['Kohima', 'Dimapur'],
  'Odisha': [
    'Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore',
  ],
  'Punjab': [
    'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Pathankot', 'Moga',
  ],
  'Rajasthan': [
    'Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Bhilwara', 'Alwar', 'Sikar',
    'Sri Ganganagar',
  ],
  'Sikkim': ['Gangtok', 'Namchi'],
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Erode',
    'Vellore', 'Thoothukudi', 'Thanjavur', 'Nagercoil', 'Hosur',
  ],
  'Telangana': ['Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'],
  'Tripura': ['Agartala'],
  'Uttar Pradesh': [
    'Lucknow', 'Kanpur', 'Noida', 'Greater Noida', 'Ghaziabad', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut',
    'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Saharanpur', 'Jhansi', 'Mathura', 'Ayodhya',
  ],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh', 'Nainital'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Kharagpur', 'Bardhaman'],
  'Andaman and Nicobar Islands': ['Port Blair'],
  'Chandigarh': ['Chandigarh'],
  'Dadra and Nagar Haveli and Daman and Diu': ['Daman', 'Silvassa', 'Diu'],
  'Delhi': ['New Delhi', 'Delhi'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu'],
  'Ladakh': ['Leh', 'Kargil'],
  'Lakshadweep': ['Kavaratti'],
  'Puducherry': ['Puducherry', 'Karaikal'],
};

export const RESIDENTIAL_STATUS = ['Citizen', 'Permanent Resident', 'Work Permit', 'Student Visa', 'Temporary Visa'];
export const SETTLING_ABROAD = [
  'Interested in settling abroad', 'Not interested in settling abroad', 'Not decided',
];

// ---- family -------------------------------------------------------------------

export const FAMILY_TYPE = ['Joint family', 'Nuclear family', 'Other'];
export const FAMILY_STATUS = ['Middle class', 'Upper middle class', 'Rich / Affluent'];
export const FAMILY_VALUES = ['Orthodox', 'Conservative', 'Moderate', 'Liberal'];
export const FATHER_OCCUPATION = [
  'Businessman / Entrepreneur', 'Private Employee', 'Govt. / PSU Employee', 'Armed Forces Employee',
  'Civil Servant', 'Teacher', 'Retired', 'Not employed', 'Passed away',
];
export const MOTHER_OCCUPATION = [
  'Homemaker', 'Businesswoman / Entrepreneur', 'Private Employee', 'Govt. / PSU Employee',
  'Armed Forces Employee', 'Civil Servant', 'Teacher', 'Retired', 'Passed away',
];
export const SIBLING_COUNTS = ['0', '1', '2', '3', '3+'];
export const LIVING_WITH_FAMILY = ['Yes', 'No', 'Not applicable'];

// ---- lifestyle and interests ----------------------------------------------------

export const DIETS = ['Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Vegan', 'Jain', 'Halal', 'Kosher', 'Gluten-free',
  'Pescatarian', 'No restrictions'];

export const LANGUAGES_SPOKEN = [
  'English', 'Hindi', 'Bengali', 'Marathi', 'Telugu', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia',
  'Malayalam', 'Punjabi', 'Assamese', 'Maithili', 'Konkani', 'Sindhi', 'Kashmiri', 'Nepali', 'Tulu', 'Kutchi',
  'Marwari', 'Bhojpuri', 'Rajasthani', 'Sanskrit', 'Arabic', 'French', 'German', 'Spanish', 'Mandarin',
  'Japanese', 'Italian', 'Portuguese', 'Persian', 'Pashto', 'Russian', 'Korean',
];

export const HOBBY_GROUPS: OptionGroup[] = [
  { label: 'Travelling', options: [
    'Road trips', 'Beaches', 'Mountains', 'Wildlife', 'Trekking', 'Nature Camps', 'Staycations', 'Solo trips',
    'Biking', 'Backpacking', 'Hiking',
  ] },
  { label: 'Staying home', options: [
    'Cooking', 'Reading', 'Binge watching', 'Board Games', 'Pets', 'Video Games', 'Gardening', 'Baking',
    'Meditation', 'News & Politics', 'Stock Market & Finance',
  ] },
  { label: 'Creativity', options: [
    'Art', 'Crafts', 'Music', 'Painting', 'Singing', 'Dancing', 'Photography', 'Content Creation',
    'Playing Instruments', 'Writing', 'Design', 'Poetry', 'Doodling', 'Sketching', 'Knitting',
  ] },
  { label: 'Games & sports', options: [
    'Gym', 'Yoga', 'Badminton', 'Cricket', 'Swimming', 'Running', 'Cycling', 'Football', 'Pickleball',
    'Basketball', 'Table Tennis', 'Tennis', 'Boxing', 'Squash', 'Golf', 'Scuba Diving', 'Hockey', 'Kayaking',
    'Horse riding', 'Skiing',
  ] },
  { label: 'Going out', options: [
    'Cafe-hopping', 'Street Food', 'Movies', 'Shopping', 'Stand-up Comedy', 'Karaoke', 'Concerts', 'Theatre',
    'Museums', 'Long Walks',
  ] },
];
