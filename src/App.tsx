import { useState, useEffect, useRef } from 'react';
import { CircleDot, Loader2 } from 'lucide-react';
import type { Tab, AuthStep, Page, Match } from './types';
import { TopBar, BottomNav, PredictionModal, RewardsModal, CalendarModal } from './components';
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

const readSavedPage = (): Page => {
  if (typeof window === 'undefined') return 'main';
  const savedPage = window.sessionStorage.getItem('bamba-current-page');
  const allowedPages: Page[] = ['main', 'matchDetails', 'leagueDetails', 'profile', 'store', 'coach', 'challengeArena', 'challengeQuiz', 'challengeChampions', 'challengeCoach', 'challengeStore', 'settings', 'admin'];
  return savedPage && allowedPages.includes(savedPage as Page) ? savedPage as Page : 'main';
};

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [authError, setAuthError] = useState('');
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [tab, setTab] = useState<Tab>(() => typeof window !== 'undefined' && window.sessionStorage.getItem('bamba-current-tab') === 'leagues' ? 'leagues' : 'matches');
  const [page, setPage] = useState<Page>(readSavedPage);
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('bamba-current-page', page);
      window.sessionStorage.setItem('bamba-current-tab', tab);
    }
  }, [page, tab]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (userId: string) => {
      if (profileLoadedRef.current.has(userId)) return;
      profileLoadedRef.current.add(userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        profileLoadedRef.current.delete(userId);
        return;
      }
      if (data) {
        setUserProfile(data as Profile);
        setBambaBalance(data.bamba_balance);
        setUserPoints(data.user_points);
      }
    };

    const initAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        setAuthError('تعذر فحص الجلسة بسبب اتصال مؤقت. لم يتم تسجيل خروجك.');
        setAuthState('session_error');
        return;
      }

      if (!session) {
        setAuthState('unauthenticated');
        return;
      }

      setAuthState('authenticated');
      await loadProfile(session.user.id);
    };

    void initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          setAuthError('');
          setAuthState('authenticated');
          window.setTimeout(() => { void loadProfile(session.user.id); }, 0);
          return;
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setAuthError('');
          setAuthState('authenticated');
          window.setTimeout(() => { void loadProfile(session.user.id); }, 0);
          return;
        }

        if (event === 'SIGNED_OUT') {
          profileLoadedRef.current.clear();
          setUserProfile(null);
          setAuthState('unauthenticated');
          setAuthStep('login');
          setPage('main');
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    profileLoadedRef.current.clear();
    setUserProfile(null);
    setAuthState('unauthenticated');
    setAuthStep('login');
    setPage('main');
  };

  const savePrediction = (id: number, prediction: string) => {
    setPredictions((current) => ({ ...current, [id]: prediction }));
    setShowPrediction(null);
  };

  const goHome = () => { setPage('main'); setTab('matches'); };
  const goMatchDetails = (m: Match) => { setSelectedMatch(m); setPage('matchDetails'); };
  const goLeagueDetails = (name: string) => { setSelectedLeague(name); setPage('leagueDetails'); };

  if (authState === 'loading') {
    return (
      <main className={`auth-shell ${darkMode ? 'dark' : ''}`} dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="brand-mark" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <div className="ball-mark"><CircleDot size={22} strokeWidth={2.4} /></div>
          </div>
          <Loader2 size={28} className="spin" style={{ color: '#197b40' }} />
          <p style={{ color: '#197b40', marginTop: 12, fontWeight: 700, fontSize: 14 }}>جاري فحص الجلسة...</p>
        </div>
      </main>
    );
  }

  if (authState === 'session_error') {
    return (
      <main className={`auth-shell ${darkMode ? 'dark' : ''}`} dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="session-error-card">
          <CircleDot size={38} />
          <h2>تعذر فحص الجلسة</h2>
          <p>{authError}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
        </div>
      </main>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <main className={`auth-shell ${darkMode ? 'dark' : ''}`} dir="rtl">
        <div className="auth-art">
          <div className="auth-top-glow" />
          <div className="brand-mark"><div className="ball-mark"><CircleDot size={22} strokeWidth={2.4} /></div><span>BMBA</span></div>
          <div className="auth-hero-ball"><CircleDot size={190} strokeWidth={1.2} /></div>
          <div className="auth-copy">
            <p className="eyebrow">منصة كرة القدم العربية</p>
            <h1>توقع، نافس،<br /><span>واربح مع بمبا</span></h1>
            <p>كل مباراة فرصة جديدة لتثبت خبرتك وتتصدر الترتيب.</p>
          </div>
          <div className="auth-shape shape-one" /><div className="auth-shape shape-two" />
        </div>
        <div className="auth-panel">
          {authStep === 'login' && <LoginStep onGuest={() => setAuthState('authenticated')} onSignup={() => setAuthStep('signup')} onLoginSuccess={() => setAuthState('authenticated')} />}
          {authStep === 'signup' && <SignupStep onComplete={() => setAuthState('authenticated')} onBack={() => setAuthStep('login')} />}
        </div>
      </main>
    );
  }

  const isSubPage = page !== 'main';

  return (
    <div className={`app-shell ${darkMode ? 'dark' : ''}`} dir="rtl">
      <TopBar
        onProfile={() => { setShowProfile((c) => !c); if (!isSubPage) setPage('profile'); }}
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
        {page === 'admin' && userProfile?.role === 'super_admin' && (
          <AdminPage profile={userProfile} onBack={() => setPage('settings')} />
        )}
        {page === 'admin' && userProfile && userProfile.role !== 'super_admin' && (
          <div className="session-error-card"><h2>لا تملك صلاحية الوصول</h2><p>هذه الصفحة مخصصة للمدير العام فقط.</p><button className="primary-button" onClick={() => setPage('main')}>العودة للتطبيق</button></div>
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
