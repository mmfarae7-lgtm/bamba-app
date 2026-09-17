import { useState, useEffect, useRef } from 'react';
import { CircleDot, Loader2 } from 'lucide-react';
import type { Tab, AuthStep, Page, Match } from './types';
import { TopBar, BottomNav, PredictionModal, RewardsModal, CalendarModal, BrandLogo } from './components';
import { LoginStep, SignupStep } from './auth';
import { MatchesPage, MatchDetailsPage } from './matches';
import { LeaguesPage, LeagueDetailsPage } from './leagues';
import { RankingPage } from './ranking';
import { ChallengesHub, ChallengeArenaPage, ChallengeQuizPage, ChallengeChampionsPage, ChallengeStorePage } from './challenges';
import { CoachPage } from './coach';
import { ProfilePage } from './profile';
import { SettingsPage } from './settings';
import { AdminPage } from './admin';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/supabase';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'session_error';

// مفتاحات الحفظ — localStorage (وليس sessionStorage) حتى يبقى المستخدم في نفس
// الصفحة بعد تحديث الصفحة أو إغلاق المتصفح، بدون إعادته للصفحة الأولى بلا سبب.
const PAGE_KEY = 'bamba-current-page';
const TAB_KEY = 'bamba-current-tab';
const GUEST_KEY = 'bamba-guest';

const readSavedPage = (): Page => {
  if (typeof window === 'undefined') return 'main';
  const savedPage = window.localStorage.getItem(PAGE_KEY);
  const allowedPages: Page[] = ['main', 'matchDetails', 'leagueDetails', 'profile', 'store', 'coach', 'challengeArena', 'challengeQuiz', 'challengeChampions', 'challengeCoach', 'challengeStore', 'settings', 'admin'];
  return savedPage && allowedPages.includes(savedPage as Page) ? savedPage as Page : 'main';
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
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [tab, setTab] = useState<Tab>(() => typeof window !== 'undefined' && window.localStorage.getItem(TAB_KEY) === 'leagues' ? 'leagues' : 'matches');
  const [page, setPage] = useState<Page>(readSavedPage);
  const [guest, setGuest] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem(GUEST_KEY) === '1');
  const [profileError, setProfileError] = useState('');
  const [showPrediction, setShowPrediction] = useState<Match | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [predictions, setPredictions] = useState<Record<number, string>>({});
  const [darkMode, setDarkMode] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [bambaBalance, setBambaBalance] = useState(1320);
  const [userPoints, setUserPoints] = useState(427);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  const profileLoadedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // محمّل بيانات الحساب على مستوى المكوّن — يستخدمه فحص الجلسة الأول وإعادة المحاولة
  const loadProfile = async (userId: string) => {
    if (profileLoadedRef.current.has(userId)) return;
    profileLoadedRef.current.add(userId);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!mountedRef.current) return;
    if (error || !data) {
      profileLoadedRef.current.delete(userId);
      setProfileError('تعذر تحميل بيانات الحساب. تحقق من الاتصال وحاول مجدداً.');
      return;
    }
    setProfileError('');
    setUserProfile(data as Profile);
    setBambaBalance(data.bamba_balance);
    setUserPoints(data.user_points);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PAGE_KEY, page);
      window.localStorage.setItem(TAB_KEY, tab);
    }
  }, [page, tab]);

  useEffect(() => {
    mountedRef.current = true;

    const initAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!mountedRef.current) return;

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
      await loadProfile(session.user.id);
    };

    void initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mountedRef.current) return;

        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          window.localStorage.removeItem(GUEST_KEY);
          setGuest(false);
          setAuthError('');
          setAuthState('authenticated');
          window.setTimeout(() => { void loadProfile(session.user.id); }, 0);
          return;
        }

        if (event === 'SIGNED_OUT') {
          // خروج حقيقي فقط: نمسح أثر الضيف ونرجع لشاشة الدخول
          window.localStorage.removeItem(GUEST_KEY);
          setGuest(false);
          profileLoadedRef.current.clear();
          setUserProfile(null);
          setAuthState('unauthenticated');
          setAuthStep('login');
          setPage('main');
        }
      });

      return () => {
        mountedRef.current = false;
        subscription.unsubscribe();
      };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.localStorage.removeItem(GUEST_KEY);
    setGuest(false);
    profileLoadedRef.current.clear();
    setUserProfile(null);
    setAuthState('unauthenticated');
    setAuthStep('login');
    setPage('main');
  };

  const enterGuest = () => {
    window.localStorage.setItem(GUEST_KEY, '1');
    setGuest(true);
    setAuthState('authenticated');
  };

  const retryProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    profileLoadedRef.current.clear();
    setUserProfile(null);
    setProfileError('');
    await loadProfile(session.user.id);
  };

  const savePrediction = (id: number, prediction: string) => {
    setPredictions((current) => ({ ...current, [id]: prediction }));
    setShowPrediction(null);
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
          {authStep === 'login' && <LoginStep onGuest={enterGuest} onSignup={() => setAuthStep('signup')} onLoginSuccess={() => setAuthState('authenticated')} />}
          {authStep === 'signup' && <SignupStep onComplete={() => setAuthState('authenticated')} onBack={() => setAuthStep('login')} />}
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
        onRewards={() => setShowRewards(true)}
        onHome={goHome}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        showProfile={showProfile && !isSubPage}
        bambaBalance={bambaBalance}
        userPoints={userPoints}
        onSettings={() => { setShowProfile(false); setPage('settings'); }}
      />

      <main className="content-area">
        {page === 'main' && tab === 'matches' && (
          <MatchesPage predictions={predictions} onPredict={setShowPrediction} onCalendar={() => setShowCalendar(true)} onMatchClick={goMatchDetails} />
        )}
        {page === 'main' && tab === 'leagues' && <LeaguesPage onLeagueClick={goLeagueDetails} />}
        {page === 'main' && tab === 'ranking' && <RankingPage />}
        {page === 'main' && tab === 'challenges' && (
          <ChallengesHub onChallengeClick={(c) => setPage(c.page as Page)} onRewards={() => setShowRewards(true)} />
        )}

        {page === 'matchDetails' && selectedMatch && (
          <MatchDetailsPage match={selectedMatch} prediction={predictions[selectedMatch.id]} onPredict={setShowPrediction} onBack={() => setPage('main')} />
        )}
        {page === 'leagueDetails' && <LeagueDetailsPage league={selectedLeague} onBack={() => setPage('main')} />}
        {page === 'profile' && <ProfilePage onBack={() => setPage('main')} />}
        {page === 'challengeArena' && <ChallengeArenaPage onBack={() => setPage('main')} onRewards={() => setShowRewards(true)} />}
        {page === 'challengeQuiz' && <ChallengeQuizPage onBack={() => setPage('main')} onReward={() => { setBambaBalance((b) => b + 100); setShowRewards(true); }} />}
        {page === 'challengeChampions' && <ChallengeChampionsPage onBack={() => setPage('main')} />}
        {page === 'challengeStore' && <ChallengeStorePage onBack={() => setPage('main')} />}
        {page === 'challengeCoach' && <CoachPage onBack={() => setPage('main')} />}
        {page === 'settings' && (
          <SettingsPage
            onBack={() => setPage('main')}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onLogout={handleLogout}
            username={userProfile?.username ?? 'ضيف'}
            email={userProfile?.email ?? 'guest@bamba.app'}
            role={userProfile?.role ?? 'user'}
            onAdmin={() => setPage('admin')}
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
      {showRewards && <RewardsModal onClose={() => setShowRewards(false)} balance={bambaBalance} />}
      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
    </div>
  );
}

export default App;
