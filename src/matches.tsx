import { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Trophy,
  Users,
  Zap,
  BarChart3,
  ListOrdered,
  FileText,
  Goal,
} from 'lucide-react';
import type { Match } from './types';
import { matches } from './data';
import { PageHeading } from './components';

export function MatchesPage({
  predictions,
  onPredict,
  onCalendar,
  onMatchClick,
}: {
  predictions: Record<number, string>;
  onPredict: (m: Match) => void;
  onCalendar: () => void;
  onMatchClick: (m: Match) => void;
}) {
  const dates = ['الأربعاء\n15 يناير', 'الخميس\n16 يناير', 'الجمعة\n17 يناير', 'السبت\n18 يناير', 'الأحد\n19 يناير'];
  const leagues = ['دوري أبطال أوروبا', 'الدوري الإنجليزي', 'الدوري الإسباني', 'دوري روشن السعودي'];

  return (
    <div className="page matches-page">
      <PageHeading eyebrow="ملعبك يبدأ من هنا" title="مباريات اليوم" action={<button className="outline-button" onClick={onCalendar}><CalendarDays size={16} /> التقويم</button>} />
      <div className="date-strip">
        <button><ChevronRight size={19} /></button>
        {dates.map((date, i) => (
          <button key={date} className={i === 2 ? 'active' : ''}>
            {date.split('\n').map((line) => <span key={line}>{line}</span>)}
          </button>
        ))}
        <button><ChevronLeft size={19} /></button>
      </div>
      <div className="match-toolbar">
        <div><b>الجمعة، 17 يناير 2025</b><span>اختر مباراة وابدأ توقعك</span></div>
        <span className="live-dot"><i /> 4 مباريات اليوم</span>
      </div>
      {leagues.map((league) => (
        <section className="league-section" key={league}>
          <div className="league-title"><Trophy size={18} /><h3>{league}</h3><ChevronDown size={18} /></div>
          {matches.filter((m) => m.league === league).map((m) => (
            <MatchCard key={m.id} match={m} prediction={predictions[m.id]} onPredict={onPredict} onClick={() => onMatchClick(m)} />
          ))}
        </section>
      ))}
    </div>
  );
}

function MatchCard({ match, prediction, onPredict, onClick }: { match: Match; prediction?: string; onPredict: (m: Match) => void; onClick: () => void }) {
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';
  const predictedCorrectly = isFinished && prediction === match.result;

  return (
    <article className={`match-card ${match.featured ? 'featured' : ''} ${isFinished ? (predictedCorrectly ? 'correct' : 'wrong') : ''} ${isLive ? 'live' : ''}`}>
      <div className="match-meta">
        <span className="points-badge"><Zap size={13} fill="currentColor" /> {match.points} نقاط</span>
        <span className="match-status">
          {isLive ? <><CircleDot size={13} className="pulse" /> مباشر</> : isFinished ? <>انتهت</> : <><Clock3 size={13} /> {match.time}</>}
        </span>
      </div>
      <div className="match-body" onClick={onClick}>
        <div className="teams">
          <div className="team">
            <span className="team-logo home-logo">{match.homeShort}</span>
            <b>{match.home}</b>
          </div>
          <div className="versus">
            {isFinished ? (
              <><strong className="final-score">{match.result}</strong><small>النتيجة</small></>
            ) : prediction ? (
              <><strong>{prediction.split('-')[0]}</strong><small>توقعك</small><strong>{prediction.split('-')[1]}</strong></>
            ) : (
              <><strong>VS</strong><small>لم تبدأ</small></>
            )}
          </div>
          <div className="team">
            <span className="team-logo away-logo">{match.awayShort}</span>
            <b>{match.away}</b>
          </div>
        </div>
      </div>
      {isFinished && (
        <div className="prediction-breakdown">
          <span className="correct-pct"><CircleDot size={12} /> صحيح {match.correctPct}%</span>
          <span className="wrong-pct"><CircleDot size={12} /> خاطئ {match.wrongPct}%</span>
        </div>
      )}
      <div className="match-footer">
        <button className="stats-button" onClick={onClick}><BarChart3 size={14} /> احصائيات</button>
        {isFinished ? (
          <span className="result-tag">{predictedCorrectly ? 'توقع صحيح' : 'توقع خاطئ'}</span>
        ) : isLive ? (
          <span className="live-tag">لا يمكن التوقع الآن</span>
        ) : (
          <button className="predict-button" onClick={() => onPredict(match)}>
            {prediction ? 'تعديل التوقع' : 'توقع الآن'} <ArrowLeft size={15} />
          </button>
        )}
      </div>
    </article>
  );
}

