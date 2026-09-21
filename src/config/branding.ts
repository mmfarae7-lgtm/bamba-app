// المصدر الرسمي الوحيد لشعار BMBA — كل استخدام للشعار يجب أن يمر من هنا أو من <BrandLogo />.
// Official single source of truth for the BMBA brand: every logo usage imports BRAND
// (or renders <BrandLogo />) — never a copied image file, never a text stand-in.
export type BrandVariant = 'default' | 'compact' | 'white' | 'dark';
export type BrandSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const BRAND = {
  name: 'BMBA',
  fullName: 'توقعات بمبا',
  // الشعار الرسمي الوحيد — صورة PNG بخلفية شفافة (2000×2000) تعمل على الخلفيتين الفاتحة والداكنة.
  logo: '/assets/branding/bmba-logo.png',
  logoAlt: 'BMBA Logo',
  // عملة بمبا الرسمية — تُستخدم في كل مكان يظهر فيه رصيد البمبات.
  coin: '/assets/branding/bamba-coin.png',
  coinAlt: 'عملة بمبا',
} as const;

// أحجام الشعار بالبكسل — نفس الملف الرسمي في كل الأحجام مع object-fit: contain
// (لا تمدد ولا تشويه، بلا خلفية أو إطار).
export const BRAND_LOGO_SIZES: Record<BrandSize, number> = {
  xs: 26,
  sm: 34,
  md: 46,
  lg: 72,
  xl: 132,
};
