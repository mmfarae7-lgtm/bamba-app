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
import { useMatches } from './lib/matches';
import { PageHeading, CalendarModal } from './components';

const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const parseIsoLocal = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toIsoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDaysTo = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const daysDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400000);
const formatDateAr = (d: Date) => `${WEEKDAYS_AR[d.getDay()]}\n${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
const formatFullAr = (d: Date) => `${WEEKDAYS_AR[d.getDay()]}، ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;

// توزيع تجريبي ثابت: أي يوم تعرض له المباراة (بالنسبة ليوم اليوم) — تُستبدل بالبيانات الحقيقية لاحقاً
const MATCH_DAY_OFFSET: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: -1, 5: -2, 6: -1, 7: 0 };

export function MatchesPage({
  predictions,
  onPredict,
  onMatchClick,
}: {
  predictions: Record<number, string>;
  onPredict: (m: Match) => void;
  onMatchClick: (m: Match) => void;
}) {
  const { matches } = useMatches();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [selectedIso, setSelectedIso] = useState(toIsoLocal(today));
  const [showCalendar, setShowCalendar] = useState(false);
  const [touchX, setTouchX] = useState(0);

  const selected = parseIsoLocal(selectedIso);
  const offset = daysDiff(selected, today);
  // الشريط يعرض خمسة أيام متمركزة حول التاريخ المختار
  const stripDates = [-2, -1, 0, 1, 2].map((n) => addDaysTo(selected, n));

  const shiftDay = (n: number) => setSelectedIso(toIsoLocal(addDaysTo(selected, n)));

  const dayMatches = matches.filter((m) => (MATCH_DAY_OFFSET[m.id] ?? 0) === offset);
  const leagues = [...new Set(dayMatches.map((m) => m.league))];

  return (
    <div className="page matches-page">
      <PageHeading eyebrow="ملعبك يبدأ من هنا" title="مباريات اليوم" />
      <div
        className="date-strip"
        data-testid="date-strip"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) shiftDay(dx > 0 ? -1 : 1); // سحب لليمين = اليوم السابق، لليسار = اليوم التالي
        }}
      >
        <button className="strip-arrow" onClick={() => setShowCalendar(true)} aria-label="فتح التقويم" data-testid="strip-arrow-prev"><ChevronRight size={19} /></button>
        {stripDates.map((d) => {
          const iso = toIsoLocal(d);
          const active = iso === selectedIso;
          return (
            <button key={iso} className={active ? 'active' : ''} onClick={() => setSelectedIso(iso)} data-testid={`date-chip-${iso}`}>
              {formatDateAr(d).split('\n').map((line) => <span key={line}>{line}</span>)}
            </button>
          );
        })}
        <button className="strip-arrow" onClick={() => setShowCalendar(true)} aria-label="فتح التقويم" data-testid="strip-arrow-next"><ChevronLeft size={19} /></button>
      </div>
      <div className="match-toolbar">
        <div><b>{formatFullAr(selected)}</b><span>اختر مباراة وابدأ توقعك</span></div>
        <span className="live-dot"><i /> {dayMatches.length} مباريات في هذا اليوم</span>
      </div>
      {dayMatches.length === 0 ? (
        <div className="no-matches" data-testid="no-matches">
          <CalendarDays size={40} />
          <p>لا توجد مباريات في هذا التاريخ</p>
          <span>اختر تاريخاً آخر من الشريط أو التقويم</span>
        </div>
      ) : (
        leagues.map((league) => (
          <section className="league-section" key={league}>
            <div className="league-title"><Trophy size={18} /><h3>{league}</h3><ChevronDown size={18} /></div>
            {dayMatches.filter((m) => m.league === league).map((m) => (
              <MatchCard key={m.id} match={m} prediction={predictions[m.id]} onPredict={onPredict} onClick={() => onMatchClick(m)} />
            ))}
          </section>
        ))
      )}
      {showCalendar && (
        <CalendarModal selected={selectedIso} onSelect={(iso) => setSelectedIso(iso)} onClose={() => setShowCalendar(false)} />
      )}
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
        <span className="match-status">
          {isLive ? <><CircleDot size={13} className="pulse" /> مباشر</> : isFinished ? <>انتهت</> : <><Clock3 size={13} /> {match.time}</>}
        </span>
        <span className="points-badge"><Zap size={13} fill="currentColor" /> {match.points} نقاط</span>
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
