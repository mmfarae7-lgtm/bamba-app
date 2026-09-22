import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  FileText,
  Flame,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
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

type AdminSection = 'dashboard' | 'users' | 'matches' | 'predictions' | 'challenges' | 'wallet' | 'store' | 'content' | 'reports' | 'security';

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
  { id: 'challenges', label: 'التحديات والفانتازي', icon: Flame },
  { id: 'wallet', label: 'البمبات والمدفوعات', icon: WalletCards },
  { id: 'store', label: 'المتجر والجوائز', icon: ShoppingBag },
  { id: 'content', label: 'المحتوى والإشعارات', icon: FileText },
  { id: 'reports', label: 'التقارير والتحليلات', icon: Activity },
  { id: 'security', label: 'الأمان وسجل التدقيق', icon: ShieldCheck },
];

// صلاحيات المشرف (admin): لوحة محدودة — المباريات + المتجر فقط.
const ADMIN_ALLOWED: AdminSection[] = ['dashboard', 'matches', 'store'];

export function AdminPage({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const isSuper = profile.role === 'super_admin';
  const allowed: AdminSection[] = isSuper ? sections.map((s) => s.id) : ADMIN_ALLOWED;
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [sectionsOpen, setSectionsOpen] = useState<AdminSection[]>(allowed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const loadAdminData = async () => {
    setLoading(true);
    setError('');
    const [profilesResult, logsResult] = await Promise.all([
      supabase.from('profiles').select('id, username, email, role, bamba_balance, user_points, country, created_at').order('created_at', { ascending: false }).limit(100),
      isSuper
        ? supabase.from('admin_audit_logs').select('id, action, resource, reason, created_at').order('created_at', { ascending: false }).limit(12)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) {
      setError('تعذر تحميل بيانات لوحة الإدارة حالياً.');
    } else {
      setUsers((profilesResult.data ?? []) as Profile[]);
      setLogs((logsResult.data ?? []) as AuditLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await loadAdminData();
      if (mounted) setSectionsOpen(allowed);
    })();
    return () => { mounted = false; };
  }, [isSuper]);

  const currentLabel = sections.find((item) => item.id === section)?.label ?? '';
  const currentAllowed = allowed.includes(section);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) => `${user.username} ${user.email} ${user.country}`.toLowerCase().includes(normalized));
  }, [query, users]);

  const stats = [
    { label: 'إجمالي المستخدمين', value: users.length.toLocaleString(), icon: Users, tone: 'green' },
    { label: 'المديرون', value: users.filter((user) => user.role !== 'user').length.toLocaleString(), icon: ShieldCheck, tone: 'blue' },
    { label: 'إجمالي البمبات', value: users.reduce((sum, user) => sum + user.bamba_balance, 0).toLocaleString(), icon: CircleDollarSign, tone: 'gold' },
    { label: 'إجمالي النقاط', value: users.reduce((sum, user) => sum + user.user_points, 0).toLocaleString(), icon: BarChart3, tone: 'orange' },
  ];

  const selectSection = (next: AdminSection) => {
    setSection(next);
    setMenuOpen(false);
  };

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
          {sections.filter(({ id }) => allowed.includes(id)).map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => selectSection(id)}><Icon size={18} /><span>{label}</span><ChevronLeft size={15} /></button>)}
        </nav>
        <button className="admin-back" onClick={onBack}><ArrowRight size={17} /> العودة للتطبيق</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
          <div><span className="eyebrow">نظام تشغيل BMBA</span><h1>{currentLabel}</h1></div>
          <div className="admin-top-actions"><button aria-label="الإشعارات"><Bell size={19} /><i /></button><span className="admin-avatar">{profile.username.charAt(0)}</span></div>
        </header>

        {error && <div className="admin-alert"><LockKeyhole size={17} /> {error}</div>}
        {!isSuper && !currentAllowed && (
          <div className="admin-content">
            <div className="admin-placeholder"><LockKeyhole size={34} /><span className="eyebrow">صلاحية محدودة</span><h2>لا يمكن الوصول هنا</h2><p>حسابك الحالي (مشرف) يملك صلاحية قسمي «المباريات» و«المتجر» فقط. يبقى باقي اللوحة للسوبر أدمن.</p></div>
          </div>
        )}
        {loading ? (
          <div className="admin-loading"><Activity size={25} className="spin" /><p>جاري فحص بيانات الإدارة...</p></div>
        ) : !isSuper ? (
          currentAllowed && (
            section === 'matches' ? <MatchesSection /> : section === 'store' ? <StoreSection /> : <Dashboard stats={stats} users={users} logs={logs} onSection={selectSection} />
          )
        ) : section === 'dashboard' ? <Dashboard stats={stats} users={users} logs={logs} onSection={selectSection} /> : section === 'users' ? (
          <UsersSection users={filteredUsers} query={query} setQuery={setQuery} isSuper={isSuper} onRoleChanged={() => { void loadAdminData(); }} />
        ) : section === 'matches' ? <MatchesSection /> : section === 'store' ? <StoreSection /> : <AdminPlaceholder section={currentLabel} />}
      </main>
    </div>
  );
}

