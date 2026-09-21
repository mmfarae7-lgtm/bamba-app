import { createClient } from '@supabase/supabase-js';

// تُقرأ من ملف .env — مفتاح anon عام ويظهر داخل كل نسخة منشورة من التطبيق.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// وضع آمن عند غياب الإعدادات (معاينة بدون .env): التطبيق يظل يعمل
// وشاشة الدخول تشرح المشكلة بدلاً من الانهيار عند إنشاء العميل.
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin' | 'super_admin';
  bamba_balance: number;
  user_points: number;
  country: string;
  phone?: string | null;
  gender?: string | null;
  dob?: string | null;
  avatar_url?: string | null;
  referral_code?: string | null;
  invited_by?: string | null;
  created_at: string;
}

/** رابط عام لصورة شخصية (حاوية avatars). */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
