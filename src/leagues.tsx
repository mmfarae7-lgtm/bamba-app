import { useState } from 'react';
import { ArrowLeft, ChevronLeft, CircleDot, Search, Trophy } from 'lucide-react';
import { leagueGroups, standings, scorers } from './data';
import { PageHeading, SubPageHeader } from './components';

export function LeaguesPage({ onLeagueClick }: { onLeagueClick: (name: string) => void }) {
  const [selected, setSelected] = useState('الدوري الإنجليزي');

  return (
    <div className="page">
      <PageHeading eyebrow="كل البطولات في مكان واحد" title="البطولات" action={<button className="outline-button"><Search size={16} /> بحث</button>} />
      <div className="league-hero">
        <div>
          <span className="pill-label">الأكثر متابعة</span>
          <h2>{selected}</h2>
          <p>تابع المباريات، الترتيب، الهدافين وإحصائيات البطولة.</p>
          <button className="light-button" onClick={() => onLeagueClick(selected)}>عرض التفاصيل <ArrowLeft size={16} /></button>
        </div>
        <div className="hero-trophy"><Trophy size={80} /></div>
      </div>
      <div className="league-groups">
        {leagueGroups.map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <div className="league-grid">
              {group.items.map((item) => (
                <button key={item} className={item === selected ? 'selected' : ''} onClick={() => { setSelected(item); onLeagueClick(item); }}>
                  <span className="mini-ball"><CircleDot size={18} /></span>
                  <span>{item}</span>
                  <ChevronLeft size={16} />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function LeagueDetailsPage({ league, onBack }: { league: string; onBack: () => void }) {
  const [tab, setTab] = useState<'standings' | 'scorers' | 'matches'>('standings');
  const table = standings[league] ?? standings['الدوري الإنجليزي'];
  const topScorers = scorers[league] ?? scorers['الدوري الإنجليزي'];

  return (
    <div className="page league-details-page">
      <SubPageHeader title={league} onBack={onBack} />
      <div className="league-banner">
        <div className="banner-trophy"><Trophy size={50} /></div>
        <div>
          <h2>{league}</h2>
          <p>موسم 2024-2025</p>
        </div>
      </div>
      <div className="league-detail-tabs">
        <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>الترتيب</button>
        <button className={tab === 'scorers' ? 'active' : ''} onClick={() => setTab('scorers')}>الهدافون</button>
        <button className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}>المباريات</button>
      </div>
      {tab === 'standings' && (
        <table className="standings-table">
          <thead><tr><th>#</th><th>الفريق</th><th>لعب</th><th>فاز</th><th>تعادل</th><th>خسر</th><th>فرق</th><th>نقاط</th></tr></thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.pos} className={row.pos <= 4 ? 'champions' : row.pos >= table.length - 2 ? 'relegation' : ''}>
                <td>{row.pos}</td>
                <td className="team-name">{row.team}</td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.gd > 0 ? '+' : ''}{row.gd}</td>
                <td className="pts-cell">{row.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === 'scorers' && (
        <div className="scorers-list">
          {topScorers.map((s) => (
            <div className="scorer-row" key={s.rank}>
              <span className="scorer-rank">{s.rank}</span>
              <div className="scorer-info"><b>{s.name}</b><small>{s.team}</small></div>
              <span className="scorer-goals"><CircleDot size={14} /> {s.goals}</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'matches' && (
        <div className="league-matches">
          <div className="league-match-row"><span>15 يناير</span><div><b>مانشستر سيتي</b><span>3 - 1</span><b>أرسنال</b></div></div>
          <div className="league-match-row"><span>16 يناير</span><div><b>ليفربول</b><span>2 - 2</span><b>تشيلسي</b></div></div>
          <div className="league-match-row"><span>17 يناير</span><div><b>توتنهام</b><span>1 - 0</span><b>نيوكاسل</b></div></div>
          <div className="league-match-row"><span>18 يناير</span><div><b>أستون فيلا</b><span>2 - 1</span><b>مانشستر يونايتد</b></div></div>
        </div>
      )}
    </div>
  );
}