function Dashboard({ stats, users, logs, onSection }: { stats: Array<{ label: string; value: string; icon: typeof Users; tone: string }>; users: Profile[]; logs: AuditLog[]; onSection: (section: AdminSection) => void }) {
  const quick = [
    { label: 'إدارة المستخدمين', icon: Users, section: 'users' as AdminSection },
    { label: 'إدارة المباريات', icon: Trophy, section: 'matches' as AdminSection },
    { label: 'إدارة التوقعات', icon: BarChart3, section: 'predictions' as AdminSection },
    { label: 'سجل التدقيق', icon: ShieldCheck, section: 'security' as AdminSection },
  ];
  return <div className="admin-content">
    <div className="admin-welcome"><div><span>صباح الخير،</span><h2>مرحباً بك في لوحة BMBA</h2><p>تابع نشاط المنصة وإدارة جميع العمليات من مكان واحد.</p></div><div className="admin-security-pill"><ShieldCheck size={18} /><span>الحماية مفعلة<small>RBAC · Audit Log</small></span></div></div>
    <div className="admin-stat-grid">{stats.map(({ label, value, icon: Icon, tone }) => <div className={`admin-stat-card ${tone}`} key={label}><span className="admin-stat-icon"><Icon size={20} /></span><div><small>{label}</small><b>{value}</b><span>محدث الآن</span></div></div>)}</div>
    <div className="admin-dashboard-grid">
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">النشاط</span><h3>آخر عمليات الإدارة</h3></div><button onClick={() => onSection('security')}>عرض السجل <ChevronLeft size={16} /></button></div>{logs.length ? <div className="admin-activity-list">{logs.map((log) => <div className="admin-activity-row" key={log.id}><span className="activity-dot" /><div><b>{log.action}</b><small>{log.resource}{log.reason ? ` · ${log.reason}` : ''}</small></div><time>{new Date(log.created_at).toLocaleDateString('ar-SA')}</time></div>)}</div> : <EmptyState text="لا توجد عمليات مسجلة بعد" />}</section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">الحسابات</span><h3>أحدث المستخدمين</h3></div><button onClick={() => onSection('users')}>كل المستخدمين <ChevronLeft size={16} /></button></div><div className="admin-mini-users">{users.slice(0, 5).map((user) => <div className="admin-mini-user" key={user.id}><span className="admin-user-avatar">{user.username.charAt(0)}</span><div><b>{user.username}</b><small>{user.email}</small></div><span className={`role-pill ${user.role}`}>{user.role === 'super_admin' ? 'مدير عام' : user.role === 'admin' ? 'مشرف' : user.role}</span></div>)}</div></section>
    </div>
    <section className="admin-quick-actions"><h3>الوصول السريع</h3><div>{quick.map(({ label, icon: Icon, section }) => <button onClick={() => onSection(section)} key={label}><Icon size={20} /><span>{label}</span><ChevronLeft size={15} /></button>)}</div></section>
  </div>;
}

