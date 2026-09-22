import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FileClock,
  FileText,
  Flame,
  Gift,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LockKeyhole,
  Menu,
  Megaphone,
  Package,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  Trophy,
  UserCog,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { BrandLogo } from './components';
import { StoreSection } from './store-admin';
import { loadAllMatches } from './lib/matches';
import { execApproval } from './lib/admin-api';
import { fetchFixtures, fixturesApiConfigured } from './lib/fixtures';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/supabase';
import type { Match } from './types';

/* ================= أنواع وأقسام ================= */

type AdminSection =
  | 'dashboard' | 'users' | 'matches' | 'predictions' | 'arenas' | 'coach' | 'questions'
  | 'challenges' | 'wallet' | 'payments' | 'coupons' | 'prizes' | 'store'
  | 'content' | 'reports' | 'security' | 'roles' | 'settings';

interface AdminPerms {
  is_super: boolean;
  role: string;
  roles: string[];
  permissions: string[];
  read_modules: string[];
  write_modules: string[];
}

/** الأدوار الإدارية المعروفة (قديمة + جديدة) — تُستخدم في بوابة الدخول. */
export const ADMIN_ROLE_NAMES = [
  'super_admin', 'admin', 'competition_manager', 'prediction_manager',
  'challenge_manager', 'finance_manager', 'wallet_manager', 'store_manager',
  'partner_manager', 'support_agent', 'content_manager', 'analyst',
];

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLE_NAMES.includes(role);
}

const SECTION_MODULES: Record<AdminSection, string[]> = {
  dashboard: [],
  users: ['users'],
  matches: ['matches'],
  predictions: ['predictions', 'points'],
  arenas: ['arenas'],
  coach: ['fantasy'],
  questions: ['quiz'],
  challenges: ['challenges', 'arenas'],
  wallet: ['wallets', 'ledger'],
  payments: ['payments'],
  coupons: ['coupons'],
  prizes: ['prizes'],
  store: ['store'],
  content: ['cms', 'notifications'],
  reports: ['reports'],
  security: ['security', 'audit'],
  roles: ['security'],
  settings: ['settings'],
};

const sections: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'users', label: 'المستخدمون', icon: Users },
  { id: 'matches', label: 'المباريات والبطولات', icon: Trophy },
  { id: 'predictions', label: 'التوقعات والنقاط', icon: BarChart3 },
  { id: 'arenas', label: 'حلبات التوقعات', icon: Flame },
  { id: 'coach', label: 'أنت المدرب', icon: UserCog },
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
  { id: 'roles', label: 'مصفوفة الأدوار (RBAC)', icon: ShieldCheck },
  { id: 'settings', label: 'إعدادات النظام', icon: Settings },
];

const FALLBACK_EMPTY_PERMS: AdminPerms = {
  is_super: false, role: '', roles: [], permissions: [], read_modules: [], write_modules: [],
};

/* ================= الصفحة الرئيسية ================= */

export function AdminPage({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [perms, setPerms] = useState<AdminPerms | null>(null);
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // السوبر أدمن يملك كل الصلاحيات قطعيًا — نعرض اللوحة فورًا دون أي انتظار لطلب شبكة.
    if (profile.role === 'super_admin') {
      setPerms({
        is_super: true,
        role: 'super_admin',
        roles: ['super_admin'],
        permissions: [],
        read_modules: ['*'],
        write_modules: ['*'],
      });
      setLoading(false);
      setError('');
      return;
    }
    // بقية الأدوار: نعرض النسخة الأساسية فورًا، ثم نثريها بالصلاحيات التفصيلية عبر RPC
    // مع مصيدة أخطاء ومهلة أمان — لا تتجمد الشاشة على «جاري فحص...» في أي حال.
    setPerms({
      is_super: false,
      role: profile.role,
      roles: profile.role && profile.role !== 'user' ? [profile.role] : [],
      permissions: [],
      read_modules: [],
      write_modules: [],
    });
    let mounted = true;
    const timer = window.setTimeout(() => {
      if (!mounted) return;
      setLoading(false);
      setError('تعذر تحميل الصلاحيات التفصيلية — يعمل النظام بالصلاحيات الأساسية.');
    }, 8000);
    const rpc = supabase
      .rpc('admin_my_permissions')
      .then((result) => ({ ok: true as const, result }))
      .catch(() => ({ ok: false as const, result: null }));
    void rpc.then(({ ok, result }) => {
      if (!mounted) return;
      window.clearTimeout(timer);
      if (ok && !result.error && result.data) {
        setPerms(result.data as AdminPerms);
        setError('');
      } else {
        setError('تعذر تحميل الصلاحيات التفصيلية — يعمل النظام بالصلاحيات الأساسية.');
      }
      setLoading(false);
    });
    return () => { mounted = false; window.clearTimeout(timer); };
  }, [profile.role]);

  const sectionAllowed = (id: AdminSection): boolean => {
    if (!perms || perms.is_super || perms.read_modules.includes('*')) return true;
    const modules = SECTION_MODULES[id];
    if (modules.length === 0) return true;
    return (
      perms.read_modules.some((m) => modules.includes(m)) ||
      perms.permissions.some((p) => modules.some((m) => p.startsWith(`${m}.`)))
    );
  };

  const allowed = useMemo(() => sections.filter((s) => sectionAllowed(s.id)), [perms, section]);
  const currentLabel = sections.find((s) => s.id === section)?.label ?? '';
  const can = (key: string): boolean => Boolean(perms && (perms.is_super || perms.permissions.includes(key)));
  const canWrite = (module: string): boolean => Boolean(perms && (perms.is_super || perms.write_modules.includes(module)));

  const renderSection = () => {
    if (!sectionAllowed(section)) {
      return (
        <div className="admin-content">
          <div className="admin-placeholder"><LockKeyhole size={34} /><span className="eyebrow">صلاحية محدودة</span><h2>لا يمكن الوصول هنا</h2><p>حسابك الحالي لا يملك صلاحية هذا القسم. تبقى هذه الشاشة متاحة لمن يملكون الصلاحيات المناسبة عبر مصفوفة الأدوار.</p></div>
        </div>
      );
    }
    switch (section) {
      case 'dashboard': return <AdminDashboard onSection={setSection} perms={perms} can={can} />;
      case 'users': return <AdminUsers can={can} />;
      case 'matches': return <AdminMatchesSection canWrite={canWrite} />;
      case 'predictions': return <AdminPredictions can={can} />;
      case 'arenas': return <AdminArenasSection />;
      case 'coach': return <AdminCoachSection />;
      case 'questions': return <AdminQuestionsSection canWrite={canWrite} />;
      case 'challenges': return <AdminChallengesSection />;
      case 'wallet': return <AdminWalletSection can={can} />;
      case 'payments': return <AdminPaymentsSection can={can} />;
      case 'coupons': return <AdminCouponsSection canWrite={canWrite} />;
      case 'prizes': return <AdminPrizesSection />;
      case 'store': return <StoreSection />;
      case 'content': return <AdminContentSection canWrite={canWrite} />;
      case 'reports': return <AdminReportsSection />;
      case 'security': return <AdminSecuritySection can={can} />;
      case 'roles': return <AdminRolesSection can={can} />;
      case 'settings': return <AdminSettingsSection canWrite={canWrite} />;
      default: return null;
    }
  };

  const roleLabel = perms?.is_super ? 'super_admin' : perms?.role || (profile.role === 'super_admin' ? 'super_admin' : 'مشرف');

  return (
    <div className="admin-shell" dir="rtl">
      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="admin-brand-row">
          <div className="admin-brand-logo" data-testid="admin-brand-logo"><BrandLogo size="sm" /></div>
          <div><b>BMBA Admin</b><small>مركز عمليات بمبا</small></div>
          <button className="admin-close-menu" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>
        <div className="admin-role"><ShieldCheck size={16} /><span><b>{roleLabel}</b>{perms?.is_super ? <small>كل الصلاحيات مفعلة</small> : <small>صلاحيات {perms?.permissions.length ?? 0} عملية</small>}</span></div>
        <nav className="admin-nav">
          {allowed.map(({ id, label, icon: Icon }) => (
            <button key={id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setMenuOpen(false); }}>
              <Icon size={18} /><span>{label}</span><ChevronLeft size={15} />
            </button>
          ))}
        </nav>
        <button className="admin-back" onClick={onBack}><ArrowRight size={17} /> العودة للتطبيق</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
          <div><span className="eyebrow">نظام تشغيل BMBA</span><h1>{currentLabel}</h1></div>
          <button className="admin-back-top" onClick={onBack} title="العودة للتطبيق"><ArrowRight size={16} /> رجوع</button>
          <div className="admin-top-actions"><button aria-label="الإشعارات"><Bell size={19} /><i /></button><span className="admin-avatar">{profile.username.charAt(0)}</span></div>
        </header>

        {error && <div className="admin-alert"><LockKeyhole size={17} /> {error}</div>}
        {loading ? (
          <div className="admin-loading"><Loader2 size={25} className="spin" /><p>جاري فحص صلاحيات الإدارة...</p></div>
        ) : (
          renderSection()
        )}
      </main>
    </div>
  );
}

/* ================= مكونات مساعدة مشتركة ================= */

function AdminEmpty({ text }: { text: string }) {
  return <div className="admin-empty"><Activity size={22} /><span>{text}</span></div>;
}

