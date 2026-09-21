import type { Match, TeamStanding, Scorer, LeagueGroup, Challenge, Player } from './types';

export const matches: Match[] = [
  { id: 1, league: 'دوري أبطال أوروبا', home: 'ريال مدريد', away: 'برشلونة', homeShort: 'ر م', awayShort: 'ب', time: '23:00', points: 5, featured: true, status: 'upcoming' },
  { id: 2, league: 'الدوري الإنجليزي', home: 'مانشستر يونايتد', away: 'نيوكاسل', homeShort: 'م ي', awayShort: 'ن', time: '22:00', points: 3, status: 'upcoming' },
  { id: 3, league: 'الدوري الإسباني', home: 'أتلتيكو مدريد', away: 'إشبيلية', homeShort: 'أ', awayShort: 'إ', time: '22:00', points: 3, status: 'upcoming' },
  { id: 4, league: 'دوري روشن السعودي', home: 'الهلال', away: 'الاتحاد', homeShort: 'هـ', awayShort: 'ا', time: '20:00', points: 5, featured: true, status: 'upcoming' },
  { id: 5, league: 'الدوري الإنجليزي', home: 'ليفربول', away: 'تشيلسي', homeShort: 'ل', awayShort: 'ت', time: '18:30', points: 3, status: 'finished', result: '2-1', homeGoals: 2, awayGoals: 1, correctPct: 34, wrongPct: 66 },
  { id: 6, league: 'الدوري الإسباني', home: 'فالنسيا', away: 'ريال سوسيداد', homeShort: 'ف', awayShort: 'ر س', time: '16:00', points: 3, status: 'finished', result: '0-0', homeGoals: 0, awayGoals: 0, correctPct: 28, wrongPct: 72 },
  { id: 7, league: 'دوري أبطال أوروبا', home: 'بايرن ميونخ', away: 'باريس سان جيرمان', homeShort: 'ب م', awayShort: 'ب س', time: '21:00', points: 5, featured: true, status: 'live' },
];

export const leagueGroups: LeagueGroup[] = [
  { title: 'أقوى البطولات المحلية', items: ['الدوري الإنجليزي', 'الدوري الإسباني', 'الدوري الإيطالي', 'الدوري الألماني', 'الدوري الفرنسي', 'دوري روشن السعودي'] },
  { title: 'بطولات الاتحادات القارية للاندية', items: ['دوري أبطال أوروبا', 'دوري أبطال إفريقيا', 'دوري أبطال آسيا', 'الدوري الأوروبي'] },
  { title: 'بطولات الاتحادات القارية للمنتخبات', items: ['كأس الأمم الأوروبية', 'كوبا أمريكا', 'كأس أمم إفريقيا', 'كأس أمم آسيا'] },
  { title: 'البطولات العالمية (الفيفا)', items: ['كأس العالم للمنتخبات', 'كأس العالم للأندية'] },
];

export const standings: Record<string, TeamStanding[]> = {
  'الدوري الإنجليزي': [
    { pos: 1, team: 'مانشستر سيتي', played: 24, won: 18, drawn: 4, lost: 2, gd: 38, pts: 58 },
    { pos: 2, team: 'ليفربول', played: 24, won: 17, drawn: 5, lost: 2, gd: 31, pts: 56 },
    { pos: 3, team: 'أرسنال', played: 24, won: 16, drawn: 4, lost: 4, gd: 25, pts: 52 },
    { pos: 4, team: 'أستون فيلا', played: 24, won: 14, drawn: 5, lost: 5, gd: 18, pts: 47 },
    { pos: 5, team: 'توتنهام', played: 24, won: 13, drawn: 6, lost: 5, gd: 12, pts: 45 },
    { pos: 6, team: 'مانشستر يونايتد', played: 24, won: 12, drawn: 5, lost: 7, gd: 5, pts: 41 },
    { pos: 7, team: 'نيوكاسل', played: 24, won: 11, drawn: 7, lost: 6, gd: 8, pts: 40 },
    { pos: 8, team: 'تشيلسي', played: 24, won: 10, drawn: 8, lost: 6, gd: 3, pts: 38 },
  ],
  'الدوري الإسباني': [
    { pos: 1, team: 'ريال مدريد', played: 24, won: 19, drawn: 3, lost: 2, gd: 42, pts: 60 },
    { pos: 2, team: 'برشلونة', played: 24, won: 16, drawn: 5, lost: 3, gd: 28, pts: 53 },
    { pos: 3, team: 'أتلتيكو مدريد', played: 24, won: 15, drawn: 4, lost: 5, gd: 20, pts: 49 },
    { pos: 4, team: 'أتلتيك بلباو', played: 24, won: 13, drawn: 6, lost: 5, gd: 15, pts: 45 },
    { pos: 5, team: 'ريال سوسيداد', played: 24, won: 12, drawn: 5, lost: 7, gd: 8, pts: 41 },
    { pos: 6, team: 'إشبيلية', played: 24, won: 10, drawn: 7, lost: 7, gd: 2, pts: 37 },
  ],
  'دوري أبطال أوروبا': [
    { pos: 1, team: 'ريال مدريد', played: 6, won: 6, drawn: 0, lost: 0, gd: 14, pts: 18 },
    { pos: 2, team: 'بايرن ميونخ', played: 6, won: 4, drawn: 1, lost: 1, gd: 9, pts: 13 },
    { pos: 3, team: 'مانشستر سيتي', played: 6, won: 4, drawn: 0, lost: 2, gd: 7, pts: 12 },
    { pos: 4, team: 'باريس سان جيرمان', played: 6, won: 3, drawn: 1, lost: 2, gd: 4, pts: 10 },
  ],
};

