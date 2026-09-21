// قائمة الدول المدعومة في بمبا — تُستخدم في إنشاء الحساب وتعديل الملف الشخصي
// (الاسم + رمز الهاتف + العلم)
export interface Country {
  name: string;
  code: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { name: 'السعودية', code: '+966', flag: '🇸🇦' },
  { name: 'مصر', code: '+20', flag: '🇪🇬' },
  { name: 'الإمارات', code: '+971', flag: '🇦🇪' },
  { name: 'قطر', code: '+974', flag: '🇶🇦' },
  { name: 'اليمن', code: '+967', flag: '🇾🇪' },
  { name: 'الكويت', code: '+965', flag: '🇰🇼' },
  { name: 'البحرين', code: '+973', flag: '🇧🇭' },
  { name: 'سلطنة عُمان', code: '+968', flag: '🇴🇲' },
  { name: 'الأردن', code: '+962', flag: '🇯🇴' },
  { name: 'العراق', code: '+964', flag: '🇮🇶' },
  { name: 'لبنان', code: '+961', flag: '🇱🇧' },
  { name: 'سوريا', code: '+963', flag: '🇸🇾' },
  { name: 'فلسطين', code: '+970', flag: '🇵🇸' },
  { name: 'ليبيا', code: '+218', flag: '🇱🇾' },
  { name: 'تونس', code: '+216', flag: '🇹🇳' },
  { name: 'الجزائر', code: '+213', flag: '🇩🇿' },
  { name: 'المغرب', code: '+212', flag: '🇲🇦' },
  { name: 'السودان', code: '+249', flag: '🇸🇩' },
  { name: 'الصومال', code: '+252', flag: '🇸🇴' },
  { name: 'موريتانيا', code: '+222', flag: '🇲🇷' },
  { name: 'تركيا', code: '+90', flag: '🇹🇷' },
  { name: 'باكستان', code: '+92', flag: '🇵🇰' },
  { name: 'الهند', code: '+91', flag: '🇮🇳' },
  { name: 'بريطانيا', code: '+44', flag: '🇬🇧' },
  { name: 'فرنسا', code: '+33', flag: '🇫🇷' },
  { name: 'ألمانيا', code: '+49', flag: '🇩🇪' },
  { name: 'إسبانيا', code: '+34', flag: '🇪🇸' },
  { name: 'إيطاليا', code: '+39', flag: '🇮🇹' },
  { name: 'أمريكا', code: '+1', flag: '🇺🇸' },
  { name: 'كندا', code: '+1', flag: '🇨🇦' },
];

export function countryByPhoneCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryByName(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name === name);
}