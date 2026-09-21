import { useEffect, useMemo, useState } from 'react';
import { CircleHelp, ListOrdered, Loader2, Search, Share2, Star, Trophy, WalletCards, Check } from 'lucide-react';
import { supabase, avatarUrl } from './lib/supabase';
import { PageHeading } from './components';

type LeaderRow = {
  username: string;
  user_points: number;
  bamba_balance: number;
  country: string | null;
  avatar_url: string | null;
  role: string;
};

const SHARE_URL = 'https://bomba-app-second.vercel.app';
const inviteText = (name: string) =>
  `⚽ توقّع معي نتائج المباريات في بمبا! انضم من الرابط: ${SHARE_URL}`;

export function RankingPage() {
  const [mainTab, setMainTab] = useState<'general' | 'league' | 'winners' | 'millionaires'>('general');
  const [period, setPeriod] = useState('الموسم');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);

  // الترتيب الحقيقي من قاعدة البيانات — الأعضاء الفعليون فقط
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('username, user_points, bamba_balance, country, avatar_url, role')
        .order('user_points', { ascending: false });
      if (!mounted) return;
      if (error) {
        setLoadError('تعذر تحميل الترتيب. تحقق من الاتصال وحاول مجدداً.');
      } else {
        setRows((data ?? []) as LeaderRow[]);
      }
      setLoading(false);
      const { data: me } = await supabase.auth.getUser();
      if (!mounted || !me?.user) return;
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', me.user.id)
        .maybeSingle();
      if (mounted && myProfile) setMyName((myProfile as { username: string }).username);
    })();
    return () => { mounted = false; };
  }, []);

  // حسابات الإدارة أدوار إشرافية ولا تنافس في الترتيب
  const players = useMemo(
    () => rows.filter((r) => r.role !== 'admin' && r.role !== 'super_admin'),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? players.filter((u) => u.username.toLowerCase().includes(q)) : players;
  }, [players, search]);

  // مشاركة نتيجة المستخدم أو دعوة لتحدّي عضو آخر — Web Share مع بديل النسخ
  const shareRank = async (text: string, id?: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'توقعات بمبا', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      // ألغى المستخدم المشاركة — لا رسالة خطأ
    }
  };

  const handleTopShare = () => {
    const rankIdx = myName ? players.findIndex((r) => r.username === myName) : -1;
    const pos = rankIdx >= 0 ? rankIdx + 1 : null;
    const myRow = rankIdx >= 0 ? players[rankIdx] : undefined;
    const text = pos && myRow
      ? `⚽ أنا في المركز #${pos} بـ ${myRow.user_points} نقطة في ترتيب بمبا للموسم! تحدّاني: ${SHARE_URL}`
      : inviteText('أصدقائي');
    void shareRank(text, 'top');
  };

  const periodTabs = (
    <div className="period-tabs">
      {['الأسبوع', 'الشهر', 'الموسم'].map((p) => (
        <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
      ))}
    </div>
  );

  const noResults = filtered.length === 0 && !loading && (
    <div className="no-results" data-testid="ranking-no-results">لا توجد نتائج مطابقة لبحثك</div>
  );

  const renderRows = (list: LeaderRow[], withCountry = true) => (
    <div className="ranking-list">
      {list.map((u, i) => (
        <div className="ranking-row" key={u.username + i}>
          <b>{i + 1}</b>
          {u.avatar_url ? (
            <img className="tiny-avatar-img" src={avatarUrl(u.avatar_url) ?? ''} alt={u.username} />
          ) : (
            <span className="tiny-avatar">{u.username.slice(0, 1)}</span>
          )}
          <strong>{u.username}</strong>
          {withCountry && <span className="rank-country">{u.country ?? '—'}</span>}
          <span className="rank-points">{u.user_points.toLocaleString()} <small>نقطة</small></span>
          <button
            className="rank-share-btn"
            onClick={() => void shareRank(`⚽ ${u.username} بـ ${u.user_points} نقطة في ترتيب بمبا! انضم وتحدّاه: ${SHARE_URL}`, `${u.username}-${i}`)}
            aria-label={`مشاركة ${u.username}`}
            title="مشاركة"
          >
            {copiedId === `${u.username}-${i}` ? <Check size={14} /> : <Share2 size={14} />}
          </button>
        </div>
      ))}
      {noResults}
    </div>
  );

  return (
    <div className="page ranking-page">
      <PageHeading
        eyebrow="نافس الأفضل"
        title="الترتيب"
        action={<button className="outline-button" onClick={handleTopShare}><Share2 size={16} /> مشاركة نتيجتي</button>}
      />
      <div className="search-bar">
        <Search size={18} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن اسمك في مراكز الترتيب..." data-testid="ranking-search" />
      </div>
      <div className="ranking-tabs">
        <button className={mainTab === 'general' ? 'active' : ''} onClick={() => setMainTab('general')}><Trophy size={15} /> الترتيب العام</button>
        <button className={mainTab === 'league' ? 'active' : ''} onClick={() => setMainTab('league')}><ListOrdered size={15} /> حسب البطولة</button>
        <button className={mainTab === 'winners' ? 'active' : ''} onClick={() => setMainTab('winners')}><Star size={15} /> قائمة الفائزين</button>
        <button className={mainTab === 'millionaires' ? 'active' : ''} onClick={() => setMainTab('millionaires')}><WalletCards size={15} /> مليونيرات بمبا</button>
      </div>

      {loading && (
        <div className="ranking-loading"><Loader2 size={20} className="spin" /> جاري تحميل الترتيب...</div>
      )}
      {loadError && !loading && <div className="ranking-error">{loadError}</div>}

      {!loading && !loadError && mainTab === 'general' && (
        <>
          {periodTabs}
          <div className="ranking-podium">
            <Podium rank={2} row={players[1]} color="silver" />
            <Podium rank={1} row={players[0]} color="gold" />
            <Podium rank={3} row={players[2]} color="bronze" />
          </div>
          {renderRows(filtered.slice(3))}
          <PointsInfo />
        </>
      )}

      {!loading && !loadError && mainTab === 'league' && (
        <>
          {periodTabs}
          <p className="league-note">الترتيب موحّد على مستوى كل البطولات بنقاط الموسم — تعرّف على منافسيك في جميع الدوريات.</p>
          {renderRows(filtered)}
        </>
      )}

      {mainTab === 'winners' && (
        <div className="winners-empty" data-testid="winners-empty">
          <Trophy size={40} />
          <h3>تُعلن قائمة الفائزين قريباً</h3>
          <p>يُعلن عن الفائزين تلقائياً بعد اعتماد نتائج المباريات ونهاية كل أسبوع وشهر — تابع الصفحة لمعرفة الجوائز.</p>
        </div>
      )}

      {!loading && !loadError && mainTab === 'millionaires' && (
        <>
          <div className="millionaires-banner">
            <h3>ترتيب مليونيرات بمبا</h3>
            <p>أعضاء حققوا أعلى أرصدة من عملات بمبا <small>(عمولات بمبا)</small></p>
          </div>
          <div className="ranking-list">
            {[...filtered].sort((a, b) => b.bamba_balance - a.bamba_balance).map((u, i) => (
              <div className="ranking-row" key={u.username + i}>
                <b>{i + 1}</b>
                {u.avatar_url ? (
                  <img className="tiny-avatar-img" src={avatarUrl(u.avatar_url) ?? ''} alt={u.username} />
                ) : (
                  <span className="tiny-avatar">{u.username.slice(0, 1)}</span>
                )}
                <strong>{u.username}</strong>
                <span className="rank-bamba">{u.bamba_balance.toLocaleString()} <small>بمبة</small></span>
              </div>
            ))}
            {noResults}
          </div>
        </>
      )}
    </div>
  );
}