export const scorers: Record<string, Scorer[]> = {
  'الدوري الإنجليزي': [
    { rank: 1, name: 'إيرلينغ هالاند', team: 'مانشستر سيتي', goals: 19 },
    { rank: 2, name: 'محمد صلاح', team: 'ليفربول', goals: 16 },
    { rank: 3, name: 'أولي واتكينز', team: 'أستون فيلا', goals: 13 },
    { rank: 4, name: 'سون هيونغ مين', team: 'توتنهام', goals: 12 },
    { rank: 5, name: 'بوكايو ساكا', team: 'أرسنال', goals: 11 },
  ],
  'الدوري الإسباني': [
    { rank: 1, name: 'جود بيلينغهام', team: 'ريال مدريد', goals: 15 },
    { rank: 2, name: 'روبرت ليفاندوفسكي', team: 'برشلونة', goals: 14 },
    { rank: 3, name: 'أنطوان غريزمان', team: 'أتلتيكو مدريد', goals: 12 },
    { rank: 4, name: 'فينيسيوس جونيور', team: 'ريال مدريد', goals: 11 },
    { rank: 5, name: 'لياندرو بارديز', team: 'أتلتيك بلباو', goals: 9 },
  ],
  'دوري أبطال أوروبا': [
    { rank: 1, name: 'كيليان مبابي', team: 'ريال مدريد', goals: 8 },
    { rank: 2, name: 'هاري كين', team: 'بايرن ميونخ', goals: 7 },
    { rank: 3, name: 'إيرلينغ هالاند', team: 'مانشستر سيتي', goals: 6 },
    { rank: 4, name: 'عثمان ديمبيلي', team: 'باريس سان جيرمان', goals: 5 },
  ],
};

export const challenges: Challenge[] = [
  { title: 'حلبة التوقعات', text: 'أنشئ تحدياً خاصاً مع أصدقائك', icon: 'Users', color: 'green', page: 'challengeArena' },
  { title: 'جاوب واكسب', text: 'اختبر معلوماتك واربح بمبات', icon: 'CircleHelp', color: 'blue', page: 'challengeQuiz' },
  { title: 'تحدي الأبطال', text: 'توقع أبطال البطولات', icon: 'Crown', color: 'orange', page: 'challengeChampions' },
  { title: 'أنت المدرب', text: 'كوّن فريق أحلامك', icon: 'ShieldCheck', color: 'red', page: 'challengeCoach' },
  { title: 'متجر بمبا', text: 'استبدل بمباتك بالمكافآت', icon: 'ShoppingBag', color: 'teal', page: 'challengeStore' },
];

