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
  const [tab, setTab] = useState<'standings' | 'scorers' | 'matches' | 'lineup'>('standings');
  const table = standings[league] ?? standings['الدوري الإنجليزي'];
  const topScorers = scorers[league] ?? scorers['الدوري الإنجليزي'];

  // مباريات ونتائج تُشتق من فرق البطولة نفسها (بيانات تجريبية ثابتة)
  const teams = table.map((r) => r.team);
  const pairCount = Math.min(4, Math.floor(teams.length / 2));
  const matchRows = Array.from({ length: pairCount }, (_, i) => {
    const home = teams[i];
    const away = teams[teams.length - 1 - i];
    const seed = home.length * 7 + away.length * 3 + i * 11;
    return {
      date: `${12 + i} يناير`,
      home,
      away,
      score: `${seed % 3} - ${(seed * 2) % 3}`,
    };
  });

  const homeTeam = table[0]?.team ?? league;
  const awayTeam = table[1]?.team ?? table[0]?.team ?? league;

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
        <button className={tab === 'lineup' ? 'active' : ''} onClick={() => setTab('lineup')}>التشكيلة</button>
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
          {matchRows.map((m, i) => (
            <div className="league-match-row" key={i}>
              <span>{m.date}</span>
              <div><b>{m.home}</b><span>{m.score}</span><b>{m.away}</b></div>
            </div>
          ))}
        </div>
      )}
      {tab === 'lineup' && (
        <div className="tab-panel">
          <h3>تشكيلة فرق البطولة</h3>
          <div className="lineup-grid">
            <div className="lineup-team">
              <h4>{homeTeam}</h4>
              <div className="lineup-formation">
                <span>4-3-3</span>
                <div className="lineup-players">
                  {['الحارس', 'مدافع', 'مدافع', 'مدافع', 'مدافع', 'وسط', 'وسط', 'وسط', 'جناح', 'مهاجم', 'جناح'].map((pos, i) => (
                    <div className="lineup-player" key={i}><span className="player-dot" />{pos}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lineup-team">
              <h4>{awayTeam}</h4>
              <div className="lineup-formation">
                <span>4-4-2</span>
                <div className="lineup-players">
                  {['الحارس', 'مدافع', 'مدافع', 'مدافع', 'مدافع', 'وسط', 'وسط', 'وسط', 'وسط', 'مهاجم', 'مهاجم'].map((pos, i) => (
                    <div className="lineup-player" key={i}><span className="player-dot away" />{pos}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
