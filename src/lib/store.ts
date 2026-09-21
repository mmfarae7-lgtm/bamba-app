import { supabase } from './supabase';

// ===== أنواع المتجر =====
export interface StorePartner {
  id: string;
  name: string;
  category: string; // محل رياضي | مطعم | متجر | خدمات
  description: string | null;
  logo_url: string | null;
  discount: number; // 20 | 50 | 70
  active: boolean;
  created_at: string;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price_bamba: number;
  partner_id: string | null;
  image_url: string | null;
  discount: number;
  active: boolean;
  created_at: string;
}

export const STORE_BUCKET = 'store-assets';

// ===== أدوات التخزين =====
/** يقوّل مساراً مخزناً في حاوية المتجر إلى رابط عام، أو null عند غيابه. */
export function storeFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(STORE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** رفع صورة منتج أو شعار شريك إلى حاوية المتجر ويعيد المسار العام. */
export async function uploadStoreFile(
  folder: 'partners' | 'products',
  file: File,
): Promise<{ path: string; error: string | null }> {
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(STORE_BUCKET).upload(path, file, {
    contentType: file.type || 'image/png',
    upsert: false,
  });
  if (error) return { path: '', error: error.message };
  return { path, error: null };
}

export async function deleteStoreFile(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(STORE_BUCKET).remove([path]);
}

// ===== بيانات احتياطية تعرض عند غياب البيانات أو انقطاع الاتصال =====
export const FALLBACK_PARTNERS: StorePartner[] = [
  { id: 'p1', name: 'متجر سبورت تايم', category: 'محل رياضي', description: 'ملابس وأدوات رياضية أصلية بخصم لأعضاء بمبا', logo_url: null, discount: 50, active: true, created_at: '' },
  { id: 'p2', name: 'مطعم كرة الهدف', category: 'مطعم', description: 'وجبات رياضية وخصم خاص لأعضاء بمبا', logo_url: null, discount: 20, active: true, created_at: '' },
  { id: 'p3', name: 'بوتيك المدرجات', category: 'متجر', description: 'أطقم وهدايا المشجعين بخصومات تصل إلى 70%', logo_url: null, discount: 70, active: true, created_at: '' },
];

export const FALLBACK_PRODUCTS: StoreProduct[] = [
  { id: 'pr1', name: 'قميص النادي الرسمي', description: 'قميص أصلي بمقاسات متعددة', category: 'ملابس', price_bamba: 950, partner_id: 'p1', image_url: null, discount: 50, active: true, created_at: '' },
  { id: 'pr2', name: 'حذاء كرة قدم احترافي', description: 'مقاسات 39-46', category: 'أدوات', price_bamba: 1200, partner_id: 'p1', image_url: null, discount: 50, active: true, created_at: '' },
  { id: 'pr3', name: 'كرة مباريات معتمدة', description: 'مقاس 5 معتمد رسمياً', category: 'أدوات', price_bamba: 600, partner_id: 'p1', image_url: null, discount: 50, active: true, created_at: '' },
  { id: 'pr4', name: 'حقيبة رياضية كبيرة', description: 'مادة مقاومة للماء', category: 'أدوات', price_bamba: 450, partner_id: 'p1', image_url: null, discount: 50, active: true, created_at: '' },
  { id: 'pr5', name: 'عشاء عائلي', description: 'وجبة عائلية كاملة', category: 'مطاعم', price_bamba: 700, partner_id: 'p2', image_url: null, discount: 20, active: true, created_at: '' },
  { id: 'pr6', name: 'طقم المدرجات الكامل', description: 'وشاح + قبعة + قميص مشجعين', category: 'هدايا', price_bamba: 850, partner_id: 'p3', image_url: null, discount: 70, active: true, created_at: '' },
];

/** تحميل الشركاء والمنتجات من قاعدة البيانات، مع الرجوع للبيانات الاحتياطية عند غيابها أو فشل الاتصال. */
export async function loadStore(): Promise<{ partners: StorePartner[]; products: StoreProduct[]; fromDb: boolean }> {
  const [p, pr] = await Promise.all([
    supabase.from('store_partners').select('*').eq('active', true).order('created_at', { ascending: true }),
    supabase.from('store_products').select('*').eq('active', true).order('created_at', { ascending: true }),
  ]);
  const failed = Boolean(p.error || pr.error);
  const empty = !p.data?.length && !pr.data?.length;
  if (failed || empty) return { partners: FALLBACK_PARTNERS, products: FALLBACK_PRODUCTS, fromDb: false };
  return { partners: (p.data ?? []) as StorePartner[], products: (pr.data ?? []) as StoreProduct[], fromDb: true };
}

/** توليد كود قسيمة عشوائي من 6 أحرف. */
export function makeCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}