export function MatchDetailsPage({
  match,
  prediction,
  onPredict,
  onBack,
}: {
  match: Match;
  prediction?: string;
  onPredict: (m: Match) => void;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'ranking' | 'stats' | 'predictions' | 'lineup' | 'details'>('details');
  const tabs = [
    { key: 'ranking' as const, label: 'الترتيب', icon: ListOrdered },
    { key: 'stats' as const, label: 'احصائيات', icon: BarChart3 },
    { key: 'predictions' as const, label: 'نسبة التوقعات', icon: Users },
    { key: 'lineup' as const, label: 'التشكيلة', icon: Goal },
    { key: 'details' as const, label: 'التفاصيل', icon: FileText },
  ];

  return (
    <div className="page match-details-page">
      <div className="subpage-header"><button onClick={onBack}><ChevronRight size={20} /></button><h1>تفاصيل المباراة</h1></div>
      <div className="match-ticket">
        <div className="ticket-header">
          <span className="ticket-league"><Trophy size={15} /> {match.league}</span>
          {match.featured && <span className="ticket-featured"><Zap size={13} fill="currentColor" /> مباراة نارية</span>}
        </div>
        <div className="ticket-teams">
          <div className="ticket-team">
            <span className="team-logo home-logo large">{match.homeShort}</span>
            <b>{match.home}</b>
          </div>
          <div className="ticket-center">
            {match.status === 'finished' ? <strong className="final-score">{match.result}</strong> : <strong className="time-score">{match.time}</strong>}
            <small>{match.status === 'finished' ? 'انتهت' : match.status === 'live' ? 'مباشر' : 'لم تبدأ'}</small>
          </div>
          <div className="ticket-team">
            <span className="team-logo away-logo large">{match.awayShort}</span>
            <b>{match.away}</b>
          </div>
        </div>
        {prediction && <div className="ticket-prediction"><span>توقعك:</span><b>{prediction}</b></div>}
      </div>
      <div className="match-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={activeTab === t.key ? 'active' : ''} onClick={() => setActiveTab(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      <div className="match-tab-content">
        {activeTab === 'ranking' && <RankingTab match={match} />}
        {activeTab === 'stats' && <StatsTab match={match} />}
        {activeTab === 'predictions' && <PredictionsTab match={match} />}
        {activeTab === 'lineup' && <LineupTab match={match} />}
        {activeTab === 'details' && <DetailsTab match={match} />}
      </div>
      {match.status === 'upcoming' && (
        <button className="primary-button sticky-cta" onClick={() => onPredict(match)}>
          {prediction ? 'تعديل التوقع' : 'توقع الآن'} <ArrowLeft size={18} />
        </button>
      )}
    </div>
  );
}

function RankingTab({ match }: { match: Match }) {
  return (
    <div className="tab-panel">
      <h3>ترتيب الفريقين في البطولة</h3>
      <table className="standings-table">
        <thead><tr><th>#</th><th>الفريق</th><th>لعب</th><th>فاز</th><th>تعادل</th><th>خسر</th><th>نقاط</th></tr></thead>
        <tbody>
          <tr className="highlight"><td>1</td><td>{match.home}</td><td>24</td><td>18</td><td>4</td><td>2</td><td>58</td></tr>
          <tr className="highlight"><td>3</td><td>{match.away}</td><td>24</td><td>16</td><td>4</td><td>4</td><td>52</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function StatsTab({ match }: { match: Match }) {
  const stats = [
    { label: 'الفوز', home: 45, away: 30, neutral: 25 },
    { label: 'أهداف متوسطة', home: 2.1, away: 1.4, neutral: 0 },
    { label: 'استحواذ %', home: 55, away: 45, neutral: 0 },
    { label: 'تسديدات', home: 14, away: 9, neutral: 0 },
  ];
  return (
    <div className="tab-panel">
      <h3>إحصائيات الفريقين السابقة</h3>
      <div className="stats-list">
        {stats.map((s) => (
          <div className="stat-row" key={s.label}>
            <b>{s.home}</b>
            <div className="stat-bar-container">
              <span>{s.label}</span>
              <div className="stat-bar"><div className="stat-fill home" style={{ width: `${s.home}%` }} /><div className="stat-fill away" style={{ width: `${s.away}%` }} /></div>
            </div>
            <b>{s.away}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictionsTab({ match }: { match: Match }) {
  const dist = [
    { label: `${match.home} يفوز`, pct: 42 },
    { label: 'تعادل', pct: 28 },
    { label: `${match.away} يفوز`, pct: 30 },
  ];
  return (
    <div className="tab-panel">
      <h3>نسبة توقعات الأعضاء</h3>
      <div className="prediction-dist">
        {dist.map((d) => (
          <div className="dist-row" key={d.label}>
            <span>{d.label}</span>
            <div className="dist-bar"><div style={{ width: `${d.pct}%` }} /></div>
            <b>{d.pct}%</b>
          </div>
        ))}
      </div>
      <div className="prediction-count">إجمالي المتوقعين: 1,247 عضو</div>
    </div>
  );
}

function LineupTab({ match }: { match: Match }) {
  return (
    <div className="tab-panel">
      <h3>تشكيلة الفريقين</h3>
      <div className="lineup-grid">
        <div className="lineup-team">
          <h4>{match.home}</h4>
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
          <h4>{match.away}</h4>
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
  );
}

function DetailsTab({ match }: { match: Match }) {
  const events = [
    { min: 12, type: 'goal', text: `${match.home} يسجل الهدف الأول` },
    { min: 34, type: 'yellow', text: 'بطاقة صفراء للاعب من الفريق الضيف' },
    { min: 67, type: 'goal', text: `${match.away} يدرك التعادل` },
    { min: 89, type: 'goal', text: `${match.home} يسجل هدف الفوز` },
  ];
  return (
    <div className="tab-panel">
      <h3>أحداث المباراة</h3>
      {match.status === 'upcoming' ? (
        <div className="no-events"><Clock3 size={32} /><p>المباراة لم تبدأ بعد</p><span>تابع الأحداث لحظة بلحظة عند بدء المباراة</span></div>
      ) : (
        <div className="events-list">
          {events.map((ev, i) => (
            <div className="event-row" key={i}>
              <span className="event-min">{ev.min}'</span>
              <span className={`event-icon ${ev.type}`}><CircleDot size={14} /></span>
              <span className="event-text">{ev.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