function AdminFlash({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="admin-approve-msg"><CheckCircle2 size={16} /> {msg}</div>;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-SA');
}

/* ================= 1) لوحة التحكم ================= */

function AdminDashboard({ onSection, perms, can }: { onSection: (s: AdminSection) => void; perms: AdminPerms | null; can: (k: string) => boolean }) {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<Array<{ id: string; action: string; resource: string; reason: string | null; created_at: string }>>([]);
  const [users, setUsers] = useState<Profile[]>([]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const canUsers = can('users.view') || can('support.view');
        const [profilesRes, paymentsRes, supportRes, logsRes] = await Promise.all([
          canUsers ? supabase.from('profiles').select('id, username, email, role, bamba_balance, user_points, country, created_at').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as Profile[], error: null }),
          can('payments.view') ? supabase.from('payments').select('id, status').limit(1000) : Promise.resolve({ data: [] as Array<{ id: string; status: string }>, error: null }),
          can('support.view') ? supabase.from('support_tickets').select('id, status').limit(1000) : Promise.resolve({ data: [] as Array<{ id: string; status: string }>, error: null }),
          (perms?.is_super || can('audit.view')) ? supabase.from('admin_audit_logs').select('id, action, resource, reason, created_at').order('created_at', { ascending: false }).limit(12) : Promise.resolve({ data: [] as Array<{ id: string; action: string; resource: string; reason: string | null; created_at: string }>, error: null }),
        ]);
        if (!mounted) return;
        const userRows = (profilesRes.data ?? []) as Profile[];
        setUsers(userRows);
        setLogs((logsRes.data ?? []) as typeof logs);
        setStats({
          users: userRows.length,
          admins: userRows.filter((u) => u.role !== 'user').length,
          bamba: userRows.reduce((s, u) => s + u.bamba_balance, 0),
          points: userRows.reduce((s, u) => s + u.user_points, 0),
          pendingPayments: (paymentsRes.data ?? []).filter((p) => p.status === 'pending').length,
          openTickets: (supportRes.data ?? []).filter((t) => ['new', 'in_progress'].includes(t.status)).length,
        });
      } catch {
        // خطأ اتصال مؤقت — تبقى البطاقات بقيمها الصفرية عوضًا عن تعليق لوحة التحكم
      }
    })();
    return () => { mounted = false; };
  }, [perms?.is_super]);

  const cards = [
    { label: 'إجمالي المستخدمين', value: stats.users ?? 0, icon: Users, tone: 'green' },
    { label: 'المديرون', value: stats.admins ?? 0, icon: ShieldCheck, tone: 'blue' },
    { label: 'إجمالي البمبات', value: stats.bamba ?? 0, icon: CircleDollarSign, tone: 'gold' },
    { label: 'إجمالي النقاط', value: stats.points ?? 0, icon: BarChart3, tone: 'orange' },
    { label: 'مدفوعات بانتظار المراجعة', value: stats.pendingPayments ?? 0, icon: WalletCards, tone: 'gold' },
    { label: 'تذاكر دعم مفتوحة', value: stats.openTickets ?? 0, icon: FileText, tone: 'blue' },
  ];

  const quick = [
    { label: 'المباريات والنقاط', icon: Trophy, section: 'matches' as AdminSection, show: perms?.is_super || can('matches.view') },
    { label: 'المدفوعات', icon: CircleDollarSign, section: 'payments' as AdminSection, show: can('payments.view') },
    { label: 'البمبات والدفاتر', icon: WalletCards, section: 'wallet' as AdminSection, show: can('wallets.view') },
    { label: 'مصفوفة الأدوار', icon: ShieldCheck, section: 'roles' as AdminSection, show: perms?.is_super || can('security.manage_2fa') },
    { label: 'سجل التدقيق', icon: LockKeyhole, section: 'security' as AdminSection, show: perms?.is_super || can('audit.view') },
    { label: 'المحتوى والإشعارات', icon: FileText, section: 'content' as AdminSection, show: can('cms.view') || can('notifications.view') },
  ].filter((q) => q.show);

  return (
    <div className="admin-content">
      <div className="admin-welcome">
        <div><span>مرحباً بك،</span><h2>لوحة عمليات بمبا</h2><p>إدارة المنصة عبر مصفوفة صلاحيات RBAC — كل عملية حساسة مسجلة بسجل تدقيق وتمر بالاعتماد عند الحاجة.</p></div>
        <div className="admin-security-pill"><ShieldCheck size={18} /><span>الحماية مفعلة<small>Permissions · Approval · Audit</small></span></div>
      </div>
      <div className="admin-stat-grid admin-stat-grid-6">{cards.map(({ label, value, icon: Icon, tone }) => (
        <div className={`admin-stat-card ${tone}`} key={label}><span className="admin-stat-icon"><Icon size={20} /></span><div><small>{label}</small><b>{value.toLocaleString('ar-EG')}</b></div></div>
      ))}</div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">النشاط</span><h3>آخر عمليات الإدارة</h3></div><button onClick={() => onSection('security')}>عرض السجل <ChevronLeft size={16} /></button></div>
          {logs.length ? <div className="admin-activity-list">{logs.map((log) => (
            <div className="admin-activity-row" key={log.id}><span className="activity-dot" /><div><b>{log.action}</b><small>{log.resource}{log.reason ? ` · ${log.reason}` : ''}</small></div><time>{fmtDate(log.created_at)}</time></div>
          ))}</div> : <AdminEmpty text="لا توجد عمليات مسجلة بعد (أو لا تملك صلاحية القراءة)" />}
        </section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">الحسابات</span><h3>أحدث المستخدمين</h3></div><button onClick={() => onSection('users')}>كل المستخدمين <ChevronLeft size={16} /></button></div>
          {users.length ? <div className="admin-mini-users">{users.slice(0, 6).map((user) => (
            <div className="admin-mini-user" key={user.id}><span className="admin-user-avatar">{user.username.charAt(0)}</span><div><b>{user.username}</b><small>{user.email}</small></div><span className={`role-pill ${user.role}`}>{user.role === 'super_admin' ? 'مدير عام' : user.role === 'admin' ? 'مشرف' : user.role === 'user' ? 'عضو' : user.role}</span></div>
          ))}</div> : <AdminEmpty text="لا تملك صلاحية قراءة الحسابات" />}
        </section>
      </div>
      {quick.length > 0 && (
        <section className="admin-quick-actions"><h3>الوصول السريع</h3><div>{quick.map(({ label, icon: Icon, section }) => (
          <button onClick={() => onSection(section)} key={label}><Icon size={20} /><span>{label}</span><ChevronLeft size={15} /></button>
        ))}</div></section>
      )}
    </div>
  );
}

/* ================= 2) المستخدمون ================= */

