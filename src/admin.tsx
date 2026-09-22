import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Flame,
  Gift,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  Trophy,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { BrandLogo } from './components';
import { StoreSection } from './store-admin';
import { loadAllMatches } from './lib/matches';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/supabase';
import type { Match } from './types';

type AdminSection =
  | 'dashboard' | 'users' | 'matches' | 'predictions' | 'challenges' | 'wallet' | 'store' | 'content' | 'reports' | 'security'
  | 'arenas' | 'coach' | 'questions' | 'payments' | 'coupons' | 'prizes' | 'support' | 'notifications'
  | 'versions' | 'cms' | 'maint' | 'roles' | 'audit' | 'settings' | 'matches2';

type AuditLog = {
  id: string;
  action: string;
  resource: string;
  reason: string | null;
  created_at: string;
};

const sections: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'users', label: 'المستخدمون', icon: Users },
  { id: 'matches', label: 'المباريات والبطولات', icon: Trophy },
  { id: 'predictions', label: 'التوقعات والنقاط', icon: BarChart3 },
  { id: 'arenas', label: 'حلبات التوقعات', icon: Flame },
  { id: 'coach', label: 'أنت المدرب', icon: Users },
  { id: 'questions', label: 'بنك الأسئلة', icon: BookOpen },
  { id: 'challenges', label: 'التحديات والفانتازي', icon: Star },
  { id: 'wallet', label: 'البمبات والمدفوعات', icon: WalletCards },
  { id: 'payments', label: 'المدفوعات', icon: CircleDollarSign },
  { id: 'coupons', label: 'الكوبونات', icon: Gift },
  { id: 'prizes', label: 'الجوائز', icon: Trophy },
  { id: 'store', label: 'المتجر والجوائز', icon: ShoppingBag },
  { id: 'content', label: 'المحتوى والإشعارات', icon: FileText },
  { id: 'reports', label: 'التقارير والتحليلات', icon: BarChart3 },
  { id: 'security', label: 'الأمان وسجل التدقيق', icon: LockKeyhole },
];

// صلاحيات المشرف (admin): لوحة محدودة.
const ADMIN_ALLOWED: AdminSection[] = ['dashboard', 'matches', 'store'];

export function AdminPage({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const isSuper = profile.role === 'super_admin';
  const allowed: AdminSection[] = isSuper ? sections.map((s) => s.id) : ADMIN_ALLOWED;
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const label = sections.find((s) => s.id === section)?.label ?? '';
  const current = section;

  return (
    <div className="admin-shell" dir="rtl">
      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="admin-brand-row">
          <div className="admin-brand-logo" data-testid="admin-brand-logo">
            <BrandLogo size="sm" />
          </div>
          <div><b>BMBA Admin</b><small>مركز عمليات بمبا</small></div>
          <button className="admin-close-menu" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>
        <div className="admin-role"><ShieldCheck size={16} /><span><b>{isSuper ? 'super_admin' : 'مشرف'}</b>{isSuper ? <small>كل الصلاحيات مفعلة</small> : <small>صلاحيات محدودة: المباريات + المتجر</small>}</span></div>
        <nav className="admin-nav">
          {allowed.map((id) => {
            const item = sections.find((s) => s.id === id);
            if (!item) return null;
            const Icon = item.icon;
            return <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={18} /><span>{item.label}</span><ChevronLeft size={15} /></button>;
          })}
        </nav>
        <button className="admin-back" onClick={onBack}><ArrowRight size={17} /> العودة للتطبيق</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
          <div><span className="eyebrow">نظام تشغيل BMBA</span><h1>{label}</h1></div>
          <div className="admin-top-actions"><button aria-label="الإشعارات"><Bell size={19} /><i /></button><span className="admin-avatar">{profile.username.charAt(0)}</span></div>
        </header>

        {error && <div className="admin-alert"><LockKeyhole size={17} /> {error}</div>}
        {loading ? (
          <div className="admin-loading"><Loader2 size={25} className="spin" /><p>جاري فحص بيانات الإدارة...</p></div>
        ) : (
          <>
            {section === 'dashboard' && <AdminDashboard onSection={setSection} isSuper={isSuper} />}
            {section === 'users' && <AdminUsers />}
            {section === 'matches' && <AdminMatchesSection isSuper={isSuper} />}
            {section === 'predictions' && <AdminPredictions />}
            {section === 'arenas' && <AdminArenasSection />}
            {section === 'coach' && <AdminCoachSection />}
            {section === 'questions' && <AdminQuestionsSection />}
            {section === 'challenges' && <AdminChallengesSection />}
            {section === 'wallet' && <AdminWalletSection />}
            {section === 'payments' && <AdminPaymentsSection />}
            {section === 'coupons' && <AdminCouponsSection />}
            {section === 'prizes' && <AdminPrizesSection />}
            {section === 'store' && <StoreSection />}
            {section === 'content' && <AdminContentSection />}
            {section === 'reports' && <AdminReportsSection />}
            {section === 'security' && <AdminSecuritySection />}
          </>
        )}
      </main>
    </div>
  );
}
