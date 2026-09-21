import { useState, useEffect, useRef } from 'react';
import { CircleDot, Loader2, Lock } from 'lucide-react';
import type { Tab, AuthStep, Page, Match } from './types';
import { TopBar, BottomNav, PredictionModal, BrandLogo } from './components';
import { LanguageStep, LoginStep, SignupStep } from './auth';
import { MatchesPage, MatchDetailsPage } from './matches';
import { LeaguesPage, LeagueDetailsPage } from './leagues';
import { RankingPage } from './ranking';
import { ChallengesHub, ChallengeArenaPage, ChallengeQuizPage, ChallengeChampionsPage, ChallengeStorePage } from './challenges';
import { CoachPage } from './coach';
import { ProfilePage } from './profile';
import { SettingsPage } from './settings';
import { AdminPage } from './admin';
import { LanguageModal, CompetitionInfoModal, FollowUsModal, UsageDataModal } from './info';
import { EarnPage } from './earn';
import { supabase, supabaseConfigured } from './lib/supabase';
import { upsertPrediction, fetchPredictions } from './lib/scoring';
import { QuizEarnPage } from './earn-quiz';
import type { Profile } from './lib/supabase';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'session_error';

// مفتاحات الحفظ — localStorage (وليس sessionStorage) حتى يبقى المستخدم في نفس
// الصفحة بعد تحديث الصفحة أو إغلاق المتصفح، بدون إعادته للصفحة الأولى بلا سبب.
const PAGE_KEY = 'bamba-current-page';
const TAB_KEY = 'bamba-current-tab';
const GUEST_KEY = 'bamba-guest';
const LANG_KEY = 'bamba-language';
const NOTIF_KEY = 'bamba-notifications';

const readSavedPage = (): Page => {
  if (typeof window === 'undefined') return 'main';
  const savedPage = window.localStorage.getItem(PAGE_KEY);
  const allowedPages: Page[] = ['main', 'matchDetails', 'leagueDetails', 'profile', 'store', 'coach', 'challengeArena', 'challengeQuiz', 'challengeChampions', 'challengeCoach', 'challengeStore', 'settings', 'admin', 'earn', 'earnQuiz'];
  return savedPage && allowedPages.includes(savedPage as Page) ? savedPage as Page : 'main';
};

// خطوة المصادقة الافتراضية: 01 اختيار اللغة إن لم تُحفظ لغة بعد، وإلا 02 الدخول
const defaultAuthStep = (): AuthStep => {
  if (typeof window !== 'undefined' && !window.localStorage.getItem(LANG_KEY)) return 'language';
  return 'login';
};

// Splash موحّد بشعار BMBA الرسمي — يظهر أثناء فحص الجلسة أو تحميل بيانات الحساب.
function Splash({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <main className={`auth-shell ${dark ? 'dark' : ''}`} dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 16 }} data-testid="splash-logo">
          <BrandLogo size="xl" />
        </div>
        <Loader2 size={28} className="spin" style={{ color: '#197b40' }} />
        <p style={{ color: '#197b40', marginTop: 12, fontWeight: 700, fontSize: 14 }}>{text}</p>
      </div>
    </main>
  );
}

function ProfileErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="auth-shell" dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="session-error-card">
        <CircleDot size={38} />
        <h2>تعذر تحميل بيانات الحساب</h2>
        <p>لم يتم تسجيل خروجك — حدثت مشكلة مؤقتة في الاتصال.</p>
        <button className="primary-button" onClick={onRetry} data-testid="profile-retry-button">إعادة المحاولة</button>
      </div>
    </main>
  );
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState('');
  // الترتيب: 01 اختيار اللغة → 02 تسجيل الدخول → 03 إنشاء الحساب.
  // شاشة اللغة تظهر لأول مرة فقط: إذا لم تُحفظ لغة من قبل نبدأ من الخطوة 01.
  const [authStep, setAuthStep] = useState<AuthStep>(defaultAuthStep);
  const [language, setLanguage] = useState<string>(() => (typeof window !== 'undefined' ? (window.localStorage.getItem(LANG_KEY) || '') : ''));
  const [tab, setTab] = useState<Tab>(() => typeof window !== 'undefined' && window.localStorage.getItem(TAB_KEY) === 'leagues' ? 'leagues' : 'matches');
  const [page, setPage] = useState<Page>(readSavedPage);
  const [guest, setGuest] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(GUEST_KEY) === '1');
  const [guestLock, setGuestLock] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showPrediction, setShowPrediction] = useState<Match | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showCompetitionInfo, setShowCompetitionInfo] = useState(false);
  const [showFollowUs, setShowFollowUs] = useState(false);
  const [showUsageData, setShowUsageData] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(NOTIF_KEY) === '1');
  const [toast, setToast] = useState('');
  const [predictions, setPredictions] = useState<Record<number, string>>({});
  const [darkMode, setDarkMode] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [bambaBalance, setBambaBalance] = useState(1320);
  const [userPoints, setUserPoints] = useState(427);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userPhone, setUserPhone] = useState('');

  const profileLoadedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // رسالة عابرة أسفل الشاشة لتأكيد الإجراءات (نسخ/تفعيل/مكافأة)
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // محمّل ملف الحساب على مستوى المكوّن — يجلب البيانات، وإن لم يوجد ملف
  // (حساب قديم أنشئ قبل تفعيل التأكيد التلقائي) يُنشئه تلقائياً من بيانات التسجيل.
  const ensureProfile = async (user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    if (profileLoadedRef.current.has(user.id)) return;
    profileLoadedRef.current.add(user.id);
    const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (!mountedRef.current) return;
    if (error) {
      profileLoadedRef.current.delete(user.id);
      setProfileError('تعذر تحميل بيانات الحساب. تحقق من الاتصال وحاول مجدداً.');
      return;
    }
    let profile = data as Profile | null;
    if (!profile) {
      const fallbackName = String(meta.username ?? user.email?.split('@')[0] ?? 'لاعب بمبا');
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username: fallbackName,
          email: user.email ?? '',
          role: 'user',
          bamba_balance: 100,
          user_points: 0,
          country: String(meta.country ?? 'السعودية'),
          phone: String(meta.phone ?? ''),
          gender: String(meta.gender ?? ''),
          dob: String(meta.dob ?? ''),
        })
        .select('*')
        .maybeSingle();
      if (!mountedRef.current) return;
      if (insertError || !created) {
        profileLoadedRef.current.delete(user.id);
        setProfileError('تعذر إنشاء ملف حسابك تلقائياً.');
        return;
      }
      profile = created as Profile;
    }
    setProfileError('');
    setUserProfile(profile);
    setBambaBalance(profile.bamba_balance);
    setUserPoints(profile.user_points);
    // كود دعوة لكل عضو (يُولّد ويُحفظ مرة واحدة إن لم يوجد)
    void ensureReferralCode(profile);
    // مزامنة توقعات العضو من قاعدة البيانات (إن وُجدت) مع التوقعات المحلية
    if (supabaseConfigured) {
      void (async () => {
        const saved = await fetchPredictions(profile.id);
        if (!mountedRef.current || saved.length === 0) return;
        setPredictions((prev) => {
          const next = { ...prev };
          for (const p of saved) next[p.match_id] = p.prediction_result;
          return next;
        });
      })();
    }
  };

  // تحديث حالة ملف الحساب محلياً بعد تعديل البروفايل (صورة/اسم/هاتف/دولة...)
  const updateProfileState = (next: Profile) => {
    setUserProfile(next);
    setBambaBalance(next.bamba_balance);
    setUserPoints(next.user_points);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PAGE_KEY, page);
      window.localStorage.setItem(TAB_KEY, tab);
    }
  }, [page, tab]);

  // يعكس اللغة المختارة على وسم الصفحة (إمكانية الوصول + أساس للترجمة مستقبلاً)
  useEffect(() => {
    if (language && typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    mountedRef.current = true;

    if (!supabaseConfigured) {
      setAuthState('unauthenticated');
      return () => {
        mountedRef.current = false;
      };
    }

    const initAuth = async () => {
      // فحص الجلسة مع إعادة محاولة تلقائية سريعة — أخطاء البداية غالباً اتصال مؤقت
      // وليست خروجاً حقيقياً، فلا يجب إخراج المستخدم قبل التأكد.
      let authResult = await supabase.auth.getSession();
      for (let attempt = 1; attempt < 3 && authResult.error; attempt++) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        authResult = await supabase.auth.getSession();
      }
      if (!mountedRef.current) return;

      const error = authResult.error;
      const session = authResult.data.session;
      void session;

      if (error) {
        setAuthError('تعذر فحص الجلسة بسبب اتصال مؤقت. لم يتم تسجيل خروجك.');
        setAuthState('session_error');
        return;
      }

      if (!session) {
        // وضع الضيف يبقى محفوظاً — تحديث الصفحة لا يعيد المستخدم لشاشة الدخول
        if (window.localStorage.getItem(GUEST_KEY) === '1') {
          setAuthState('authenticated');
          return;
        }
        setAuthState('unauthenticated');
        return;
      }

      setAuthState('authenticated');
      setUserPhone((session.user.user_metadata?.phone as string) ?? '');
      await ensureProfile(session.user);
    };

    void initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mountedRef.current) return;

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          window.localStorage.removeItem(GUEST_KEY);
          setGuest(false);
          setAuthError('');
          setAuthState('authenticated');
          setUserPhone((session.user.user_metadata?.phone as string) ?? '');
          window.setTimeout(() => { void ensureProfile(session.user); }, 0);
          return;
        }

        if (event === 'SIGNED_OUT') {
        // مهم جداً: ممنوع استدعاء أي دالة auth (مثل getSession) داخل هذا المستمع
        // مباشرة — مكتبة supabase تنتظر (await) انتهاء المستمعين بينما تمسك
        // القفل الداخلي، فأي استدعاء هنا يتسبب بمأزق (deadlock) يعلّق تسجيل
        // الخروج نهائياً. لذلك نؤجل الفحص خارج القفل عبر setTimeout.
        window.setTimeout(async () => {
          if (!mountedRef.current) return;
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          // أحياناً يصل "خروج" زائف عند تعارض تدوير التوكين بين تبويبات
          // بينما الجلسة ما زالت محفوظة وسليمة — في هذه الحالة نكمل دون إخراج.
          if (currentSession?.user) {
            window.localStorage.removeItem(GUEST_KEY);
            setGuest(false);
            setAuthState('authenticated');
            return;
          }
          // خروج حقيقي فقط: نمسح أثر الضيف ونرجع لشاشة الدخول
          window.localStorage.removeItem(GUEST_KEY);
          setGuest(false);
          profileLoadedRef.current.clear();
          setUserProfile(null);
          setAuthState('unauthenticated');
          setAuthStep(defaultAuthStep());
          setPage('main');
        }, 0);
        }
      });

      return () => {
        mountedRef.current = false;
        subscription.unsubscribe();
      };
  }, []);

  // حارس الجلسة الدائم: عند عودة التبويب للمقدمة أو عودة الاتصال نعيد قراءة
  // الجلسة من التخزين ونجدد التوكين إن قارب على الانتهاء. المتصفح يُبطئ
  // المؤقتات في الخلفية وعند قفل الشاشة، فمؤقت التجديد الداخلي يتأخر —
  // وهذا أشهر سبب لانتهاء الجلسة سريعاً في تطبيقات Supabase.
  useEffect(() => {
    if (!supabaseConfigured) return;

    const reviveSession = async () => {
      if (!mountedRef.current) return;
      const { data, error } = await supabase.auth.getSession();
      if (!mountedRef.current || error || !data.session?.user) return;

      if (window.localStorage.getItem(GUEST_KEY) === '1') {
        window.localStorage.removeItem(GUEST_KEY);
        setGuest(false);
      }
      setAuthState('authenticated');

      const secondsLeft = data.session.expires_at ? data.session.expires_at - Date.now() / 1000 : 0;
      if (secondsLeft < 60) {
        const refreshed = await supabase.auth.refreshSession();
        if (!mountedRef.current || refreshed.error) return;
        if (refreshed.data.session?.user) setAuthState('authenticated');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reviveSession();
    };
    const onFocus = () => void reviveSession();
    const onOnline = () => void reviveSession();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const handleLogout = async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
    window.localStorage.removeItem(GUEST_KEY);
    setGuest(false);
    profileLoadedRef.current.clear();
    setUserProfile(null);
    setUserPhone('');
    setAuthState('unauthenticated');
    setAuthStep(defaultAuthStep());
    setPage('main');
  };

  const enterGuest = () => {
    window.localStorage.setItem(GUEST_KEY, '1');
    setGuest(true);
    setAuthState('authenticated');
  };

  // اختيار اللغة (الخطوة 01) — يُحفظ الاختيار ويُنتقل لشاشة الدخول،
  // ولن تظهر شاشة اللغة مرة أخرى على هذا الجهاز.
  const chooseLanguage = (lang: 'ar' | 'en') => {
    window.localStorage.setItem(LANG_KEY, lang);
    setLanguage(lang);
    setAuthStep('login');
  };

  // اختيار اللغة من نافذة «لغة التطبيق» (القائمة / الإعدادات)
  const handleLanguageChoose = (lang: 'ar' | 'en') => {
    window.localStorage.setItem(LANG_KEY, lang);
    setLanguage(lang);
    setShowLanguage(false);
    setShowProfile(false);
    showToast(lang === 'ar' ? 'تم اختيار العربية' : 'English selected');
  };

  // تفعيل / إيقاف إشعارات المتصفح
  const toggleNotifications = async () => {
    if (notificationsOn) {
      window.localStorage.setItem(NOTIF_KEY, '0');
      setNotificationsOn(false);
      showToast('تم إيقاف الإشعارات');
      return;
    }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showToast('لم يُمنح إذن الإشعارات');
          return;
        }
      }
      window.localStorage.setItem(NOTIF_KEY, '1');
      setNotificationsOn(true);
      showToast('تم تفعيل الإشعارات');
    } catch {
      showToast('تعذر تفعيل الإشعارات');
    }
  };

  // مشاركة التطبيق — زر المشاركة الأصلي أو نسخ الرابط
  const shareApp = async () => {
    const url = 'https://bomba-app-second.vercel.app';
    const text = 'انضم إليّ في توقعات بمبا ⚽ — توقّع نتائج المباريات واربح الجوائز!';
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'توقعات بمبا', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('تم نسخ رابط التطبيق');
    } catch {
      // المستخدم ألغى المشاركة — لا نعرض رسالة خطأ
    }
  };

  // طلب مكافأة من قاعدة البيانات (بمفتاح يمنع التكرار) وتحديث الرصيد
  const claimReward = async (sourceType: string, sourceId: string, amount: number, idempotencyKey: string) => {
    if (!supabaseConfigured || !userProfile) {
      showToast('سجّل دخولك أولاً لتجميع البمبات');
      return false;
    }
    const { data, error } = await supabase.rpc('claim_reward', {
      p_source_type: sourceType,
      p_source_id: sourceId,
      p_amount: amount,
      p_idempotency_key: idempotencyKey,
    });
    if (error || !data) {
      showToast('تعذر تسجيل المكافأة. حاول مجدداً.');
      return false;
    }
    const res = data as { ok?: boolean; already?: boolean; amount?: number; balance?: number };
    if (typeof res.balance === 'number') setBambaBalance(res.balance);
    if (res.already) {
      showToast('حصلت على هذه المكافأة مسبقاً');
      return false;
    }
    if (res.ok) showToast(`أضفت +${res.amount} بمبة 🌟`);
    return Boolean(res.ok);
  };

  // مشاركة بكسب البمبات — تُمنح المكافأة فقط بعد مشاركة حقيقية (نجاح نافذة المشاركة)
  // أو نسخ فعلي للرابط. إلغاء النافذة أو فتحها والخروج بدون مشاركة = لا مكافأة.
  const shareAppForReward = async () => {
    const url = 'https://bomba-app-second.vercel.app';
    const text = 'انضم إليّ في توقعات بمبا ⚽ — توقّع نتائج المباريات واربح الجوائز!';
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'توقعات بمبا', text, url });
        // الوصول إلى هنا = تمت المشاركة فعلياً وليس إلغاءً
        await claimReward('share', today, 10, `share_${userProfile?.id ?? 'anon'}_${today}`);
        return;
      }
      // دون نافذة مشاركة: لا تُمنح مكافأة إلا بعد نسخ فعلي ناجح
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('تم نسخ رابط التطبيق — المشاركة تستحق مكافأتك');
      await claimReward('share', today, 10, `share_${userProfile?.id ?? 'anon'}_${today}`);
    } catch {
      // أُلغيت المشاركة أو فُتحت صفحة المشاركة دون إتمامها — لا مكافأة
      showToast('لم تتم المشاركة — أعد المحاولة أو أنشئ حساباً لمشاركة التطبيق');
    }
  };

  // إضافة مكافأة إلى رصيد البمبات (تحديث محلي فوري)

  // إنشاء كود دعوة فريد للعضو إن لم يكن له كود بعد (7 أحرف عشوائية)
  const ensureReferralCode = async (profile: Profile): Promise<Profile> => {
    if (profile.referral_code) return profile;
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += charset[Math.floor(Math.random() * charset.length)];
    }
    const finalCode = `BMBA-${code}`;
    const { data, error } = await supabase
      .from('profiles')
      .update({ referral_code: finalCode })
      .eq('id', profile.id)
      .select('*')
      .maybeSingle();
    if (!error && data) {
      const updated = data as Profile;
      setUserProfile(updated);
      return updated;
    }
    return profile;
  };

  // إتمام إنشاء الحساب — التأكيد التلقائي مفعّل فالجلسة موجودة،
  // نحمّل الملف الشخصي فوراً (أو ننشئه إن لم يُكتمل سابقاً).
  const handleSignupComplete = async (inviteCodeValue?: string) => {
    setAuthState('authenticated');
    setProfileError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUserPhone((session.user.user_metadata?.phone as string) ?? '');
      void ensureProfile(session.user);
      // تطبيق كود الدعوة (إن أُدخل عند التسجيل) → يحصل الداعي على 50 بمبة تلقائياً
      const cleaned = (inviteCodeValue ?? '').trim().toUpperCase();
      if (cleaned) {
        const { data: inviteData, error: inviteError } = await supabase.rpc('apply_invite', { p_referral_code: cleaned });
        if (!inviteError && inviteData) {
          const res = inviteData as { ok?: boolean; inviter?: string; error?: string };
          if (res.ok) showToast(`كود دعوة صالح — ${res.inviter} حصل على 50 بمبة 🎉`);
          else if (res.error === 'INVALID_CODE') showToast('كود الدعوة غير صحيح');
          else if (res.error === 'SELF_INVITE') showToast('لا يمكنك استخدام كودك الخاص');
        }
      }
    }
  };

  // كود دعوة فريد يعتمد على ملف الحساب (يُنشأ عند أول تحميل إن لم يوجد)
  const inviteCode = userProfile?.referral_code ? userProfile.referral_code
    : 'BMBA-' + (userProfile?.id ? userProfile.id.replace(/-/g, '').slice(0, 4).toUpperCase() : '4270');

  // الضيف يستطيع التصفح فقط — محاولة التوقع تُظهر نافذة توجّهه للتسجيل.
  const handlePredict = (m: Match) => {
    if (guest) {
      setGuestLock(true);
      return;
    }
    setShowPrediction(m);
  };

  // إنهاء وضع الضيف والانتقال لشاشة الدخول/إنشاء الحساب
  const guestToLogin = () => {
    window.localStorage.removeItem(GUEST_KEY);
    setGuest(false);
    setGuestLock(false);
    setProfileError('');
    setUserProfile(null);
    setUserPhone('');
    setAuthState('unauthenticated');
    setAuthStep(defaultAuthStep());
  };

  const retryProfile = async () => {
    if (!supabaseConfigured) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    profileLoadedRef.current.clear();
    setUserProfile(null);
    setProfileError('');
    await ensureProfile(session.user);
  };

  const savePrediction = (id: number, prediction: string) => {
    setPredictions((current) => ({ ...current, [id]: prediction }));
    setShowPrediction(null);
    // حفظ في قاعدة البيانات ليُحتسب من نقاط العضو تلقائياً عند اعتماد النتيجة
    if (userProfile && supabaseConfigured) {
      const [h, a] = prediction.split('-').map((n) => Number(n));
      if (!Number.isNaN(h) && !Number.isNaN(a)) {
        void upsertPrediction(userProfile.id, id, h, a);
      }
    }
  };

  const goHome = () => { setPage('main'); setTab('matches'); };
  const goMatchDetails = (m: Match) => { setSelectedMatch(m); setPage('matchDetails'); };
  const goLeagueDetails = (name: string) => { setSelectedLeague(name); setPage('leagueDetails'); };

  if (authState === 'loading') {
    return <Splash dark={darkMode} text="جاري فحص الجلسة..." />;
  }

  if (authState === 'session_error') {
    return (
      <main className={`auth-shell ${darkMode ? 'dark' : ''}`} dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="session-error-card">
          <CircleDot size={38} />
          <h2>تعذر فحص الجلسة</h2>
          <p>{authError}</p>
          <button className="primary-button" onClick={() => window.location.reload()} data-testid="session-retry-button">إعادة المحاولة</button>
        </div>
      </main>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <main className={`auth-shell ${darkMode ? 'dark' : ''}`} dir="rtl">
        <div className="auth-art">
          <div className="auth-top-glow" />
          <div data-testid="auth-brand-logo" style={{ position: 'relative', zIndex: 2 }}>
            <BrandLogo size="lg" />
          </div>
          <div className="auth-hero-ball"><CircleDot size={190} strokeWidth={1.2} /></div>
          <div className="auth-copy">
            <p className="eyebrow">منصة كرة القدم العربية</p>
            <h1>توقع، نافس،<br /><span>واربح مع بمبا</span></h1>
            <p>كل مباراة فرصة جديدة لتثبت خبرتك وتتصدر الترتيب.</p>
          </div>
          <div className="auth-shape shape-one" /><div className="auth-shape shape-two" />
        </div>
        <div className="auth-panel">
          {authStep === 'language' && <LanguageStep onChoose={chooseLanguage} />}
          {authStep === 'login' && <LoginStep onGuest={enterGuest} onSignup={() => setAuthStep('signup')} onLoginSuccess={() => setAuthState('authenticated')} />}
          {authStep === 'signup' && <SignupStep onComplete={(invite) => { void handleSignupComplete(invite); }} onBack={() => setAuthStep('login')} />}
        </div>
      </main>
    );
  }

  const isSubPage = page !== 'main';
  // ننتظر تحميل بيانات الحساب قبل عرض الصفحات المحمية — لا فراغات ولا رفض خاطئ أثناء الفحص
  const profilePending = !guest && !userProfile && !profileError;

  return (
    <div className={`app-shell ${darkMode ? 'dark' : ''}`} dir="rtl">
      <TopBar
        onProfile={() => setShowProfile((c) => !c)}
        onProfilePage={() => { setShowProfile(false); setPage('profile'); }}
        onRewards={() => setPage('earn')}
        onHome={goHome}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        showProfile={showProfile && !isSubPage}
        bambaBalance={bambaBalance}
        userPoints={userPoints}
        onSettings={() => { setShowProfile(false); setPage('settings'); }}
        onLogout={() => { setShowProfile(false); void handleLogout(); }}
        username={guest ? 'ضيف' : (userProfile?.username ?? 'لاعب بمبا')}
        language={language}
        notificationsOn={notificationsOn}
        onToggleNotifications={() => { void toggleNotifications(); }}
        onLanguage={() => { setShowProfile(false); setShowLanguage(true); }}
        onCompetitionInfo={() => { setShowProfile(false); setShowCompetitionInfo(true); }}
        onFollowUs={() => { setShowProfile(false); setShowFollowUs(true); }}
        onShare={() => { setShowProfile(false); void shareApp(); }}
        onUsageData={() => { setShowProfile(false); setShowUsageData(true); }}
      />

      <main className="content-area">
        {page === 'main' && tab === 'matches' && (
          <MatchesPage predictions={predictions} onPredict={handlePredict} onMatchClick={goMatchDetails} />
        )}
        {page === 'main' && tab === 'leagues' && <LeaguesPage onLeagueClick={goLeagueDetails} />}
        {page === 'main' && tab === 'ranking' && <RankingPage />}
        {page === 'main' && tab === 'challenges' && (
          <ChallengesHub onChallengeClick={(c) => setPage(c.page as Page)} onRewards={() => setPage('earn')} />
        )}

        {page === 'matchDetails' && selectedMatch && (
          <MatchDetailsPage match={selectedMatch} prediction={predictions[selectedMatch.id]} onPredict={handlePredict} onBack={() => setPage('main')} />
        )}
        {page === 'leagueDetails' && <LeagueDetailsPage league={selectedLeague} onBack={() => setPage('main')} />}
        {page === 'profile' && <ProfilePage onBack={() => setPage('main')} profile={userProfile} guest={guest} phone={userPhone || userProfile?.phone || ''} onProfileChange={updateProfileState} predictionsCount={Object.keys(predictions).length} />}
        {page === 'earn' && (
          <EarnPage
            onBack={() => setPage('main')}
            balance={bambaBalance}
            onGoQuiz={() => setPage('earnQuiz')}
            onGoChallenges={() => { setPage('main'); setTab('challenges'); }}
            onShare={() => { void shareAppForReward(); }}
            inviteCode={inviteCode}
          />
        )}
        {page === 'earnQuiz' && (
          <QuizEarnPage onBack={() => setPage('earn')} balance={bambaBalance} onBalanceChange={setBambaBalance} />
        )}
        {page === 'challengeArena' && <ChallengeArenaPage onBack={() => setPage('main')} onRewards={() => setPage('earn')} />}
        {page === 'challengeQuiz' && <ChallengeQuizPage onBack={() => setPage('main')} onReward={(amount) => { void claimReward('challenge', 'quiz', amount, `challenge_quiz_${userProfile?.id ?? 'guest'}`); }} />}
        {page === 'challengeChampions' && <ChallengeChampionsPage onBack={() => setPage('main')} onRewards={() => setPage('earn')} onClaimed={() => { void claimReward('challenge', 'champions', 25, `challenge_champions_${userProfile?.id ?? 'guest'}`); }} />}
        {page === 'challengeStore' && <ChallengeStorePage onBack={() => setPage('main')} onRewards={() => setPage('earn')} balance={bambaBalance} />}
        {page === 'challengeCoach' && <CoachPage onBack={() => setPage('main')} onRewards={() => setPage('earn')} />}
        {page === 'settings' && (
          <SettingsPage
            onBack={() => setPage('main')}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onLogout={handleLogout}
            username={userProfile?.username ?? (guest ? 'ضيف' : 'لاعب بمبا')}
            email={userProfile?.email ?? 'guest@bamba.app'}
            role={userProfile?.role ?? 'user'}
            avatarUrl={userProfile?.avatar_url ?? null}
            country={userProfile?.country ?? ''}
            phone={userPhone || userProfile?.phone || ''}
            onAdmin={() => setPage('admin')}
            onOpenProfile={() => setPage('profile')}
          />
        )}
        {page === 'admin' && profilePending && <Splash dark={darkMode} text="جاري فحص صلاحياتك..." />}
        {page === 'admin' && profileError && <ProfileErrorCard onRetry={() => { void retryProfile(); }} />}
        {page === 'admin' && !profilePending && !profileError && userProfile?.role !== 'super_admin' && (
          <div className="session-error-card"><h2>لا تملك صلاحية الوصول</h2><p>هذه الصفحة مخصصة للمدير العام فقط.</p><button className="primary-button" onClick={() => setPage('main')} data-testid="admin-denied-back-button">العودة للتطبيق</button></div>
        )}
        {page === 'admin' && userProfile?.role === 'super_admin' && (
          <AdminPage profile={userProfile} onBack={() => setPage('settings')} />
        )}
      </main>

      {!isSubPage && <BottomNav tab={tab} setTab={setTab} />}

      {showPrediction && <PredictionModal match={showPrediction} existing={predictions[showPrediction.id]} onClose={() => setShowPrediction(null)} onSave={savePrediction} />}
      {showLanguage && <LanguageModal onClose={() => setShowLanguage(false)} language={language} onChoose={handleLanguageChoose} />}
      {showCompetitionInfo && <CompetitionInfoModal onClose={() => setShowCompetitionInfo(false)} />}
      {showFollowUs && <FollowUsModal onClose={() => setShowFollowUs(false)} />}
      {showUsageData && <UsageDataModal onClose={() => setShowUsageData(false)} onLogout={() => { setShowUsageData(false); void handleLogout(); }} />}
      {toast && <div className="app-toast" data-testid="app-toast">{toast}</div>}

      {guestLock && (
        <div className="guest-lock-overlay" onClick={() => setGuestLock(false)} data-testid="guest-lock-overlay">
          <div className="guest-lock-card" onClick={(e) => e.stopPropagation()}>
            <Lock size={30} />
            <h3>التوقع متاح للمسجّلين فقط</h3>
            <p>الدخول كضيف يتيح لك تصفح المباريات والبطولات فقط. أنشئ حساباً أو سجّل دخولك لتوقع النتائج وكسب النقاط والجوائز.</p>
            <button className="primary-button" onClick={guestToLogin} data-testid="guest-lock-login-button">تسجيل الدخول / إنشاء حساب</button>
            <button className="text-button" onClick={() => setGuestLock(false)}>أكمل التصفح كضيف</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