export const players: Player[] = [
  { id: 1, name: 'إيرلينغ هالاند', team: 'مانشستر سيتي', position: 'مهاجم', price: 1800, marketValue: '180 مليون' },
  { id: 2, name: 'محمد صلاح', team: 'ليفربول', position: 'جناح', price: 1200, marketValue: '120 مليون' },
  { id: 3, name: 'جود بيلينغهام', team: 'ريال مدريد', position: 'وسط', price: 1800, marketValue: '180 مليون' },
  { id: 4, name: 'كيليان مبابي', team: 'ريال مدريد', position: 'مهاجم', price: 1600, marketValue: '160 مليون' },
  { id: 5, name: 'فينيسيوس جونيور', team: 'ريال مدريد', position: 'جناح', price: 1500, marketValue: '150 مليون' },
  { id: 6, name: 'هاري كين', team: 'بايرن ميونخ', position: 'مهاجم', price: 1100, marketValue: '110 مليون' },
  { id: 7, name: 'روبرت ليفاندوفسكي', team: 'برشلونة', position: 'مهاجم', price: 800, marketValue: '80 مليون' },
  { id: 8, name: 'بوكايو ساكا', team: 'أرسنال', position: 'جناح', price: 1400, marketValue: '140 مليون' },
  { id: 9, name: 'كيفن دي بروين', team: 'مانشستر سيتي', position: 'وسط', price: 900, marketValue: '90 مليون' },
  { id: 10, name: 'أنطوان غريزمان', team: 'أتلتيكو مدريد', position: 'مهاجم', price: 700, marketValue: '70 مليون' },
  { id: 11, name: 'سون هيونغ مين', team: 'توتنهام', position: 'جناح', price: 600, marketValue: '60 مليون' },
  { id: 12, name: 'عثمان ديمبيلي', team: 'باريس سان جيرمان', position: 'جناح', price: 600, marketValue: '60 مليون' },
  { id: 13, name: 'كريستيانو رونالدو', team: 'النصر', position: 'مهاجم', price: 1500, marketValue: '150 مليون' },
  { id: 14, name: 'نيمار', team: 'الهلال', position: 'جناح', price: 800, marketValue: '80 مليون' },
  { id: 15, name: 'إيدرسون', team: 'مانشستر سيتي', position: 'حارس', price: 400, marketValue: '40 مليون' },
  { id: 16, name: 'أليسون', team: 'ليفربول', position: 'حارس', price: 500, marketValue: '50 مليون' },
  { id: 17, name: 'روبن دياز', team: 'مانشستر سيتي', position: 'مدافع', price: 800, marketValue: '80 مليون' },
  { id: 18, name: 'فيرجيل فان دايك', team: 'ليفربول', position: 'مدافع', price: 700, marketValue: '70 مليون' },
  { id: 19, name: 'أوريلين تشواميني', team: 'ريال مدريد', position: 'وسط', price: 1000, marketValue: '100 مليون' },
  { id: 20, name: 'بيدري', team: 'برشلونة', position: 'وسط', price: 1000, marketValue: '100 مليون' },
];

export const storeItems = [
  { id: 1, name: 'كرة بمبا الرسمية', category: 'أدوات رياضية', cost: 5000, discount: '20%', store: 'محل الرياضة' },
  { id: 2, name: 'تيشرت توقعات بمبا', category: 'ملابس رياضية', cost: 3000, discount: '50%', store: 'محل الرياضة' },
  { id: 3, name: 'وجبة في مطعم', category: 'مطاعم', cost: 2000, discount: '70%', store: 'مطعم الشيف' },
  { id: 4, name: 'حذاء كرة قدم', category: 'أدوات رياضية', cost: 8000, discount: '30%', store: 'محل الرياضة' },
  { id: 5, name: 'كوبون خصم 20%', category: 'كوبونات', cost: 1000, discount: '20%', store: 'متجر عام' },
  { id: 6, name: 'كوبون خصم 50%', category: 'كوبونات', cost: 2500, discount: '50%', store: 'متجر عام' },
];

export const quizQuestions = [
  { id: 1, q: 'كم مرة فازت البرازيل بكأس العالم؟', options: ['3', '4', '5', '6'], answer: 2 },
  { id: 2, q: 'من صاحب أكبر عدد من أهداف دوري الأبطال؟', options: ['ميسي', 'رونالدو', 'بنزيما', 'ليفاندوفسكي'], answer: 1 },
  { id: 3, q: 'في أي سنة تأسس ريال مدريد؟', options: ['1899', '1902', '1905', '1910'], answer: 1 },
  { id: 4, q: 'من أفضل لاعب في العالم 2023؟', options: ['مبابي', 'ميسي', 'هالاند', 'بيلينغهام'], answer: 2 },
  { id: 5, q: 'كم فريق يشارك في كأس العالم؟', options: ['24', '32', '36', '48'], answer: 3 },
];

