import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Sparkles, Trophy, XCircle } from 'lucide-react';
import { SubPageHeader, BambaCoin } from './components';
import { supabase } from './lib/supabase';

type QuizQuestion = {
  id: number;
  category: string;
  question: string;
  options: string[];
};

type QuizProps = {
  onBack: () => void;
  balance: number;
  onBalanceChange: (next: number) => void;
};

// صفحة "جاوب واكسب": يختار الخادم أسئلة بترتيب مختلف لكل مشترك (md5(user_id))،
// ويتحقق الخادم من الإجابة ويمنح البمبات مرة واحدة لكل سؤال (لا يمكن تكرارها).
export function QuizEarnPage({ onBack, balance, onBalanceChange }: QuizProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; earned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState({ correct: 0, earned: 0 });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_quiz_questions', { p_count: 6 });
      if (!mounted) return;
      if (rpcError || !data) {
        setError('تعذر تحميل الأسئلة. تحقق من الاتصال وحاول مجدداً.');
      } else {
        setQuestions(data as QuizQuestion[]);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const answer = async (optionIndex: number) => {
    if (submitting || selected !== null) return;
    setSelected(optionIndex);
    setSubmitting(true);
    const q = questions[index];
    const { data, error: rpcError } = await supabase.rpc('answer_quiz_question', {
      p_question_id: q.id,
      p_answer_index: optionIndex,
      p_reward: 5,
    });
    setSubmitting(false);
    if (rpcError || !data) {
      setError('تعذر تسجيل الإجابة. حاول مجدداً.');
      setSelected(null);
      return;
    }
    const res = data as { correct: boolean; earned?: number; balance?: number; already?: boolean };
    setAnswered({ correct: res.correct, earned: res.earned ?? 0 });
    if (typeof res.balance === 'number') onBalanceChange(res.balance);
    setSummary((s) => ({ correct: s.correct + (res.correct ? 1 : 0), earned: s.earned + (res.earned ?? 0) }));
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setAnswered(null);
    }
  };

  return (
    <div className="page earn-page quiz-page">
      <SubPageHeader title="جاوب واكسب" onBack={onBack} />

      <div className="earn-balance" data-testid="quiz-balance">
        <BambaCoin size={44} />
        <div>
          <small>رصيد بمباتك</small>
          <b>{balance.toLocaleString()}</b>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {loading ? (
        <div className="quiz-loading"><Loader2 size={26} className="spin" /><p>جاري تحضير أسئلتك المخصصة...</p></div>
      ) : done ? (
        <div className="quiz-done" data-testid="quiz-done">
          <span className="quiz-done-icon"><Trophy size={30} /></span>
          <h3>أنهيت الجولة! 🌟</h3>
          <p>أجبت صحيحاً على <b>{summary.correct}</b> من {questions.length} أسئلة وكسبت <b>{summary.earned} بمبة</b>.</p>
          <p className="quiz-done-note"><ShieldCheck size={14} /> كل سؤال يُحتسب مرة واحدة فقط — الأسئلة تختلف من مشترك لآخر.</p>
          <button className="primary-button" onClick={onBack}>العودة للمكافآت <ArrowLeft size={18} /></button>
        </div>
      ) : questions.length === 0 ? (
        <div className="quiz-done"><p>لا توجد أسئلة متاحة حالياً — عد لاحقاً.</p></div>
      ) : (
        <div className="quiz-card" data-testid="quiz-card">
          <div className="quiz-progress">
            <span>سؤال {index + 1} / {questions.length}</span>
            <span className="quiz-category">{questions[index].category}</span>
          </div>
          <h3>{questions[index].question}</h3>
          <div className="quiz-options">
            {questions[index].options.map((opt, i) => {
              let cls = 'quiz-option';
              if (answered) {
                if (i === selected && answered.correct) cls += ' correct';
                else if (i === selected) cls += ' wrong';
              }
              return (
                <button key={i} className={cls} onClick={() => void answer(i)} disabled={selected !== null || submitting}>
                  <span className="quiz-letter">{String.fromCharCode(65 + i)}</span> {opt}
                  {answered && i === selected && (answered.correct
                    ? <CheckCircle2 size={18} className="quiz-mark ok" />
                    : <XCircle size={18} className="quiz-mark no" />)}
                </button>
              );
            })}
          </div>
          {answered && (
            <div className={`quiz-feedback ${answered.correct ? 'good' : 'bad'}`}>
              {answered.correct
                ? <><Sparkles size={16} /> إجابة صحيحة! +{answered.earned} بمبة أُضيفت لرصيدك{answered.earned === 0 ? ' (حصلت عليها سابقاً)' : ''}</>
                : 'إجابة خاطئة — لا تُخصم من رصيدك'}
            </div>
          )}
          {answered && (
            <button className="primary-button quiz-next" onClick={next} data-testid="quiz-next-button">
              {index + 1 >= questions.length ? 'عرض النتيجة' : 'السؤال التالي'} <ArrowLeft size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}