function UsersSection({ users, query, setQuery, isSuper, onRoleChanged }: { users: Profile[]; query: string; setQuery: (value: string) => void; isSuper: boolean; onRoleChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleMsg, setRoleMsg] = useState('');

  // الخاصية: السوبر أدمن فقط يرقّي أي مشترك إلى «مشرف» (صلاحيات: المباريات + المتجر).
  const changeRole = async (target: Profile, nextRole: 'admin' | 'user') => {
    if (busyId) return;
    setBusyId(target.id);
    setRoleMsg('');
    const { data, error } = await supabase.rpc('set_user_role', { p_target_id: target.id, p_new_role: nextRole });
    setBusyId(null);
    if (error || !data || (data as { ok?: boolean; error?: string }).error) {
      setRoleMsg('تعذر تعديل الدور — تأكد أن حسابك هو السوبر أدمن.');
      return;
    }
    setRoleMsg(nextRole === 'admin' ? `تمت ترقية ${target.username} إلى مشرف ✓` : `تمت إزالة صلاحية المشرف من ${target.username} ✓`);
    onRoleChanged();
  };

  return <div className="admin-content">
    <div className="admin-section-intro">
      <div>
        <span className="eyebrow">إدارة الحسابات والأدوار</span>
        <h2>المستخدمون والأدوار</h2>
        {isSuper ? <p>يمكنك ترقية أي مشترك إلى «مشرف» (يدير مباريات اليوم والمتجر)، أو إزالة الصلاحية — دون أي مساس بحساب السوبر أدمن.</p> : <p>عرض الحسابات فقط — ترقية الأدوار من اختصاص السوبر أدمن.</p>}
      </div>
      <span className="admin-count">{users.length} حساب</span>
    </div>
    <label className="admin-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو البريد أو الدولة" /></label>
    <section className="admin-panel admin-table-panel">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>المستخدم</th><th>الدولة</th><th>الدور</th><th>النقاط</th><th>البمبات</th>{isSuper && <th>الصلاحيات</th>}</tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td><div className="admin-table-user"><span className="admin-user-avatar">{user.username.charAt(0)}</span><span><b>{user.username}</b><small>{user.email}</small></span></div></td>
              <td>{user.country}</td>
              <td><span className={`role-pill ${user.role}`}>{user.role === 'super_admin' ? 'مدير عام' : user.role === 'admin' ? 'مشرف' : user.role}</span></td>
              <td>{user.user_points.toLocaleString()}</td>
              <td>{user.bamba_balance.toLocaleString()}</td>
              {isSuper && (
                <td>
                  {user.role === 'super_admin' ? (
                    <span className="role-lock"><LockKeyhole size={13} /> غير قابل للتعديل</span>
                  ) : (
                    <button
                      className={`role-action ${user.role === 'admin' ? 'remove' : ''}`}
                      disabled={busyId === user.id}
                      onClick={() => void changeRole(user, user.role === 'admin' ? 'user' : 'admin')}
                      data-testid={`role-action-${user.id}`}
                    >
                      {busyId === user.id ? <Loader2 size={13} className="spin" /> : user.role === 'admin' ? <><Ban size={13} /> إزالة الصلاحية</> : <><ShieldCheck size={13} /> جعله مشرفاً</>}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {users.length === 0 && <EmptyState text="لا توجد نتائج مطابقة" />}
      {roleMsg && <div className="admin-approve-msg"><CheckCircle2 size={16} /> {roleMsg}</div>}
    </section>
  </div>;
}

function AdminPlaceholder({ section }: { section: string }) {
  return <div className="admin-content"><div className="admin-placeholder"><BookOpen size={34} /><span className="eyebrow">وحدة الإدارة</span><h2>{section}</h2><p>هذه الوحدة جاهزة ضمن هيكل لوحة الإدارة، وسيتم ربطها ببياناتها وصلاحياتها قبل تفعيل عمليات التعديل الحساسة.</p><span className="coming-soon">قيد التجهيز الآمن</span></div></div>;
}

// ====== إدارة المباريات — إنشاء مباريات اليوم + اعتماد النتيجة واحتساب النقاط ======
const CREATE_LEAGUES = ['الدوري الإنجليزي', 'الدوري الإسباني', 'الدوري الإيطالي', 'الدوري الألماني', 'الدوري الفرنسي', 'دوري أبطال أوروبا', 'الدوري الأوروبي', 'دوري روشن السعودي'];

function MatchesSection() {
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [scores, setScores] = useState<Record<number, { home: number; away: number; isFixture: boolean }>>({});
  const [inputs, setInputs] = useState<Record<number, { home: string; away: string; fixture: boolean }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ league: CREATE_LEAGUES[0], home: '', away: '', homeShort: '', awayShort: '', time: '21:00', points: '3', featured: false });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  const refreshMatches = async () => {
    const all = await loadAllMatches();
    setAllMatches(all);
    setMatchesLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await refreshMatches();
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
    if (Number.isNaN(home) || Number.isNaN(away) || home < 0 || away < 0) {
      setMsg('أدخل نتيجة صحيحة (أرقام غير سالبة)');
      return;
    }
    setBusyId(id);
    setMsg('');
    const { data, error } = await supabase.rpc('score_match_points', {
      p_match_id: id,
      p_home: home,
      p_away: away,
      p_is_fixture: inp.fixture,
    });
    setBusyId(null);
    if (error) {
      setMsg(`فشل الاعتماد: ${error.message}`);
      return;
    }
    setScores((s) => ({ ...s, [id]: { home, away, isFixture: inp.fixture } }));
    const res = data as { scored_predictions: number; points_awarded: number; arena_scored?: number; arena_points_awarded?: number } | null;
    setMsg(
      res
        ? `تم اعتماد نتيجة المباراة #${id}: ${res.scored_predictions} توقع عام (${res.points_awarded} نقطة) + ${res.arena_scored ?? 0} توقع داخل الحلبات (${res.arena_points_awarded ?? 0} نقطة حُلبات).`
        : 'تم اعتماد النتيجة تلقائياً.',
    );
  };

  const createTodayMatch = async () => {
    if (!form.home.trim() || !form.away.trim()) {
      setCreateMsg('أدخل اسمي الفريقين أولاً');
      return;
    }
    setCreating(true);
    setCreateMsg('');
    const { data, error } = await supabase.rpc('admin_create_match', {
      p_league: form.league,
      p_home: form.home.trim(),
      p_away: form.away.trim(),
      p_home_short: form.homeShort.trim(),
      p_away_short: form.awayShort.trim(),
      p_time: form.time,
      p_points: Number(form.points) || 3,
      p_featured: form.featured,
    });
    setCreating(false);
    if (error || !data || (data as { error?: string }).error) {
      setCreateMsg(`تعذر إنشاء المباراة: ${error?.message ?? 'لا تملك صلاحية المشرف'}`);
      return;
    }
    setShowCreate(false);
    setForm({ league: CREATE_LEAGUES[0], home: '', away: '', homeShort: '', awayShort: '', time: '21:00', points: '3', featured: false });
    await refreshMatches();
    setCreateMsg('تمت إضافة المباراة وستظهر فوراً في صفحة توقعات الأعضاء وجميع حلباتهم ✓');
  };

  const deleteTodayMatch = async (id: number) => {
    if (!window.confirm('حذف هذه المباراة من قائمة مباريات اليوم؟')) return;
    const { error } = await supabase.rpc('admin_delete_match', { p_match_id: id });
    if (error) {
      setMsg(`تعذر الحذف: ${error.message}`);
      return;
    }
    await refreshMatches();
    setMsg('تم حذف المباراة من قائمة اليوم.');
  };

  return (
    <div className="admin-content">
      <div className="admin-section-intro">
        <div><span className="eyebrow">إدارة المباريات</span><h2>مباريات اليوم والنقاط</h2><p>أنشئ مباريات اليوم (تظهر فوراً لكل الأعضاء والحلبات)، وعند اعتماد النتيجة تُحتسب نقاط التوقعات العامة ونقاط الحلبات معاً تلقائياً.</p></div>
        <button className="admin-create-btn" onClick={() => setShowCreate(true)}><Plus size={17} /> إنشاء مباراة اليوم</button>
      </div>

      {createMsg && <div className="admin-approve-msg"><CheckCircle2 size={16} /> {createMsg}</div>}

      {showCreate && (
        <section className="admin-panel admin-create-match">
          <div className="admin-panel-heading"><div><span className="eyebrow">مباراة جديدة</span><h3>مباراة توقعات لهذا اليوم</h3></div><button className="modal-close" onClick={() => setShowCreate(false)}><X size={17} /></button></div>
          <div className="admin-create-grid">
            <label>البطولة<select value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })}>{CREATE_LEAGUES.map((l) => <option key={l}>{l}</option>)}</select></label>
            <label>الفريق المضيف *<input value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} placeholder="مثال: ريال مدريد" /></label>
            <label>الفريق الضيف *<input value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} placeholder="مثال: برشلونة" /></label>
            <label>اختصار المضيف<input value={form.homeShort} onChange={(e) => setForm({ ...form, homeShort: e.target.value })} placeholder="مثال: ر م" maxLength={3} /></label>
            <label>اختصار الضيف<input value={form.awayShort} onChange={(e) => setForm({ ...form, awayShort: e.target.value })} placeholder="مثال: ب" maxLength={3} /></label>
            <label>موعد المباراة<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
            <label>نقاط التوقع<input type="number" min={1} max={10} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
            <label className="admin-create-fixture"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> مباراة نارية (5 نقاط للنتيجة الصحيحة)</label>
          </div>
          <button className="admin-approve-btn" disabled={creating} onClick={() => void createTodayMatch()}>
            {creating ? <><Loader2 size={16} className="spin" /> جاري الإضافة...</> : <><Plus size={16} /> إضافة المباراة لليوم</>}
          </button>
        </section>
      )}

      <div className="admin-section-intro admin-sub-intro"><span className="eyebrow">اعتماد النتائج</span><h3>احتساب نقاط المباريات</h3><p>نتيجة صحيحة 3 نقاط (نارية 5) • فائز صحيح 1 (نارية 2) • النتيجة النادرة +1 — يُطبَّق على التوقعات العامة ونقاط الحلبات.</p></div>

      {matchesLoading ? (
        <div className="admin-loading"><Loader2 size={22} className="spin" /><p>جاري تحميل مباريات اليوم...</p></div>
      ) : allMatches.length === 0 ? (
        <EmptyState text="لا توجد مباريات — أنشئ مباراة اليوم من الزر أعلاه" />
      ) : (
        allMatches.map((m) => {
          const isScored = Boolean(scores[m.id]);
          const isDynamic = m.id >= 1000;
          const inp = inputs[m.id] ?? { home: '', away: '', fixture: Boolean(m.featured) };
          return (
            <section className="admin-panel admin-match-approve" key={m.id}>
              <div className="admin-match-title">
                <div className="admin-match-teams"><b>{m.home}</b><span>ضد</span><b>{m.away}</b></div>
                <div className="admin-match-meta-row">
                  <span className="admin-match-meta">{m.league} · {m.time} {m.featured ? '· 🔥 نارية' : ''}</span>
                  {isDynamic && <span className="admin-dynamic-tag">مباراة اليوم (أضافها مشرف)</span>}
                  {isDynamic && (
                    <button className="admin-remove-match" onClick={() => void deleteTodayMatch(m.id)} title="حذف المباراة"><Trash2 size={14} /> حذف</button>
                  )}
                </div>
              </div>
              <div className="admin-score-inputs">
                <label>أهداف {m.homeShort}<input type="number" min={0} max={99} value={isScored ? String(scores[m.id].home) : inp.home}
                  onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, home: e.target.value } })} disabled={busyId === m.id} /></label>
                <span>-</span>
                <label>أهداف {m.awayShort}<input type="number" min={0} max={99} value={isScored ? String(scores[m.id].away) : inp.away}
                  onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, away: e.target.value } })} disabled={busyId === m.id} /></label>
                <label className="admin-fixture"><input type="checkbox" checked={isScored ? scores[m.id].isFixture : inp.fixture}
                  onChange={(e) => setInputs({ ...inputs, [m.id]: { ...inp, fixture: e.target.checked } })} disabled={busyId === m.id} /> مباراة نارية</label>
              </div>
              <button className="admin-approve-btn" onClick={() => void approve(m.id)} disabled={busyId === m.id}>
                {busyId === m.id ? <><Loader2 size={16} className="spin" /> جاري الاحتساب...</> : isScored ? <><CheckCircle2 size={16} /> إعادة الاعتماد بنتيجة جديدة</> : <><Trophy size={16} /> اعتماد النتيجة وحساب النقاط</>}
              </button>
            </section>
          );
        })
      )}
      {msg && <div className="admin-approve-msg"><CheckCircle2 size={16} /> {msg}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="admin-empty"><Activity size={22} /><span>{text}</span></div>;
}