function AdminUsers({ can }: { can: (k: string) => boolean }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const canEditRole = can('users.suspend') || can('users.update');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles')
      .select('id, username, email, role, bamba_balance, user_points, country, created_at, deleted_at')
      .order('created_at', { ascending: false }).limit(200);
    if (!error && data) setUsers((data as Profile[]));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.username} ${u.email} ${u.country}`.toLowerCase().includes(q));
  }, [query, users]);

  const toggleRole = async (target: Profile) => {
    if (target.role === 'super_admin') return;
    const next = target.role === 'admin' ? 'user' : 'admin';
    setBusyId(target.id); setMsg('');
    const { data, error } = await supabase.rpc('set_user_role', { p_target_id: target.id, p_new_role: next });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) {
      setMsg('تعذر تعديل الدور — يسمح بذلك للسوبر أدمن فقط.');
      return;
    }
    setMsg(`تم تغيير دور ${target.username} إلى «${next === 'admin' ? 'مشرف' : 'عضو'}» ✓`);
    void load();
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">إدارة الحسابات والأدوار</span><h2>المستخدمون</h2><p>عرض الحسابات وإدارة أدوارهم — الترقية وإزالة الصلاحية من اختصاص السوبر أدمن.</p></div><span className="admin-count">{filtered.length} حساب</span></div>
      <label className="admin-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو البريد أو الدولة" /></label>
      {msg && <AdminFlash msg={msg} />}
      <section className="admin-panel admin-table-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>المستخدم</th><th>الدولة</th><th>الدور</th><th>النقاط</th><th>البمبات</th>{canEditRole && <th>الصلاحيات</th>}</tr></thead>
            <tbody>{filtered.map((user) => (
              <tr key={user.id}>
                <td><div className="admin-table-user"><span className="admin-user-avatar">{user.username.charAt(0)}</span><span><b>{user.username}</b><small>{user.email}</small></span></div></td>
                <td>{user.country}</td>
                <td><span className={`role-pill ${user.role}`}>{user.role === 'super_admin' ? 'مدير عام' : user.role === 'admin' ? 'مشرف' : user.role === 'user' ? 'عضو' : user.role}</span></td>
                <td>{user.user_points.toLocaleString()}</td>
                <td>{user.bamba_balance.toLocaleString()}</td>
                {canEditRole && (
                  <td>{user.role === 'super_admin' ? <span className="role-lock"><LockKeyhole size={13} /> غير قابل للتعديل</span> : (
                    <button className={`role-action ${user.role === 'admin' ? 'remove' : ''}`} disabled={busyId === user.id} onClick={() => void toggleRole(user)}>
                      {busyId === user.id ? <Loader2 size={13} className="spin" /> : user.role === 'admin' ? <><Ban size={13} /> إزالة الصلاحية</> : <><ShieldCheck size={13} /> جعله مشرفاً</>}
                    </button>
                  )}</td>
                )}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {filtered.length === 0 && <AdminEmpty text="لا توجد نتائج مطابقة" />}
      </section>
    </div>
  );
}

/* ================= 3) المباريات ================= */

const CREATE_LEAGUES = ['الدوري الإنجليزي', 'الدوري الإسباني', 'الدوري الإيطالي', 'الدوري الألماني', 'الدوري الفرنسي', 'دوري أبطال أوروبا', 'الدوري الأوروبي', 'دوري روشن السعودي'];

// أدوات تواريخ محلية — لا تعتمد على المناطق الزمنية للخادم
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDaysTo = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const c = new Date(y, m - 1, d);
  c.setDate(c.getDate() + n);
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
};
const dayLabel = (key: string) => {
  const t = isoToday();
  if (key === t) return 'اليوم';
  if (key === addDaysTo(t, 1)) return 'غداً';
  if (key === '—') return 'بدون تاريخ';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
};

function AdminMatchesSection({ canWrite }: { canWrite: (m: string) => boolean }) {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, { home: number; away: number; isFixture: boolean }>>({});
  const [inputs, setInputs] = useState<Record<number, { home: string; away: string; fixture: boolean }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ league: CREATE_LEAGUES[0], home: '', away: '', homeShort: '', awayShort: '', time: '21:00', points: '3', featured: false, date: 'today' as 'today' | 'tomorrow' | 'custom', customDate: '' });
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState<'today' | 'tomorrow' | null>(null);
  const canCreate = canWrite('matches');
  const canScore = canWrite('matches') || canWrite('points') || canWrite('prediction_points');

  const refresh = async () => {
    setAllMatches(await loadAllMatches());
    setLoading(false);
  };
  useEffect(() => {
    let mounted = true;
    void (async () => {
      await refresh();
      const { data } = await supabase.from('match_final_scores').select('*');
      if (!mounted || !data) return;
      const map: Record<number, { home: number; away: number; isFixture: boolean }> = {};
      for (const row of data as Array<{ match_id: number; home_goals: number; away_goals: number; is_fixture: boolean }>) {
        map[row.match_id] = { home: row.home_goals, away: row.away_goals, isFixture: row.is_fixture };
      }
      setScores(map);
    })();
    return () => { mounted = false; };
  }, []);

  const approve = async (id: number) => {
    const inp = inputs[id] ?? { home: '', away: '', fixture: false };
    const home = Number(inp.home);
    const away = Number(inp.away);
    if (Number.isNaN(home) || Number.isNaN(away) || home < 0 || away < 0) { setMsg('أدخل نتيجة صحيحة (أرقام غير سالبة)'); return; }
    setBusyId(id); setMsg('');
    const { data, error } = await supabase.rpc('score_match_points', { p_match_id: id, p_home: home, p_away: away, p_is_fixture: inp.fixture });
    setBusyId(null);
    if (error) { setMsg(`فشل الاعتماد: ${error.message}`); return; }
    setScores((s) => ({ ...s, [id]: { home, away, isFixture: inp.fixture } }));
    const res = data as { scored_predictions: number; points_awarded: number; arena_scored?: number; arena_points_awarded?: number } | null;
    setMsg(res ? `تم اعتماد نتيجة المباراة #${id}: ${res.scored_predictions} توقع عام (${res.points_awarded} نقطة) + ${res.arena_scored ?? 0} توقع داخل الحلبات (${res.arena_points_awarded ?? 0} نقطة).` : 'تم اعتماد النتيجة تلقائياً.');
  };

  const createMatch = async () => {
    if (!form.home.trim() || !form.away.trim()) { setMsg('أدخل اسمي الفريقين أولاً'); return; }
    let fieldDate = isoToday();
    if (form.date === 'tomorrow') fieldDate = addDaysTo(fieldDate, 1);
    else if (form.date === 'custom') {
      if (!form.customDate) { setMsg('اختر التاريخ المخصص أولاً'); return; }
      fieldDate = form.customDate;
    }
    setCreating(true); setMsg('');
    const { data, error } = await supabase.rpc('admin_create_match', {
      p_league: form.league, p_home: form.home.trim(), p_away: form.away.trim(),
      p_home_short: form.homeShort.trim(), p_away_short: form.awayShort.trim(),
      p_time: form.time, p_points: Number(form.points) || 3, p_featured: form.featured,
      p_match_date: fieldDate,
    });
    setCreating(false);
    if (error || !data || (data as { error?: string }).error) { setMsg(`تعذر إنشاء المباراة: ${error?.message ?? 'لا تملك صلاحية المشرف'}`); return; }
    setShowCreate(false);
    setForm({ league: CREATE_LEAGUES[0], home: '', away: '', homeShort: '', awayShort: '', time: '21:00', points: '3', featured: false, date: 'today', customDate: '' });
    await refresh();
    setMsg(`تمت إضافة المباراة ليوم ${dayLabel(fieldDate)} وستظهر فوراً في صفحة توقعات الأعضاء وجميع حلباتهم ✓`);
  };

  const syncFromApi = async (day: 'today' | 'tomorrow') => {
    const base = day === 'tomorrow' ? addDaysTo(isoToday(), 1) : isoToday();
    setSyncing(day); setMsg('');
    try {
      const fixtures = await fetchFixtures(base, base);
      if (fixtures.length === 0) {
        setMsg(
          fixturesApiConfigured
            ? `مصدر المباريات لم يُرجع أي مباراة ليوم ${dayLabel(base)} (${base}).`
            : 'مصدر المباريات غير مربوط بعد — أضف VITE_FIXTURES_API_URL في ملف .env ثم أعد البناء، وكرر المزامنة.'
        );
        return;
      }
      const { data, error } = await supabase.rpc('admin_upsert_fixtures', { p_fixtures: fixtures });
      if (error) { setMsg(`فشلت المزامنة: ${error.message}`); return; }
      const res = data as { inserted?: number; duplicates?: number } | null;
      await refresh();
      setMsg(`تمت مزامنة ${fixtures.length} مباراة ليوم ${dayLabel(base)} (جديدة: ${res?.inserted ?? fixtures.length}، مكررة: ${res?.duplicates ?? 0}) — جدول التوقعات جاهز ✓`);
    } catch (e) {
      setMsg(`فشل الاتصال بمصدر المباريات: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(null);
    }
  };

  const deleteMatch = async (id: number) => {
    if (!window.confirm('حذف هذه المباراة نهائياً؟')) return;
    const { error } = await supabase.rpc('admin_delete_match', { p_match_id: id });
    if (error) { setMsg(`تعذر الحذف: ${error.message}`); return; }
    await refresh();
    setMsg('تم حذف المباراة.');
  };

  // تجميع المباريات حسب التاريخ الفعلي (اليوم / غداً / أي تاريخ)
  const groups = allMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = m.matchDate ?? '—';
    (acc[key] ??= []).push(m);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b)));

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">إدارة المباريات</span><h2>مباريات اليوم وغداً والنقاط</h2><p>أنشئ مباريات اليوم أو غداً يدوياً، أو ثبّت جدول التوقعات مباشرة من مصدر الـAPI. عند اعتماد النتيجة تُحتسب نقاط التوقعات العامة ونقاط الحلبات معاً تلقائياً.</p></div>
        {canCreate && (
          <div className="admin-inline-actions">
            <button className="admin-create-btn" onClick={() => setShowCreate(true)}><Plus size={17} /> إنشاء مباراة</button>
            <button className="admin-sync-btn" onClick={() => void syncFromApi('today')} disabled={syncing !== null}>
              {syncing === 'today' ? <><Loader2 size={16} className="spin" /> جاري المزامنة...</> : <><RefreshCw size={16} /> جدول اليوم من الـAPI</>}
            </button>
            <button className="admin-sync-btn" onClick={() => void syncFromApi('tomorrow')} disabled={syncing !== null}>
              {syncing === 'tomorrow' ? <><Loader2 size={16} className="spin" /> جاري المزامنة...</> : <><CalendarDays size={16} /> جدول الغد من الـAPI</>}
            </button>
          </div>
        )}
      </div>
      {msg && <AdminFlash msg={msg} />}

      {showCreate && canCreate && (
        <section className="admin-panel admin-create-match">
          <div className="admin-panel-heading"><div><span className="eyebrow">مباراة جديدة</span><h3>مباراة توقعات (اليوم / غداً / مخصص)</h3></div><button className="modal-close" onClick={() => setShowCreate(false)}><X size={17} /></button></div>
          <div className="admin-create-grid">
            <label>البطولة<select value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })}>{CREATE_LEAGUES.map((l) => <option key={l}>{l}</option>)}</select></label>
            <label>تاريخ المباراة*
              <select value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value as typeof form.date })}>
                <option value="today">اليوم</option>
                <option value="tomorrow">غداً</option>
                <option value="custom">تاريخ مخصص</option>
              </select>
            </label>
            {form.date === 'custom' && (
              <label>التاريخ المحدد<input type="date" value={form.customDate} min={isoToday()} onChange={(e) => setForm({ ...form, customDate: e.target.value })} /></label>
            )}
            <label>الفريق المضيف *<input value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} placeholder="مثال: ريال مدريد" /></label>
            <label>الفريق الضيف *<input value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} placeholder="مثال: برشلونة" /></label>
            <label>اختصار المضيف<input value={form.homeShort} onChange={(e) => setForm({ ...form, homeShort: e.target.value })} placeholder="ر م" maxLength={3} /></label>
            <label>اختصار الضيف<input value={form.awayShort} onChange={(e) => setForm({ ...form, awayShort: e.target.value })} placeholder="ب" maxLength={3} /></label>
            <label>موعد المباراة<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
            <label>نقاط التوقع<input type="number" min={1} max={10} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
            <label className="admin-create-fixture"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> مباراة نارية (نقاط مضاعفة)</label>
          </div>
          <button className="admin-approve-btn" disabled={creating} onClick={() => void createMatch()}>{creating ? <><Loader2 size={16} className="spin" /> جاري الإضافة...</> : <><Plus size={16} /> إضافة المباراة</>}</button>
        </section>
      )}

      <div className="admin-section-intro admin-sub-intro"><span className="eyebrow">اعتماد النتائج</span><h3>احتساب نقاط المباريات</h3><p>نتيجة صحيحة 3 نقاط (نارية 5) • فائز صحيح 1 (نارية 2) • النتيجة النادرة +1 — يُطبَّق على التوقعات العامة ونقاط الحلبات.</p></div>

      {loading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل المباريات...</p></div>
      ) : groupKeys.length === 0 ? (
        <AdminEmpty text="لا توجد مباريات — أنشئ مباراة اليوم/غداً أو ثبّت الجدول من الـAPI" />
      ) : (
        groupKeys.map((key) => (
          <div className="admin-day-group" key={key}>
            <div className="admin-day-title"><CalendarDays size={16} /> {dayLabel(key)} <span>{groups[key].length} مباراة</span></div>
            {groups[key].map((m) => {
              const isScored = Boolean(scores[m.id]);
              const isDynamic = m.id >= 1000;
              const inp = inputs[m.id] ?? { home: '', away: '', fixture: Boolean(m.featured) };
              const canTouch = canScore || isDynamic;
              return (
                <section className="admin-panel admin-match-approve" key={m.id}>
                  <div className="admin-match-title">
                    <div className="admin-match-teams"><b>{m.home}</b><span>ضد</span><b>{m.away}</b></div>
                    <div className="admin-match-meta-row"><span className="admin-match-meta">{m.league} · {m.time} {m.matchDate ? `· ${m.matchDate}` : ''} {m.featured ? '· 🔥 نارية' : ''}</span>
                      {isDynamic && <span className="admin-dynamic-tag">مباراة حقيقية</span>}
                      {m.demo && <span className="admin-dynamic-tag">تجريبية</span>}
                      {isDynamic && canWrite('matches') && <button className="admin-remove-match" onClick={() => void deleteMatch(m.id)} title="حذف المباراة"><Trash2 size={14} /> حذف</button>}
                    </div>
                  </div>
                  {canTouch && (
                    <div className="admin-score-inputs">
                      <label>أهداف {m.homeShort}<input type="number" min={0} max={99} value={isScored ? String(scores[m.id].home) : inp.home} onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, home: e.target.value } })} disabled={busyId === m.id} /></label>
                      <span>-</span>
                      <label>أهداف {m.awayShort}<input type="number" min={0} max={99} value={isScored ? String(scores[m.id].away) : inp.away} onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, away: e.target.value } })} disabled={busyId === m.id} /></label>
                      <label className="admin-fixture"><input type="checkbox" checked={isScored ? scores[m.id].isFixture : inp.fixture} onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, fixture: e.target.checked } })} disabled={busyId === m.id} /> مباراة نارية</label>
                    </div>
                  )}
                  <button className="admin-approve-btn" onClick={() => void approve(m.id)} disabled={busyId === m.id}>
                    {busyId === m.id ? <><Loader2 size={16} className="spin" /> جاري الاحتساب...</> : isScored ? <><CheckCircle2 size={16} /> إعادة الاعتماد بنتيجة جديدة</> : <><Trophy size={16} /> اعتماد النتيجة وحساب النقاط</>}
                  </button>
                </section>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

/* ================= 4) التوقعات والنقاط ================= */

function AdminPredictions({ can }: { can: (k: string) => boolean }) {
  const [preds, setPreds] = useState<Array<{ id: string; user_id: string; match_id: number; home_score: number; away_score: number; points_awarded: number; scored: boolean; created_at: string }>>([]);
  const [corrections, setCorrections] = useState<Array<{ id: string; user_id: string; match_id: number; request_type: string; reason: string; status: string; created_at: string }>>([]);
  const [ledger, setLedger] = useState<Array<{ id: string; user_id: string; points_before: number; points_delta: number; points_after: number; source_type: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [p, c, l] = await Promise.all([
        can('predictions.view') ? supabase.from('predictions').select('*').order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] as never[], error: null }),
        can('predictions.view') ? supabase.from('prediction_corrections').select('*').order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] as never[], error: null }),
        can('points.view') ? supabase.from('points_ledger').select('*').order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] as never[], error: null }),
      ]);
      if (!mounted) return;
      setPreds((p.data ?? []) as typeof preds);
      setCorrections((c.data ?? []) as typeof corrections);
      setLedger((l.data ?? []) as typeof ledger);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const scored = preds.filter((x) => x.scored).length;
  const totalPts = preds.reduce((s, x) => s + x.points_awarded, 0);

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">التوقعات والنقاط</span><h2>نظرة على التوقعات</h2><p>ملخص التوقعات وسجل النقاط وقائمة طلبات التصحيح الموثقة. تصحيح توقع يتطلب صلاحية خاصة ومسار اعتماد.</p></div>
        <span className="admin-count">{preds.length} توقع • {scored} محتسب • {totalPts.toLocaleString()} نقطة</span>
      </div>
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل البيانات...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">آخر التوقعات</span><h3>أحدث 50 توقعاً</h3></div></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>المباراة</th><th>التوقع</th><th>النقاط</th><th>الحالة</th></tr></thead>
              <tbody>{preds.slice(0, 15).map((x) => (
                <tr key={x.id}><td>{x.user_id.slice(0, 8)}</td><td>#{x.match_id}</td><td>{x.home_score} - {x.away_score}</td><td>{x.points_awarded}</td><td>{x.scored ? 'محتسب ✓' : 'قيد الانتظار'}</td></tr>
              ))}</tbody></table></div>
            {preds.length === 0 && <AdminEmpty text="لا توجد توقعات (أو لا تملك صلاحية القراءة)" />}
          </section>
          <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">سجل النقاط</span><h3>آخر حركات النقاط</h3></div></div>
            <div className="admin-activity-list">{ledger.slice(0, 10).map((x) => (
              <div className="admin-activity-row" key={x.id}><span className="activity-dot" /><div><b>{x.source_type}</b><small>المستخدم {x.user_id.slice(0, 8)}</small></div><time>{x.points_before} ← <b style={{ color: x.points_delta >= 0 ? '#197b40' : '#c54c4c' }}>{x.points_after}</b> ({x.points_delta >= 0 ? '+' : ''}{x.points_delta})</time></div>
            ))}</div>
            {ledger.length === 0 && <AdminEmpty text="لا توجد حركات بعد" />}
          </section>
        </div>
      )}

      <section className="admin-panel" style={{ marginTop: 18 }}>
        <div className="admin-panel-heading"><div><span className="eyebrow">الشكاوى والتصحيحات</span><h3>طلبات تصحيح الموثقة ({corrections.length})</h3></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>المباراة</th><th>النوع</th><th>السبب</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>{corrections.map((c) => (
            <tr key={c.id}><td>{c.user_id.slice(0, 8)}</td><td>#{c.match_id}</td><td>{c.request_type}</td><td>{c.reason}</td><td><span className={`role-pill ${c.status}`}>{c.status}</span></td><td>{fmtDate(c.created_at)}</td></tr>
          ))}</tbody></table></div>
        {corrections.length === 0 && <AdminEmpty text="لا توجد طلبات تصحيح" />}
      </section>
    </div>
  );
}

/* ================= 5) الحلبات ================= */

interface ArenaRow { id: string; name: string; category: string; league_filter: string; code: string; owner_id: string; created_at: string }
interface ArenaCorr { id: string; arena_id: string; reason: string; resolution: string | null; status: string; created_at: string }

function AdminArenasSection() {
  const [arenas, setArenas] = useState<ArenaRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [corrections, setCorrections] = useState<ArenaCorr[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [a, m, c] = await Promise.all([
        supabase.from('arenas').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('arena_members').select('arena_id'),
        supabase.from('arena_corrections').select('*').order('created_at', { ascending: false }).limit(30),
      ]);
      if (!mounted) return;
      const counts: Record<string, number> = {};
      for (const row of (m.data ?? []) as Array<{ arena_id: string }>) counts[row.arena_id] = (counts[row.arena_id] ?? 0) + 1;
      setMemberCounts(counts);
      setArenas((a.data ?? []) as ArenaRow[]);
      setCorrections((c.data ?? []) as ArenaCorr[]);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">حلبات التوقعات</span><h2>الحلبات والأعضاء</h2><p>تتبع الحلبات ومراجعة النتائج — تعديل ترتيب اللاعبين مباشرة غير مسموح، بل عبر التصحيحات الموثقة.</p></div><span className="admin-count">{arenas.length} حلبة</span></div>
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل الحلبات...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">القائمة</span><h3>الحلبات</h3></div></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الاسم</th><th>التصنيف</th><th>البطولة</th><th>الرمز</th><th>الأعضاء</th><th>التاريخ</th></tr></thead>
              <tbody>{arenas.map((x) => (
                <tr key={x.id}><td><b>{x.name}</b></td><td>{x.category}</td><td>{x.league_filter}</td><td>{x.code}</td><td>{memberCounts[x.id] ?? 0}</td><td>{fmtDate(x.created_at)}</td></tr>
              ))}</tbody></table></div>
            {arenas.length === 0 && <AdminEmpty text="لا توجد حلبات حالياً" />}
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">التصحيحات</span><h3>تصحيحات ترتيب الحلبات ({corrections.length})</h3></div></div>
            <div className="admin-activity-list">{corrections.map((c) => (
              <div className="admin-activity-row" key={c.id}><span className="activity-dot" /><div><b>{c.reason}</b><small>الحلبة {c.arena_id.slice(0, 8)}{c.resolution ? ` · ${c.resolution}` : ''}</small></div><time>{fmtDate(c.created_at)}</time></div>
            ))}</div>
            {corrections.length === 0 && <AdminEmpty text="لا توجد تصحيحات" />}
          </section>
        </div>
      )}
    </div>
  );
}

/* ================= 6) أنت المدرب ================= */

function AdminCoachSection() {
  const [settings, setSettings] = useState<Array<{ key: string; value: unknown }>>([]);
  const [flag, setFlag] = useState<{ key: string; label_ar: string; enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [s, f] = await Promise.all([
        supabase.from('system_settings').select('key, value'),
        supabase.from('feature_flags').select('key, label_ar, enabled').eq('key', 'coach_enabled').maybeSingle(),
      ]);
      if (!mounted) return;
      setSettings((s.data ?? []).filter((r: { key: string }) => r.key.startsWith('coach_')) as Array<{ key: string; value: unknown }>);
      setFlag((f.data ?? null) as typeof flag);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const rows = [
    { key: 'coach_budget', label: 'ميزانية التشكيلة', unit: 'بمبة' },
    { key: 'coach_max_per_team', label: 'الحد الأقصى من فريق واحد', unit: 'لاعب' },
    { key: 'coach_squad_size', label: 'حجم التشكيلة', unit: 'لاعب' },
  ];

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">أنت المدرب (فانتازي)</span><h2>إعدادات وضع المدرب</h2><p>إدارة ميزانية الفانتازي وقواعد التشكيلة. بيانات التشكيلات تظهر عبر شاشة «أنت المدرب» في التطبيق.</p></div>
        {flag ? <span className="admin-count">{flag.enabled ? 'مفعّل ✓' : 'متوقف'}</span> : null}
      </div>
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل الإعدادات...</p></div> : (
        <div className="admin-stat-grid">{rows.map(({ key, label, unit }) => {
          const setting = settings.find((s) => s.key === key);
          return (
            <div className="admin-stat-card green" key={key}><span className="admin-stat-icon"><UserCog size={20} /></span><div><small>{label}</small><b>{setting ? String(setting.value) : '—'} <span style={{ fontSize: 12, fontWeight: 600 }}>{unit}</span></b></div></div>
          );
        })}
          <div className="admin-stat-card blue"><span className="admin-stat-icon"><Activity size={20} /></span><div><small>حالة الوضع</small><b>{flag?.enabled ? 'مفعّل' : 'متوقف'}</b></div></div>
        </div>
      )}
    </div>
  );
}

/* ================= 7) بنك الأسئلة ================= */

interface QuizRow { id: number; category: string; question: string; options: string[]; answer_index: number; active: boolean; created_at: string }

function AdminQuestionsSection({ canWrite }: { canWrite: (m: string) => boolean }) {
  const [rows, setRows] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ question: '', options: ['', '', '', ''], answer: 0, category: 'رياضة عامة' });
  const [msg, setMsg] = useState('');
  const canAdd = canWrite('quiz');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('quiz_questions').select('*').order('created_at', { ascending: false }).limit(100);
    if (!error && data) setRows((data as QuizRow[]));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (row: QuizRow) => {
    const { error } = await supabase.from('quiz_questions').update({ active: !row.active }).eq('id', row.id);
    setMsg(error ? `فشل التحديث: ${error.message}` : row.active ? `تم إيقاف السؤال ✓` : `تم تفعيل السؤال ✓`);
    void load();
  };

  const add = async () => {
    if (!form.question.trim() || form.options.some((o) => !o.trim())) { setMsg('أدخل نص السؤال والخيارات الأربعة أولاً'); return; }
    const { error } = await supabase.from('quiz_questions').insert({
      question: form.question.trim(), options: form.options.map((o) => o.trim()), answer_index: form.answer, category: form.category.trim() || 'رياضة عامة', active: true,
    });
    setMsg(error ? `فشل الحفظ: ${error.message}` : 'تمت إضافة السؤال ✓');
    if (!error) setForm({ question: '', options: ['', '', '', ''], answer: 0, category: 'رياضة عامة' });
    void load();
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">بنك الأسئلة</span><h2>أسئلة اليوم ({rows.length})</h2><p>إضافة وإيقاف أسئلة اليومية — الإجابة الصحيحة تمنح نقاط بمبا.</p></div></div>
      {msg && <AdminFlash msg={msg} />}

      {canAdd && (
        <section className="admin-panel admin-create-match">
          <div className="admin-panel-heading"><div><span className="eyebrow">سؤال جديد</span><h3>إضافة سؤال</h3></div></div>
          <div className="admin-create-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>نص السؤال<input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="من سجل هدف المباراة النهائية 2022؟" /></label>
            <label>التصنيف<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            {form.options.map((opt, i) => (
              <label key={i}>الخيار {i + 1}<input value={opt} onChange={(e) => { const next = [...form.options]; next[i] = e.target.value; setForm({ ...form, options: next }); }} /></label>
            ))}
            <label>الإجابة الصحيحة
              <select value={form.answer} onChange={(e) => setForm({ ...form, answer: Number(e.target.value) })}>{form.options.map((opt, i) => <option key={i} value={i}>{opt || `الخيار ${i + 1}`}</option>)}</select>
            </label>
          </div>
          <button className="admin-approve-btn" onClick={() => void add()}><Plus size={16} /> إضافة السؤال</button>
        </section>
      )}

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>السؤال</th><th>التصنيف</th><th>الإجابة</th><th>الحالة</th>{canAdd && <th>إجراء</th>}</tr></thead>
          <tbody>{rows.slice(0, 30).map((q) => (
            <tr key={q.id}><td style={{ maxWidth: 340 }}>{q.question}</td><td>{q.category}</td><td>{q.options[q.answer_index]}</td><td>{q.active ? 'نشط' : 'متوقف'}</td>
              {canAdd && <td><button className="role-action remove" onClick={() => void toggle(q)}>{q.active ? 'إيقاف' : 'تفعيل'}</button></td>}
            </tr>
          ))}</tbody></table></div>
        {rows.length === 0 && <AdminEmpty text="لا توجد أسئلة بعد" />}
      </section>
    </div>
  );
}

/* ================= 8) التحديات ================= */

function AdminChallengesSection() {
  const [flags, setFlags] = useState<Array<{ key: string; label_ar: string; enabled: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.from('feature_flags').select('key, label_ar, enabled').then(({ data }) => {
      if (mounted) {
        setFlags((data ?? []) as Array<{ key: string; label_ar: string; enabled: boolean }>);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const coverage = [
    { icon: Flame, title: 'حلبات التوقعات', desc: 'إنشاء الحلبات وإدارة الأعضاء والجوائز ومراجعة النتائج من قسم «حلبات التوقعات».' },
    { icon: UserCog, title: 'أنت المدرب', desc: 'قواعد الفانتازي والميزانية من قسم «أنت المدرب».' },
    { icon: BookOpen, title: 'بنك الأسئلة', desc: 'أسئلة اليومية وبنك الأسئلة من قسم «بنك الأسئلة».' },
    { icon: Trophy, title: 'التحديات', desc: 'التحديات الأسبوعية وجوائزها — عبر الحلبات والأسئلة والفانتازي معاً.' },
  ];

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">التحديات والفانتازي</span><h2>نظرة شاملة</h2><p>محركات التحديات (الحلبات + الأسئلة + الفانتازي) تُدار من أقسامها المتخصصة، ومبدلات التفعيل من هنا.</p></div></div>
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <>
          <div className="admin-quick-actions" style={{ marginBottom: 0 }}><div>{coverage.map(({ icon: Icon, title, desc }) => (
            <button key={title} style={{ alignItems: 'flex-start', textAlign: 'right' }}><Icon size={18} /><span><b style={{ display: 'block' }}>{title}</b><small style={{ color: '#89958c', fontWeight: 400, fontSize: 10.5, lineHeight: 1.6 }}>{desc}</small></span></button>
          ))}</div></div>
          {flags.length > 0 && (
            <section className="admin-panel" style={{ marginTop: 18 }}>
              <div className="admin-panel-heading"><div><span className="eyebrow">مبدلات الميزات</span><h3>تفعيل المحركات</h3></div></div>
              <div className="admin-activity-list">{flags.map((f) => (
                <div className="admin-activity-row" key={f.key}><span className="activity-dot" /><div><b>{f.label_ar}</b><small>{f.key}</small></div><time><span className={`role-pill ${f.enabled ? 'super_admin' : 'user'}`}>{f.enabled ? 'مفعّل' : 'متوقف'}</span></time></div>
              ))}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ================= 9) البمبات والمحفظة ================= */

interface LedgerAdj { id: string; user_id: string; kind: string; amount: number; reason: string; status: string; created_at: string }
interface WalletTx { id: string; user_id: string; type: string; amount: number; balance_before: number; balance_after: number; source_type: string; created_at: string }

function AdminWalletSection({ can }: { can: (k: string) => boolean }) {
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [adjustments, setAdjustments] = useState<LedgerAdj[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const [t, a] = await Promise.all([
      can('wallets.view_transactions') ? supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(60) : Promise.resolve({ data: [] as never[], error: null }),
      can('wallets.view') ? supabase.from('ledger_adjustments').select('*').order('created_at', { ascending: false }).limit(40) : Promise.resolve({ data: [] as never[], error: null }),
    ]);
    setTxs((t.data ?? []) as WalletTx[]);
    setAdjustments((a.data ?? []) as LedgerAdj[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const review = async (adj: LedgerAdj, approve: boolean) => {
    setBusyId(adj.id); setMsg('');
    const { data, error } = await supabase.rpc('admin_ledger_review', { p_adj_id: adj.id, p_status: approve ? 'approved' : 'rejected', p_reason: approve ? 'اعتماد يدوي' : 'رفض' });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) { setMsg(`فشل المراجعة: ${error?.message ?? 'تحقق من صلاحياتك'}`); return; }
    setMsg(`تم ${approve ? 'اعتماد' : 'رفض'} تعديل الدفتر ✓`);
    void load();
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">البمبات والدفاتر</span><h2>المحفظة وحركاتها</h2><p>حركات المحفظة والتعديلات اليدوية — التعديل اليدوي يمر عبر «طلب تعديل» + سبب + اعتماد + سجل تدقيق.</p></div><span className="admin-count">{txs.length} حركة</span></div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">الحركات</span><h3>آخر حركات المحفظة</h3></div></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>النوع</th><th>المبلغ</th><th>الرصيد</th><th>المصدر</th></tr></thead>
              <tbody>{txs.slice(0, 20).map((x) => (
                <tr key={x.id}><td>{x.user_id.slice(0, 8)}</td><td>{x.type}</td><td style={{ color: x.amount >= 0 ? '#197b40' : '#c54c4c' }}>{x.amount >= 0 ? '+' : ''}{x.amount.toLocaleString()}</td><td>{x.balance_before} ← {x.balance_after}</td><td>{x.source_type}</td></tr>
              ))}</tbody></table></div>
            {txs.length === 0 && <AdminEmpty text="لا توجد حركات (أو لا تملك صلاحية القراءة)" />}
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">الطلبات اليدوية</span><h3>تعديلات الدفتر ({adjustments.length})</h3></div></div>
            <div className="admin-activity-list">{adjustments.map((a) => (
              <div className="admin-activity-row" key={a.id}><span className="activity-dot" /><div><b>{a.kind === 'wallet' ? 'بمبات' : 'نقاط'} {a.amount >= 0 ? '+' : ''}{a.amount}</b><small>{a.reason}</small></div>
                {a.status === 'pending' ? (
                  <span className="admin-inline-actions">
                    <button className="role-action" disabled={busyId === a.id} onClick={() => void review(a, true)}><CheckCircle2 size={13} /> اعتماد</button>
                    <button className="role-action remove" disabled={busyId === a.id} onClick={() => void review(a, false)}><Ban size={13} /> رفض</button>
                  </span>
                ) : <time><span className={`role-pill ${a.status}`}>{a.status}</span></time>}
              </div>
            ))}</div>
            {adjustments.length === 0 && <AdminEmpty text="لا توجد طلبات تعديل يدوي" />}
          </section>
        </div>
      )}
    </div>
  );
}

/* ================= 10) المدفوعات ================= */

interface PaymentRow { id: string; user_id: string; package_name: string; bamba_amount: number; price: number; method: string; status: string; reference_no: string | null; reason: string | null; currency?: string | null; created_at: string }

function AdminPaymentsSection({ can }: { can: (k: string) => boolean }) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const canReview = can('payments.approve') || can('payments.review') || can('payments.reject');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(60);
    if (!error && data) setRows((data as PaymentRow[]));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const review = async (p: PaymentRow, status: 'success' | 'failed' | 'cancelled') => {
    setBusyId(p.id); setMsg('');
    const { data, error } = await supabase.rpc('admin_payment_review', { p_payment_id: p.id, p_status: status, p_reason: status === 'success' ? 'تم التحقق من التحويل' : 'بيانات ناقصة' });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) { setMsg(`فشل المراجعة: ${error?.message ?? 'تحقق من صلاحية اعتماد/رفض المدفوعات'}`); return; }
    setMsg(`تم ${status === 'success' ? 'اعتماد' : status === 'failed' ? 'رفض' : 'إلغاء'} الدفعة ✓`);
    void load();
  };

  const pending = rows.filter((r) => r.status === 'pending');
  const approved = rows.filter((r) => r.status === 'success');

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">المدفوعات</span><h2>مراجعة تحويلات البمبات</h2><p>القبول يضيف البمبات عبر سجل محفظة idempotent (لا يتكرر). الموظف العادي يرى فقط — الاعتماد/الاسترداد لصلاحيات مالية.</p></div>
        <span className="admin-count">{pending.length} بانتظار المراجعة • {approved.length} معتمدة</span>
      </div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل المدفوعات...</p></div> : (
        <section className="admin-panel admin-table-panel">
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>المستخدم</th><th>الباقة</th><th>البمبات</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الحالة</th>{canReview && <th>إجراء</th>}</tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}><td>{p.user_id.slice(0, 8)}</td><td>{p.package_name}</td><td>{p.bamba_amount.toLocaleString()}</td><td>{p.price.toLocaleString()} {p.currency ?? 'SAR'}</td><td>{p.method}</td><td>{p.reference_no ?? '—'}</td>
                <td><span className={`role-pill ${p.status}`}>{p.status === 'pending' ? 'بانتظار المراجعة' : p.status}</span></td>
                {canReview && (
                  <td>{p.status === 'pending' ? (
                    <span className="admin-inline-actions">
                      <button className="role-action" disabled={busyId === p.id} onClick={() => void review(p, 'success')}><CheckCircle2 size={13} /> اعتماد</button>
                      <button className="role-action remove" disabled={busyId === p.id} onClick={() => void review(p, 'failed')}><Ban size={13} /> رفض</button>
                    </span>
                  ) : <span className="role-lock"><Clock size={13} /> {fmtDate(p.created_at)}</span>}</td>
                )}
              </tr>
            ))}</tbody></table></div>
          {rows.length === 0 && <AdminEmpty text="لا توجد مدفوعات بعد" />}
        </section>
      )}
    </div>
  );
}

/* ================= 11) الكوبونات ================= */

interface CouponRow { id: string; partner_id: string | null; discount: number; price_bamba: number; quantity: number; codes: string[]; expires_at: string | null; status: string; created_at: string }

function AdminCouponsSection({ canWrite }: { canWrite: (m: string) => boolean }) {
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ discount: '50', price: '0', quantity: '1', codes: '', expires: '' });
  const [msg, setMsg] = useState('');
  const canCreate = canWrite('coupons');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }).limit(60);
    if (!error && data) setRows((data as CouponRow[]));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const discount = Number(form.discount);
    if (Number.isNaN(discount) || discount < 1 || discount > 100) { setMsg('نسبة الخصم بين 1 و 100'); return; }
    const codes = form.codes.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length === 0) { setMsg('أدخل أكواد الكوبون مفصولة بفواصل'); return; }
    const { error } = await supabase.from('coupons').insert({
      discount, price_bamba: Number(form.price) || 0, quantity: Number(form.quantity) || 1,
      codes, expires_at: form.expires ? new Date(form.expires).toISOString() : null, status: 'available',
    });
    setMsg(error ? `فشل الحفظ: ${error.message}` : `تم إنشاء ${codes.length} كود بخصم ${discount}% ✓`);
    if (!error) setForm({ discount: '50', price: '0', quantity: '1', codes: '', expires: '' });
    void load();
  };

  const disable = async (row: CouponRow) => {
    const { error } = await supabase.from('coupons').update({ status: 'expired' }).eq('id', row.id);
    setMsg(error ? `فشل التعطيل: ${error.message}` : 'تم تعطيل الكوبون ✓');
    void load();
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">الكوبونات</span><h2>كوبونات الخصم ({rows.length})</h2><p>إنشاء أكواد خصم للشركاء والمتجر — التعطيل يستخدم Soft Status بدل الحذف.</p></div></div>
      {msg && <AdminFlash msg={msg} />}

      {canCreate && (
        <section className="admin-panel admin-create-match">
          <div className="admin-panel-heading"><div><span className="eyebrow">كوبون جديد</span><h3>إنشاء أكواد</h3></div></div>
          <div className="admin-create-grid">
            <label>نسبة الخصم (%)<input type="number" min={1} max={100} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></label>
            <label>السعر (بمبة)<input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label>الكمية<input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>صلاحية حتى<input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></label>
            <label style={{ gridColumn: '1 / -1' }}>الأكواد (مفصولة بفواصل)<input value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} placeholder="BMBA20, BMBA50, ..." /></label>
          </div>
          <button className="admin-approve-btn" onClick={() => void add()}><Plus size={16} /> إنشاء الكوبون</button>
        </section>
      )}

      <section className="admin-panel admin-table-panel">
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الخصم</th><th>السعر</th><th>الكمية</th><th>الأكواد</th><th>ينتهي</th><th>الحالة</th>{canWrite('coupons') && <th>إجراء</th>}</tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}><td><b>{c.discount}%</b></td><td>{c.price_bamba.toLocaleString()}</td><td>{c.quantity}</td><td>{c.codes.slice(0, 3).join('، ')}{c.codes.length > 3 ? ` +${c.codes.length - 3}` : ''}</td><td>{fmtDate(c.expires_at)}</td>
              <td><span className={`role-pill ${c.status}`}>{c.status}</span></td>
              {canWrite('coupons') && <td>{c.status !== 'expired' && <button className="role-action remove" onClick={() => void disable(c)}><Ban size={13} /> تعطيل</button>}</td>}
            </tr>
          ))}</tbody></table></div>
        {rows.length === 0 && <AdminEmpty text="لا توجد كوبونات بعد" />}
      </section>
    </div>
  );
}

/* ================= 12) الجوائز ================= */

interface PrizeRow { id: string; name: string; price_bamba: number; stock: number; kind: string; active: boolean; created_at: string }
interface ClaimRow { id: string; prize_id: string; user_id: string; status: string; note: string | null; created_at: string }

function AdminPrizesSection() {
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase.from('prizes').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('prize_claims').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    setPrizes((p.data ?? []) as PrizeRow[]);
    setClaims((c.data ?? []) as ClaimRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const update = async (claim: ClaimRow, status: string) => {
    setBusyId(claim.id); setMsg('');
    const { data, error } = await supabase.rpc('admin_prize_update', { p_claim_id: claim.id, p_status: status, p_note: 'تحديث من لوحة الإدارة' });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) { setMsg(`فشل التحديث: ${error?.message ?? 'تحقق من الصلاحيات'}`); return; }
    setMsg(`تم تحديث حالة الطلب إلى «${status}» ✓`);
    void load();
  };

  const prizeName = (id: string) => prizes.find((p) => p.id === id)?.name ?? '—';
  const statuses = ['preparing', 'ready', 'delivered', 'completed', 'rejected'];

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">الجوائز</span><h2>الجوائز وطلبات الاسترداد</h2><p>متجر الجوائز وطلبات الأعضاء — الرفض يعيد الجائزة للمخزون تلقائياً.</p></div>
        <span className="admin-count">{claims.filter((c) => c.status === 'requested').length} طلب جديد</span>
      </div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">المخزون</span><h3>الجوائز</h3></div></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الجائزة</th><th>السعر</th><th>المخزون</th><th>النوع</th><th>الحالة</th></tr></thead>
              <tbody>{prizes.map((p) => (
                <tr key={p.id}><td><b>{p.name}</b></td><td>{p.price_bamba.toLocaleString()} بمبة</td><td>{p.stock}</td><td>{p.kind}</td><td>{p.active ? 'نشطة' : 'متوقفة'}</td></tr>
              ))}</tbody></table></div>
            {prizes.length === 0 && <AdminEmpty text="لا توجد جوائز بعد" />}
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">الطلبات</span><h3>طلبات الاسترداد ({claims.length})</h3></div></div>
            <div className="admin-activity-list">{claims.slice(0, 15).map((c) => (
              <div className="admin-activity-row" key={c.id}><span className="activity-dot" /><div><b>{prizeName(c.prize_id)}</b><small>المستخدم {c.user_id.slice(0, 8)} · {c.status}</small></div>
                {c.status === 'requested' ? (
                  <span className="admin-inline-actions">
                    {statuses.slice(0, 2).map((s) => <button key={s} className="role-action" disabled={busyId === c.id} onClick={() => void update(c, s)}>{s}</button>)}
                    <button className="role-action remove" disabled={busyId === c.id} onClick={() => void update(c, 'rejected')}><Ban size={13} /> رفض</button>
                  </span>
                ) : <time><span className={`role-pill ${c.status}`}>{c.status}</span></time>}
              </div>
            ))}</div>
            {claims.length === 0 && <AdminEmpty text="لا توجد طلبات استرداد" />}
          </section>
        </div>
      )}
    </div>
  );
}

/* ================= 13) المتجر ================= */
/* يستخدم StoreSection من ./store-admin */

/* ================= 14) المحتوى والإشعارات ================= */

interface CmsRow { id: string; slug: string; section: string; title_ar: string; body_ar: string; updated_at: string }
interface NotifRow { id: string; title: string; body: string; status: string; send_at: string | null; created_at: string }

function AdminContentSection({ canWrite }: { canWrite: (m: string) => boolean }) {
  const [pages, setPages] = useState<CmsRow[]>([]);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: '', body: '', page_link: '' });
  const [msg, setMsg] = useState('');
  const canCms = canWrite('cms');
  const canNotif = canWrite('notifications');

  const load = async () => {
    setLoading(true);
    const [c, n] = await Promise.all([
      canCms ? supabase.from('cms_pages').select('*').order('slug', { ascending: true }) : Promise.resolve({ data: [] as never[], error: null }),
      canNotif ? supabase.from('admin_notifications').select('*').order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] as never[], error: null }),
    ]);
    setPages((c.data ?? []) as CmsRow[]);
    setNotifs((n.data ?? []) as NotifRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [canCms, canNotif]);

  const savePage = async (page: CmsRow) => {
    const body = (drafts[page.id] ?? page.body_ar).trim();
    const { error } = await supabase.from('cms_pages').update({ body_ar: body }).eq('id', page.id);
    setMsg(error ? `فشل الحفظ: ${error.message}` : `تم تحديث صفحة «${page.title_ar}» ✓`);
    void load();
  };

  const addNotif = async () => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('أدخل عنوان الإشعار ونصه'); return; }
    const { error } = await supabase.from('admin_notifications').insert({
      title: form.title.trim(), body: form.body.trim(), audience: { all: true }, page_link: form.page_link.trim() || null, status: 'draft',
    });
    setMsg(error ? `فشل الحفظ: ${error.message}` : 'تم إنشاء الإشعار كمسودة — الإرسال الجماعي يتطلب صلاحية `notifications.send` ✓');
    if (!error) setForm({ title: '', body: '', page_link: '' });
    void load();
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">المحتوى والإشعارات</span><h2>CMS والإشعارات</h2><p>محتوى الصفحات (عن/شروط/خصوصية/FAQ) وإنشاء الإشعارات كمسودات.</p></div></div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">الصفحات</span><h3>محتوى CMS</h3></div></div>
            <div className="admin-activity-list">{pages.map((page) => (
              <div className="admin-cms-item" key={page.id}>
                <b>{page.title_ar} <span className="store-admin-badge">{page.section}</span></b>
                <textarea rows={4} value={drafts[page.id] ?? page.body_ar} onChange={(e) => setDrafts({ ...drafts, [page.id]: e.target.value })} disabled={!canCms} />
                {canCms && <button className="role-action" onClick={() => void savePage(page)}>حفظ التعديل</button>}
              </div>
            ))}</div>
            {pages.length === 0 && <AdminEmpty text="لا تملك صلاحية CMS" />}
          </section>
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">الإشعارات</span><h3>مسودات الإشعارات ({notifs.length})</h3></div></div>
            {canNotif && (
              <div className="admin-create-grid" style={{ marginBottom: 14 }}>
                <label style={{ gridColumn: '1 / -1' }}>العنوان<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                <label style={{ gridColumn: '1 / -1' }}>النص<textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
                <label style={{ gridColumn: '1 / -1' }}>رابط الصفحة<input value={form.page_link} onChange={(e) => setForm({ ...form, page_link: e.target.value })} placeholder="/store" /></label>
              </div>
            )}
            {canNotif && <button className="admin-approve-btn" onClick={() => void addNotif()}><Send size={16} /> حفظ كمسودة</button>}
            <div className="admin-activity-list" style={{ marginTop: 14 }}>{notifs.slice(0, 8).map((n) => (
              <div className="admin-activity-row" key={n.id}><span className="activity-dot" /><div><b>{n.title}</b><small>{n.body.slice(0, 60)}</small></div><time><span className={`role-pill ${n.status}`}>{n.status}</span></time></div>
            ))}</div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ================= 15) التقارير ================= */

function AdminReportsSection() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<{
    byCountry: Array<{ country: string; count: number }>;
    predictions: { total: number; scored: number; exact: number; points: number };
    wallet: { tx: number; total: number };
    payments: Record<string, number>;
    support: Record<string, number>;
  }>({ byCountry: [], predictions: { total: 0, scored: 0, exact: 0, points: 0 }, wallet: { tx: 0, total: 0 }, payments: {}, support: {} });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [profiles, preds, txResp, pays, sups] = await Promise.all([
        supabase.from('profiles').select('country, user_points, bamba_balance').limit(2000),
        supabase.from('predictions').select('scored, points_awarded, home_score, away_score').limit(5000),
        supabase.from('wallet_transactions').select('amount').limit(5000),
        supabase.from('payments').select('status').limit(5000),
        supabase.from('support_tickets').select('status').limit(5000),
      ]);
      if (!mounted) return;
      const pr = (profiles.data ?? []) as Array<{ country: string; user_points: number; bamba_balance: number }>;
      const countryMap: Record<string, number> = {};
      for (const u of pr) countryMap[u.country] = (countryMap[u.country] ?? 0) + 1;
      const pd = (preds.data ?? []) as Array<{ scored: boolean; points_awarded: number; home_score: number; away_score: number }>;
      const payMap: Record<string, number> = {};
      for (const p of (pays.data ?? []) as Array<{ status: string }>) payMap[p.status] = (payMap[p.status] ?? 0) + 1;
      const supMap: Record<string, number> = {};
      for (const s of (sups.data ?? []) as Array<{ status: string }>) supMap[s.status] = (supMap[s.status] ?? 0) + 1;
      const txRows = (txResp.data ?? []) as Array<{ amount: number }>;
      setReport({
        byCountry: Object.entries(countryMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([country, count]) => ({ country, count })),
        predictions: { total: pd.length, scored: pd.filter((x) => x.scored).length, exact: 0, points: pd.reduce((s, x) => s + (x.scored ? x.points_awarded : 0), 0) },
        wallet: { tx: txRows.length, total: txRows.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) - txRows.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0) },
        payments: payMap,
        support: supMap,
      });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">التقارير والتحليلات</span><h2>ملخص المنصة</h2><p>إحصائيات مجمعة — التقارير المالية (reports.financial) لصلاحيات مالية فقط.</p></div></div>
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تجميع البيانات...</p></div> : (
        <>
          <div className="admin-stat-grid">
            <div className="admin-stat-card green"><span className="admin-stat-icon"><BarChart3 size={20} /></span><div><small>التوقعات</small><b>{report.predictions.total.toLocaleString()}</b><span>{report.predictions.scored.toLocaleString()} محتسبة</span></div></div>
            <div className="admin-stat-card blue"><span className="admin-stat-icon"><CircleDollarSign size={20} /></span><div><small>حركات المحفظة</small><b>{report.wallet.tx.toLocaleString()}</b><span>صافي {report.wallet.total.toLocaleString()} بمبة</span></div></div>
            <div className="admin-stat-card gold"><span className="admin-stat-icon"><WalletCards size={20} /></span><div><small>المدفوعات</small><b>{report.payments.success ?? 0}</b><span>{report.payments.pending ?? 0} معلقة</span></div></div>
            <div className="admin-stat-card orange"><span className="admin-stat-icon"><FileText size={20} /></span><div><small>تذاكر الدعم</small><b>{report.support.resolved ?? 0}</b><span>{report.support.new ?? 0} جديدة</span></div></div>
          </div>
          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">التوزيع</span><h3>المستخدمون حسب الدولة</h3></div></div>
              <div className="admin-activity-list">{report.byCountry.map((c) => (
                <div className="admin-activity-row" key={c.country}><span className="activity-dot" /><div><b>{c.country}</b></div><time>{c.count} مستخدم</time></div>
              ))}</div>
              {report.byCountry.length === 0 && <AdminEmpty text="لا توجد بيانات" />}
            </section>
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">الحالة</span><h3>المدفوعات والتذاكر</h3></div></div>
              <div className="admin-activity-list">{Object.entries(report.payments).map(([k, v]) => (
                <div className="admin-activity-row" key={`p-${k}`}><span className="activity-dot" /><div><b>دفعة {k}</b></div><time>{v}</time></div>
              ))}
                {Object.entries(report.support).map(([k, v]) => (
                  <div className="admin-activity-row" key={`s-${k}`}><span className="activity-dot" /><div><b>تذكرة {k}</b></div><time>{v}</time></div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= 16) الأمان وسجل التدقيق ================= */

interface ApprovalReq { id: string; request_type: string; resource_type: string; resource_id: string | null; reason: string; status: string; created_at: string }
interface AuditRow { id: string; action: string; resource_type: string; resource_id: string | null; reason: string | null; admin_user_id: string | null; created_at: string }

function AdminSecuritySection({ can }: { can: (k: string) => boolean }) {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<Array<{ id: number; event_type: string; success: boolean; failure_reason: string | null; created_at: string }>>([]);
  const [approvals, setApprovals] = useState<ApprovalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: 'wallet_adjustment', resource: 'wallet', reason: '', resourceId: '', direction: 'credit', amount: '', homeScore: '', awayScore: '' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const canAudit = can('audit.view');
  const canEvents = can('security.view_events');

  const load = async () => {
    setLoading(true);
    const [a, e, ap] = await Promise.all([
      canAudit ? supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40) : Promise.resolve({ data: [] as never[], error: null }),
      canEvents ? supabase.from('admin_login_events').select('*').order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] as never[], error: null }),
      supabase.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    setAudit((a.data ?? []) as AuditRow[]);
    setEvents((e.data ?? []) as typeof events);
    setApprovals((ap.data ?? []) as ApprovalReq[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [canAudit, canEvents]);

  const createApproval = async () => {
    if (!form.reason.trim()) { setMsg('اكتب سبب الطلب (إلزامي للعمليات الحساسة)'); return; }
    const resourceId = form.resourceId.trim();
    const requestData: Record<string, unknown> = {};
    if (form.type === 'wallet_adjustment' || form.type === 'points_adjustment') {
      const amount = Number(form.amount);
      if (!resourceId) { setMsg('أدخل معرّف المستخدم (UUID) في حقل معرّف المورد'); return; }
      if (!amount || amount <= 0) { setMsg('أدخل مقدارًا صحيحًا أكبر من صفر'); return; }
      if (form.type === 'wallet_adjustment') { requestData.direction = form.direction; requestData.amount = amount; }
      else { requestData.amount = amount; }
    } else if (form.type === 'match_result_correction') {
      const h = Number(form.homeScore);
      const a = Number(form.awayScore);
      if (!resourceId) { setMsg('أدخل معرّف المباراة في حقل معرّف المورد'); return; }
      if (Number.isNaN(h) || h < 0 || Number.isNaN(a) || a < 0) { setMsg('أدخل نتيجة صحيحة (أهداف غير سالبة)'); return; }
      requestData.home_score = h; requestData.away_score = a; requestData.is_fixture = false;
    } else if (form.type === 'payment_refund' || form.type === 'prediction_correction') {
      if (!resourceId) { setMsg('أدخل معرّف المورد (UUID) الخاص بالعملية'); return; }
    }
    setMsg('');
    const { data, error } = await supabase.rpc('create_approval_request', {
      p_request_type: form.type, p_resource_type: form.resource, p_resource_id: resourceId || null, p_reason: form.reason.trim(), p_request_data: requestData,
    });
    if (error || !data || (data as { error?: string }).error) {
      const derr = data as { error?: string; message?: string; retry_after?: number };
      setMsg(`فشل إنشاء الطلب: ${derr.message ?? derr.error ?? error?.message ?? 'تحقق من الصلاحيات'}${derr.retry_after ? ` — حاول بعد ${derr.retry_after} ثانية` : ''}`); return;
    }
    setMsg('تم إنشاء طلب الاعتماد — يراجعه مدير آخر (Maker → Checker) ثم يُنفَّذ عبر زر «تنفيذ» ✓');
    setForm({ ...form, reason: '', resourceId: '', amount: '', homeScore: '', awayScore: '' });
    void load();
  };

  const reviewApproval = async (req: ApprovalReq, approve: boolean) => {
    setBusyId(req.id); setMsg('');
    const { data, error } = await supabase.rpc('review_approval_request', { p_request_id: req.id, p_approve: approve, p_review_note: approve ? 'معتمد' : 'مرفوض' });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) { setMsg(`فشل المراجعة: ${error?.message ?? (data as { error?: string }).error ?? 'لا يمكن لمنشئ الطلب اعتماده بنفسه'}`); return; }
    setMsg(`تم ${approve ? 'اعتماد' : 'رفض'} الطلب ✓`);
    void load();
  };

  const executeApproval = async (req: ApprovalReq) => {
    setBusyId(req.id); setMsg('');
    const res = await execApproval(req.id, 'تنفيذ يدوي من اللوحة');
    setBusyId(null);
    if (!res.success) { setMsg(`فشل التنفيذ: ${res.error?.code} — ${res.error?.message}`); void load(); return; }
    setMsg('تم تنفيذ الطلب واكتمل ✓');
    void load();
  };

  const types = [
    { value: 'wallet_adjustment', label: 'تعديل بمبات يدوي' },
    { value: 'points_adjustment', label: 'تعديل نقاط' },
    { value: 'match_result_correction', label: 'تصحيح نتيجة مباراة' },
    { value: 'prediction_correction', label: 'تصحيح توقع' },
    { value: 'payment_refund', label: 'استرداد دفعة' },
    { value: 'prize_redemption', label: 'اعتماد جائزة' },
    { value: 'rbac_elevation', label: 'رفع صلاحيات موظف' },
    { value: 'maintenance_activate', label: 'تفعيل وضع الصيانة' },
    { value: 'notification_broadcast', label: 'إشعار جماعي' },
  ];

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">الأمان والتدقيق</span><h2>سجل التدقيق والطلبات الحساسة</h2><p>سجل التدقيق غير قابل للتعديل أو الحذف (read-only حتى للسوبر أدمن). العمليات الحساسة تمر عبر طلب اعتماد ولا يعتمده منشئه.</p></div></div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <>
          <div className="admin-dashboard-grid">
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">Audit Log</span><h3>آخر العمليات ({audit.length})</h3></div></div>
              <div className="admin-activity-list">{audit.slice(0, 12).map((x) => (
                <div className="admin-activity-row" key={x.id}><span className="activity-dot" /><div><b dir="ltr">{x.action}</b><small>{x.resource_type}{x.resource_id ? ` #${x.resource_id}` : ''}{x.reason ? ` · ${x.reason}` : ''}</small></div><time>{fmtDate(x.created_at)}</time></div>
              ))}</div>
              {audit.length === 0 && <AdminEmpty text="لا توجد سجلات (أو لا تملك صلاحية audit.view)" />}
            </section>
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">أحداث الدخول</span><h3>تسجيل دخول الإدارة</h3></div></div>
              <div className="admin-activity-list">{events.map((e) => (
                <div className="admin-activity-row" key={e.id}><span className="activity-dot" /><div><b dir="ltr">{e.event_type}</b><small>{e.failure_reason ?? ''}</small></div><time><span className={`role-pill ${e.success ? 'super_admin' : 'user'}`}>{e.success ? 'ناجح' : 'فاشل'}</span></time></div>
              ))}</div>
              {events.length === 0 && <AdminEmpty text="لا توجد أحداث (أو لا تملك security.view_events)" />}
            </section>
          </div>

          <div className="admin-dashboard-grid" style={{ marginTop: 18 }}>
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">طلب اعتماد</span><h3>إنشاء عملية حساسة (Maker)</h3></div></div>
              <div className="admin-create-grid" style={{ marginBottom: 12 }}>
                <label style={{ gridColumn: '1 / -1' }}>نوع العملية<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
                {(form.type === 'wallet_adjustment' || form.type === 'points_adjustment' || form.type === 'match_result_correction' || form.type === 'payment_refund' || form.type === 'prediction_correction') && (
                  <label style={{ gridColumn: '1 / -1' }}>معرّف المورد (UUID المستخدم / معرّف المباراة / UUID الدفعة)<input value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} placeholder="مثال: 60655563-cfef-4818-b21c-ec422a4c05e4" dir="ltr" /></label>
                )}
                {form.type === 'wallet_adjustment' && (
                  <label>الاتجاه<select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="credit">إضافة (Credit)</option><option value="debit">خصم (Debit)</option></select></label>
                )}
                {(form.type === 'wallet_adjustment' || form.type === 'points_adjustment') && (
                  <label>المقدار<input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="عدد البمبات/النقاط" /></label>
                )}
                {form.type === 'match_result_correction' && (
                  <>
                    <label>أهداف الفريق الأول<input type="number" min={0} value={form.homeScore} onChange={(e) => setForm({ ...form, homeScore: e.target.value })} /></label>
                    <label>أهداف الفريق الثاني<input type="number" min={0} value={form.awayScore} onChange={(e) => setForm({ ...form, awayScore: e.target.value })} /></label>
                  </>
                )}
                <label style={{ gridColumn: '1 / -1' }}>سبب الطلب (إلزامي)<textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="مثال: تصحيح نتيجة من المصدر الرسمي" /></label>
              </div>
              <button className="admin-approve-btn" onClick={() => void createApproval()}><ListChecks size={16} /> إنشاء طلب الاعتماد</button>
            </section>
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">قائمة الانتظار</span><h3>طلبات الاعتماد ({approvals.length})</h3></div></div>
              <div className="admin-activity-list">{approvals.map((r) => (
                <div className="admin-activity-row" key={r.id}><span className="activity-dot" /><div><b>{r.request_type}</b><small>{r.reason}{r.resource_id ? ` · id: ${r.resource_id}` : ''}</small></div>
                  {r.status === 'pending' ? (
                    <span className="admin-inline-actions">
                      <button className="role-action" disabled={busyId === r.id} onClick={() => void reviewApproval(r, true)}><CheckCircle2 size={13} /> اعتماد</button>
                      <button className="role-action remove" disabled={busyId === r.id} onClick={() => void reviewApproval(r, false)}><Ban size={13} /> رفض</button>
                    </span>
                  ) : r.status === 'approved' ? (
                    <span className="admin-inline-actions">
                      <button className="role-action" disabled={busyId === r.id} onClick={() => void executeApproval(r)}><PlayCircle size={13} /> تنفيذ</button>
                      <time><span className={`role-pill ${r.status}`}>{r.status}</span></time>
                    </span>
                  ) : <time><span className={`role-pill ${r.status}`}>{r.status}</span></time>}
                </div>
              ))}</div>
              {approvals.length === 0 && <AdminEmpty text="لا توجد طلبات اعتماد" />}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= 17) مصفوفة الأدوار ================= */