function Podium({ rank, row, color }: { rank: number; row?: LeaderRow; color: string }) {
  return (
    <div className={`podium-card ${color}`}>
      <span className="podium-rank">{rank}</span>
      {row ? (
        <>
          {row.avatar_url ? (
            <img className="podium-avatar-img" src={avatarUrl(row.avatar_url) ?? ''} alt={row.username} />
          ) : (
            <span className="podium-avatar">{row.username.slice(0, 1)}</span>
          )}
          <b>{row.username}</b>
          <strong>{row.user_points.toLocaleString()}</strong>
          <small>نقطة</small>
        </>
      ) : (
        <span className="podium-empty">—</span>
      )}
    </div>
  );
}

function PointsInfo() {
  return (
    <div className="points-info">
      <div><CircleHelp size={20} /><b>آلية احتساب النقاط</b></div>
      <div className="points-rules">
        <div className="rule-row"><span>توقع صحيح بالنتيجة (الأهداف)</span><b>3 نقاط</b></div>
        <div className="rule-row"><span>توقع صحيح للفائز/التعادل بدون أهداف</span><b>1 نقطة</b></div>
        <div className="rule-row featured"><span>مباراة نارية - توقع صحيح بالنتيجة</span><b>5 نقاط</b></div>
        <div className="rule-row featured"><span>مباراة نارية - توقع صحيح للفائز</span><b>2 نقطة</b></div>
        <div className="rule-row"><span>توقع صحيح بالنتيجة ونسبة المتوقعين أقل من 10%</span><b>4 نقاط</b></div>
        <div className="rule-row featured"><span>مباراة نارية ونسبة المتوقعين أقل من 10%</span><b>6 نقاط</b></div>
      </div>
    </div>
  );
}