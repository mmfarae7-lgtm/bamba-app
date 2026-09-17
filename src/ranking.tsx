import { useState } from 'react';
import { CircleHelp, Search, Share2, Star } from 'lucide-react';
import { ranking, winners } from './data';
import { PageHeading } from './components';

export function RankingPage() {
  const [mainTab, setMainTab] = useState<'general' | 'league' | 'winners' | 'millionaires'>('general');
  const [period, setPeriod] = useState('الموسم');
  const [search, setSearch] = useState('');

  const filtered = ranking.filter((u) => u.name.includes(search));

  return (
    <div className="page ranking-page">
      <PageHeading eyebrow="نافس الأفضل" title="الترتيب" action={<button className="outline-button"><Share2 size={16} /> مشاركة</button>} />
      <div className="ranking-tabs">
        <button className={mainTab === 'general' ? 'active' : ''} onClick={() => setMainTab('general')}>الترتيب العام</button>
        <button className={mainTab === 'league' ? 'active' : ''} onClick={() => setMainTab('league')}>حسب البطولة</button>
        <button className={mainTab === 'winners' ? 'active' : ''} onClick={() => setMainTab('winners')}>الفائزون</button>
        <button className={mainTab === 'millionaires' ? 'active' : ''} onClick={() => setMainTab('millionaires')}>مليونيرات بمبا</button>
      </div>

      {mainTab === 'general' && (
        <>
          <div className="period-tabs">
            {['الأسبوع', 'الشهر', 'الموسم'].map((p) => (
              <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <div className="search-bar">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن اسمك في الترتيب..." />
          </div>
          <div className="ranking-podium">
            <Podium rank={2} name="اليامامة" points="899" color="silver" />
            <Podium rank={1} name="معصتم" points="912" color="gold" />
            <Podium rank={3} name="Nasser" points="894" color="bronze" />
          </div>
          <div className="ranking-list">
            {filtered.slice(3).map((user) => (
              <div className="ranking-row" key={user.name}>
                <b>{user.rank}</b>
                <span className="tiny-avatar">{user.name.slice(0, 1)}</span>
                <strong>{user.name}</strong>
                <span className="rank-country">{user.country}</span>
                <span className="rank-points">{user.points} <small>نقطة</small></span>
              </div>
            ))}
          </div>
          <PointsInfo />
        </>
      )}

      {mainTab === 'league' && (
        <>
          <div className="league-filter">
            <select defaultValue="الدوري الإنجليزي">
              <option>الدوري الإنجليزي</option><option>الدوري الإسباني</option><option>دوري أبطال أوروبا</option><option>دوري روشن السعودي</option>
            </select>
          </div>
          <div className="period-tabs">
            {['الأسبوع', 'الشهر', 'الموسم'].map((p) => (
              <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <div className="ranking-list">
            {ranking.map((user) => (
              <div className="ranking-row" key={user.name}>
                <b>{user.rank}</b>
                <span className="tiny-avatar">{user.name.slice(0, 1)}</span>
                <strong>{user.name}</strong>
                <span className="rank-points">{user.points} <small>نقطة</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      {mainTab === 'winners' && (
        <div className="winners-list">
          {winners.map((w, i) => (
            <div className="winner-row" key={i}>
              <span className={`winner-medal ${w.rank === 1 ? 'gold' : w.rank === 2 ? 'silver' : 'bronze'}`}>{w.rank}</span>
              <div className="winner-info">
                <b>{w.name}</b>
                <small>{w.period}</small>
              </div>
              <span className="winner-prize"><Star size={14} fill="currentColor" /> {w.prize}</span>
            </div>
          ))}
        </div>
      )}

      {mainTab === 'millionaires' && (
        <>
          <div className="millionaires-banner">
            <h3>ترتيب مليونيرات بمبا</h3>
            <p>أعضاء حققوا أعلى أرصدة من عملات بمبا</p>
          </div>
          <div className="ranking-list">
            {[...ranking].sort((a, b) => (b.bamba ?? 0) - (a.bamba ?? 0)).map((user, i) => (
              <div className="ranking-row" key={user.name}>
                <b>{i + 1}</b>
                <span className="tiny-avatar">{user.name.slice(0, 1)}</span>
                <strong>{user.name}</strong>
                <span className="rank-bamba">{(user.bamba ?? 0).toLocaleString()} <small>بمبة</small></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Podium({ rank, name, points, color }: { rank: number; name: string; points: string; color: string }) {
  return (
    <div className={`podium-card ${color}`}>
      <span className="podium-rank">{rank}</span>
      <span className="podium-avatar">{name.slice(0, 1)}</span>
      <b>{name}</b>
      <strong>{points}</strong>
      <small>نقطة</small>
    </div>
  );
}

function PointsInfo() {
  return (
    <div className="points-info">
      <div><CircleHelp size={20} /><b>كيف تحسب النقاط؟</b></div>
      <div className="points-rules">
        <div className="rule-row"><span>توقع صحيح بالنتيجة</span><b>3 نقاط</b></div>
        <div className="rule-row"><span>توقع صحيح للفائز/التعادل</span><b>1 نقطة</b></div>
        <div className="rule-row featured"><span>مباراة نارية - توقع صحيح بالنتيجة</span><b>5 نقاط</b></div>
        <div className="rule-row featured"><span>مباراة نارية - توقع صحيح للفائز</span><b>2 نقطة</b></div>
        <div className="rule-row"><span>توقع صحيح ونسبة المتوقعين أقل من 10%</span><b>4 نقاط</b></div>
        <div className="rule-row featured"><span>مباراة نارية ونسبة أقل من 10%</span><b>6 نقاط</b></div>
      </div>
    </div>
  );
}