interface RoleRow { id: string; name: string; display_name_ar: string; description: string | null; status: string }
interface AdminUserRow { id: string; profile_id: string | null; username: string; display_name: string | null; status: string; is_super_admin: boolean; last_login_at: string | null }
interface UserRoleLink { admin_user_id: string; role_id: string; expires_at: string | null }
interface AdminRoleLegacy { role: string; label_ar: string; read_modules: string[]; write_modules: string[] }

function AdminRolesSection({ can }: { can: (k: string) => boolean }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permCount, setPermCount] = useState<Record<string, number>>({});
  const [legacy, setLegacy] = useState<AdminRoleLegacy[]>([]);
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [links, setLinks] = useState<UserRoleLink[]>([]);
  const [permsByRole, setPermsByRole] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManage = can('security.manage_2fa') || can('security.lock_admin');

  const load = async () => {
    setLoading(true);
    const [r, pc, l, au, aur, rp] = await Promise.all([
      supabase.from('roles').select('*').order('name', { ascending: true }),
      supabase.from('role_permissions').select('role_id, permission_id'),
      supabase.from('admin_roles').select('*').order('role', { ascending: true }),
      supabase.from('admin_users').select('*').order('username', { ascending: true }),
      supabase.from('admin_user_roles').select('admin_user_id, role_id, expires_at'),
      supabase.from('permissions').select('key, module'),
    ]);
    if (r.error || !r.data) { setLoading(false); return; }
    setRoles((r.data ?? []) as RoleRow[]);
    setLegacy((l.data ?? []) as AdminRoleLegacy[]);
    setAdmins((au.data ?? []) as AdminUserRow[]);
    setLinks((aur.data ?? []) as UserRoleLink[]);
    const counts: Record<string, number> = {};
    const keys: Record<string, string[]> = {};
    const permMap = new Map<string, string>((rp.data ?? []).map((p: { key: string; module: string }) => [p.key, p.module]));
    for (const row of (pc.data ?? []) as Array<{ role_id: string; permission_id: string }>) {
      const key = permMap.get(row.permission_id);
      counts[row.role_id] = (counts[row.role_id] ?? 0) + 1;
      if (key) keys[row.role_id] = [...(keys[row.role_id] ?? []), key];
    }
    setPermCount(counts);
    setPermsByRole(keys);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const assign = async (admin: AdminUserRow, remove: boolean) => {
    const roleName = sel[admin.id];
    if (!remove && !roleName) { setMsg('اختر الدور أولاً'); return; }
    setBusyId(admin.id); setMsg('');
    const { data, error } = await supabase.rpc('admin_assign_role', {
      p_admin_user_id: admin.id,
      p_role_name: remove ? '' : roleName,
      p_expires_at: expiry[admin.id] ? new Date(expiry[admin.id]).toISOString() : null,
      p_remove: remove,
    });
    setBusyId(null);
    if (error || !data || (data as { error?: string }).error) { setMsg(`فشل التعديل: ${error?.message ?? 'تحقق من الصلاحيات'}`); return; }
    setMsg(remove ? `تمت إزالة الدور من ${admin.username} ✓` : `تم تعيين الدور «${roleName}» لـ ${admin.username} ✓`);
    void load();
  };

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? '—';
  const adminRoles = (adminId: string) => links.filter((l) => l.admin_user_id === adminId);

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">RBAC</span><h2>مصفوفة الأدوار والصلاحيات</h2><p>الموظف → الدور → الصلاحية → النطاق → الاعتماد → التنفيذ → تدقيق. الدور الافتراضي super_admin يملك كل الصلاحيات.</p></div>
        <span className="admin-count">{roles.length} دور • {Object.values(permCount).reduce((s, x) => s + x, 0)} رابطة صلاحية</span>
      </div>
      {msg && <AdminFlash msg={msg} />}

      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل المصفوفة...</p></div> : (
        <>
          <div className="admin-perm-grid">
            {roles.map((role) => (
              <div className="admin-perm-card" key={role.id}>
                <div className="admin-perm-head"><b>{role.display_name_ar}</b><span className="store-admin-badge">{role.name}</span></div>
                <p>{role.description ?? ''}</p>
                <div className="admin-perm-meta"><span>{permCount[role.id] ?? 0} صلاحية</span><span className={`role-pill ${role.status}`}>{role.status}</span></div>
                {(permsByRole[role.id] ?? []).slice(0, 6).length > 0 && (
                  <div className="admin-perm-chips">{(permsByRole[role.id] ?? []).slice(0, 8).map((p) => <span key={p} dir="ltr">{p}</span>)}{ (permsByRole[role.id] ?? []).length > 8 ? <span dir="ltr">+{(permsByRole[role.id] ?? []).length - 8}</span> : null}</div>
                )}
              </div>
            ))}
          </div>

          {legacy.length > 0 && (
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">توافق خلفي</span><h3>مصفوفة الوحدات القديمة (admin_roles)</h3></div></div>
              <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الدور</th><th>القراءة</th><th>الكتابة</th></tr></thead>
                <tbody>{legacy.map((role) => (
                  <tr key={role.role}><td><b>{role.label_ar}</b> <span className="store-admin-badge">{role.role}</span></td><td>{role.read_modules.join('، ')}</td><td>{role.write_modules.join('، ')}</td></tr>
                ))}</tbody></table></div>
            </section>
          )}

          <section className="admin-panel" style={{ marginTop: 18 }}>
            <div className="admin-panel-heading"><div><span className="eyebrow">الموظفون</span><h3>حسابات الإدارة ({admins.length}) — صلاحيات مؤقتة مدعومة (expires_at)</h3></div></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>الحساب</th><th>الأدوار</th><th>الحالة</th>{canManage && <th>تعيين دور</th>}</tr></thead>
              <tbody>{admins.map((a) => (
                <tr key={a.id}><td><div className="admin-table-user"><span className="admin-user-avatar">{(a.display_name ?? a.username).charAt(0)}</span><span><b>{a.display_name ?? a.username}</b><small>{a.is_super_admin ? 'سوبر أدمن' : a.profile_id?.slice(0, 8) ?? '—'}</small></span></div></td>
                  <td><div className="admin-perm-chips">{adminRoles(a.id).map((l) => <span key={l.role_id} dir="ltr">{roleName(l.role_id)}{l.expires_at ? ` حتى ${fmtDate(l.expires_at)}` : ''}</span>)}</div></td>
                  <td><span className={`role-pill ${a.status}`}>{a.status}</span></td>
                  {canManage && (
                    <td>
                      <span className="admin-inline-actions">
                        <select value={sel[a.id] ?? ''} onChange={(e) => setSel({ ...sel, [a.id]: e.target.value })}><option value="">اختر دوراً...</option>{roles.map((r) => <option key={r.id} value={r.name}>{r.display_name_ar}</option>)}</select>
                        <input type="date" value={expiry[a.id] ?? ''} onChange={(e) => setExpiry({ ...expiry, [a.id]: e.target.value })} title="صلاحية مؤقتة حتى" />
                        <button className="role-action" disabled={busyId === a.id} onClick={() => void assign(a, false)}>{busyId === a.id ? <Loader2 size={13} className="spin" /> : 'تعيين'}</button>
                        <button className="role-action remove" disabled={busyId === a.id} onClick={() => void assign(a, true)}>إزالة</button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}</tbody></table></div>
            {admins.length === 0 && <AdminEmpty text="لا توجد حسابات إدارة مسجلة" />}
          </section>
        </>
      )}
    </div>
  );
}

/* ================= 18) إعدادات النظام ================= */

interface SettingRow { key: string; value: unknown; updated_at: string }
interface FlagRow { key: string; label_ar: string; enabled: boolean; description: string | null }
interface VersionRow { id: string; platform: string; version: string; min_supported: string | null; mandatory: boolean; whats_new: string | null; created_at: string }

function AdminSettingsSection({ canWrite }: { canWrite: (m: string) => boolean }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const canSettings = canWrite('settings');
  const canFlags = canWrite('settings') || canWrite('feature_flags');

  const load = async () => {
    setLoading(true);
    const [s, f, v] = await Promise.all([
      supabase.from('system_settings').select('*').order('key', { ascending: true }),
      supabase.from('feature_flags').select('*').order('key', { ascending: true }),
      supabase.from('app_versions').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setSettings((s.data ?? []) as SettingRow[]);
    setFlags((f.data ?? []) as FlagRow[]);
    setVersions((v.data ?? []) as VersionRow[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const toggleFlag = async (flag: FlagRow) => {
    const { error } = await supabase.from('feature_flags').update({ enabled: !flag.enabled }).eq('key', flag.key);
    setMsg(error ? `فشل التحديث: ${error.message}` : `تم ${!flag.enabled ? 'تفعيل' : 'إيقاف'} «${flag.label_ar}» ✓`);
    void load();
  };

  const summaries: Record<string, string> = {
    bamba_daily_limit: 'الحد اليومي لكسب البمبات', referral_bonus: 'مكافأة دعوة صديق', arena_max_join: 'الحد الأقصى للانضمام لحلبات', arena_max_own: 'الحد الأقصى لإنشاء حلبات', coach_budget: 'ميزانية تشكيلة المدرب', coach_max_per_team: 'الحد الأقصى من فريق واحد', coach_squad_size: 'حجم تشكيلة المدرب', quiz_reward_per_question: 'مكافأة السؤال اليومي', prediction_close_minutes_before: 'إغلاق التوقعات قبل المباراة (دقيقة)',
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro"><div><span className="eyebrow">النظام</span><h2>إعدادات النظام</h2><p>الإعدادات العامة ومبدلات الميزات وإصدارات التطبيق — تعديل هذه القيم مسجل في سجل التدقيق.</p></div></div>
      {msg && <AdminFlash msg={msg} />}
      {loading ? <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري التحميل...</p></div> : (
        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><span className="eyebrow">القيم</span><h3>إعدادات النظام ({settings.length})</h3></div></div>
            <div className="admin-activity-list">{settings.map((s) => (
              <div className="admin-activity-row" key={s.key}><span className="activity-dot" /><div><b dir="ltr">{s.key}</b><small>{summaries[s.key] ?? 'قيمة عامة'}</small></div><time><b style={{ color: '#197b40' }}>{JSON.stringify(s.value)}</b></time></div>
            ))}</div>
            {settings.length === 0 && <AdminEmpty text="لا توجد إعدادات" />}
          </section>
          <div className="admin-settings-col">
            <section className="admin-panel">
              <div className="admin-panel-heading"><div><span className="eyebrow">مبدلات الميزات</span><h3>Feature Flags</h3></div></div>
              <div className="admin-activity-list">{flags.map((f) => (
                <div className="admin-activity-row" key={f.key}><span className="activity-dot" /><div><b>{f.label_ar}</b><small>{f.description ?? f.key}</small></div>
                  {canFlags ? <button className={`role-action ${f.enabled ? '' : 'remove'}`} onClick={() => void toggleFlag(f)}>{f.enabled ? 'إيقاف' : 'تفعيل'}</button>
                    : <time><span className={`role-pill ${f.enabled ? 'super_admin' : 'user'}`}>{f.enabled ? 'مفعّل' : 'متوقف'}</span></time>}
                </div>
              ))}</div>
            </section>
            <section className="admin-panel" style={{ marginTop: 18 }}>
              <div className="admin-panel-heading"><div><span className="eyebrow">التحديثات</span><h3>إصدارات التطبيق ({versions.length})</h3></div></div>
              <div className="admin-activity-list">{versions.slice(0, 10).map((v) => (
                <div className="admin-activity-row" key={v.id}><span className="activity-dot" /><div><b>{v.platform} {v.version}</b><small>{v.whats_new ?? ''} {v.mandatory ? '· تحديث إجباري' : ''}</small></div><time>{fmtDate(v.created_at)}</time></div>
              ))}</div>
              {versions.length === 0 && <AdminEmpty text="لا توجد إصدارات مسجلة" />}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}