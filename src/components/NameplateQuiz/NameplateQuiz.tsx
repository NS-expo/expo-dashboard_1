// NameplateQuiz.tsx
import { useEffect, useMemo, useState } from 'react'
import PanelFrame from '../common/PanelFrame'
import type { NameplateQuestion, ThemeMode, Theme } from '../../types'
// UNKNOWN_CHOICE_INDEX = 「わからない」（本人が選択）
// TIMEOUT_CHOICE_INDEX = 「未回答」（10分間操作なしでタイムアウト＝離脱）
// どちらも集計側(useQuizAnswerLog.ts)と共有する固定値
import { UNKNOWN_CHOICE_INDEX, TIMEOUT_CHOICE_INDEX } from '../../types'
import AdminResultsPanel from './AdminResultsPanel'
import { useQuizAnswerLog } from '../../hooks/useQuizAnswerLog'
import { useQuizProgressCache, INITIAL_PROGRESS } from '../../hooks/useQuizProgressCache'
import { useIsMobile } from '../../hooks/useMediaQuery' // ← ここを既存フックのパスに変更
import './NameplateQuiz.css'

// モニタ表示（!isMobile側）でのポーリング間隔。
// 今はlocalStorageなので実際には同一端末内でしか意味を持たないが、
// 将来DB接続に切り替えたときに「スマホの回答が自動でモニタに反映される」
// ようにするための土台として最初から入れておく。
// 15秒だとAPIへの問い合わせ頻度が高すぎるため、3分に延長。
const STATS_POLL_INTERVAL_MS = 3 * 60 * 1000

interface NameplateQuizProps {
  theme: Theme
  questions: NameplateQuestion[]
  themeMode: ThemeMode
  isAdminOpen: boolean
  onAdminOpenChange: (open: boolean) => void
  dateOptions: { label: string; value: string }[] 
}

function shuffledOrder(questions: NameplateQuestion[]): string[] {
  const ids = questions.map((q) => q.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}

// 4択（0〜3）だけをシャッフルした並び順を返す（「わからない」は常に最後の固定枠のまま）
function shuffledChoiceOrder(choiceCount: number): number[] {
  const indices = Array.from({ length: choiceCount }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}


export default function NameplateQuiz({
  theme, questions, themeMode, isAdminOpen, onAdminOpenChange, dateOptions,
}: NameplateQuizProps) {
  const { logAnswer, getOverallStats, getBreakdown, getDailyCorrectRates, getDailyCorrectRatesByCategory, debugGetAllLogs } = useQuizAnswerLog()
  const { progress, setProgress } = useQuizProgressCache()
  const isMobile = useIsMobile()
  const [overall, setOverall] = useState({ totalAnswered: 0, totalCorrect: 0 })
  const currentQuestionId = progress.order[progress.currentIndex] ?? null
  const question = useMemo(
    () => questions.find((q) => q.id === currentQuestionId) ?? null,
    [questions, currentQuestionId]
  )
  const currentVideoUrl = question?.videoUrl?.[themeMode]
  const currentIconUrl = question?.iconUrl?.[themeMode]
  const isLastQuestion = progress.currentIndex === progress.order.length - 1
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
  setVideoReady(false)
}, [currentVideoUrl])

  // 累計正解率（サイドのリング表示用）。取得は非同期になったので初回取得＋定期ポーリングで更新する。
  // DB接続に切り替えたとき、他端末（スマホ）で増えた回答もここで自動的に拾えるようにするため。
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getOverallStats().then((stats) => {
        if (!cancelled) setOverall(stats)
      })
    }
    refresh()
    const interval = setInterval(refresh, STATS_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [getOverallStats])

  const rate = overall.totalAnswered > 0 ? Math.round((overall.totalCorrect / overall.totalAnswered) * 100) : 0

  const ring = useMemo(() => {
    const r = 30
    const c = 2 * Math.PI * r
    return { r, c, offset: c - (rate / 100) * c }
  }, [rate])

  const showQuestionView = progress.phase === 'question'

  // 4択部分の表示順（正解位置を毎回ランダムにする）。問題が変わるたびに再計算。
  const choiceOrder = useMemo(
    () => (question ? shuffledChoiceOrder(question.choices.length) : []),
    [currentQuestionId, question]
  )

  // ---- 回答判定（クリックのみ） ----
  // 「わからない」は未回答扱いとし、正答率（累計・セッションどちらも／
  // モバイル・モニタどちらの表示も）には一切反映しない。
  // ★ここが「わからないを選んでも正答率に影響させない」の本体部分。
  //   isUnknown の場合は setOverall / sessionAnswered / sessionCorrect の
  //   どれも更新しない（下のif文の外に出さないよう注意）。
  const submitAnswer = (choiceIndex: number) => {
    if (!question || progress.phase !== 'question') return
    const isUnknown = choiceIndex === UNKNOWN_CHOICE_INDEX
    const correct = !isUnknown && choiceIndex === question.correctIndex

    // 保存は非同期（将来DB化されると通信が挟まる）。UIの手触りを損なわないよう、
    // 自分の画面上の集計は保存の完了を待たずに楽観的に更新する。
    // ※ログ自体は「わからない」でも記録する（作成者ページの選択肢別内訳で
    //   何人がわからないを選んだか見えるようにするため）。正答率の集計から
    //   除外する処理は useQuizAnswerLog.ts 側（isAnswered）で行っている。
    logAnswer(question.id, choiceIndex, correct).catch(() => {
      // 保存に失敗しても回答自体の進行は止めない
    })

    // 「わからない」は正答率（累計＝サイドのリング／モバイルの結果画面）の
    // 分母に含めない。isUnknown のときはこのブロックごとスキップする。
    if (!isUnknown) {
      setOverall((prev) => ({
        totalAnswered: prev.totalAnswered + 1,
        totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
      }))
    }

    setProgress((prev) => ({
      ...prev,
      phase: 'answered',
      selectedChoiceIndex: choiceIndex,
      resultFlag: isUnknown ? 'unanswered' : correct ? 'correct' : 'incorrect',
      // 「わからない」は正答率の分母に含めない（sessionAnsweredを増やさない）。
      // これがモバイルの結果画面「◯問中◯問正解／正解率◯%」の分母にもなる。
      sessionAnswered: prev.sessionAnswered + (isUnknown ? 0 : 1),
      sessionCorrect: prev.sessionCorrect + (correct ? 1 : 0),
    }))
  }

  const TIMEOUT_MS = 10 * 60 * 1000 // 10分

// ---- 10分未回答タイムアウト：今の問題だけ「未回答」にして次へ進める ----
// （それまでの sessionCorrect / sessionAnswered は保持し、丸ごとリセットはしない）
useEffect(() => {
  if (progress.phase !== 'question' || !question) return

  const targetQuestionId = question.id
  const elapsed = Date.now() - progress.timestamp
  const remaining = TIMEOUT_MS - elapsed

  const handleTimeout = () => {
    // 10分放置 ＝ 実質的な離脱・未回答。「わからない」とは別の
    // TIMEOUT_CHOICE_INDEX(5) で記録し、作成者ページで
    // 「わからない」と「未回答」を別々の枠で見られるようにする。
    // ★ここも「正答率に反映させない」対象：setOverall は呼ばず、
    //   sessionAnswered / sessionCorrect のどちらも加算しない。
    logAnswer(targetQuestionId, TIMEOUT_CHOICE_INDEX, false).catch(() => {
      // 保存に失敗しても進行は止めない
    })
    setProgress((prev) => {
      const isLast = prev.currentIndex === prev.order.length - 1
      if (isLast) {
        return {
          ...prev,
          phase: 'finished',
          selectedChoiceIndex: null,
          resultFlag: null,
          // sessionAnswered / sessionCorrect とも加算しない（未回答は正答率に含めない）
        }
      }
      return {
        ...prev,
        phase: 'question',
        currentIndex: prev.currentIndex + 1,
        selectedChoiceIndex: null,
        resultFlag: null,
        // sessionAnswered / sessionCorrect とも加算しない（未回答は正答率に含めない）
      }
    })
  }

  if (remaining <= 0) {
    handleTimeout()
    return
  }

  const timer = setTimeout(handleTimeout, remaining)
  return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [progress.phase, progress.timestamp, currentQuestionId])

  const themeVars = {
    '--nq-bg': theme.bg,
    '--nq-surface': theme.surface,
    '--nq-border': theme.border,
    '--nq-text': theme.text,
    '--nq-subtext': theme.subtext,
    '--nq-accent': theme.accent,
  } as React.CSSProperties

  const handleStart = () => {
    setProgress({
      phase: 'question',
      order: shuffledOrder(questions),
      currentIndex: 0,
      selectedChoiceIndex: null,
      resultFlag: null,
      sessionAnswered: 0,
      sessionCorrect: 0,
      timestamp: Date.now(),
    })
  }

  const handleNext = () => {
    if (isLastQuestion) {
      setProgress((prev) => ({ ...prev, phase: 'finished' }))
    } else {
      setProgress((prev) => ({
        ...prev,
        phase: 'question',
        currentIndex: prev.currentIndex + 1,
        selectedChoiceIndex: null,
        resultFlag: null,
      }))
    }
  }

  const handleRestart = () => {
    setProgress(INITIAL_PROGRESS)
  }

  return (
    <PanelFrame className="nameplate-quiz">
      <div className={`nameplate-quiz__layout${isMobile ? ' is-mobile' : ''}`} style={themeVars}>
      {!isMobile && (
        <div className="nameplate-quiz__side">
          <svg viewBox="-5 0 80 80" className="nameplate-quiz__ring" role="img" aria-label="正解率">
            <circle cx="65" cy="80" r={ring.r} className="nameplate-quiz__ring-track" />
            <circle
              cx="65"
              cy="80"
              r={ring.r}
              className="nameplate-quiz__ring-fill"
              strokeDasharray={ring.c}
              strokeDashoffset={ring.offset}
            />
            <text x="80" y="45" textAnchor="middle" className="nameplate-quiz__ring-value">
              {rate}
            </text>
            <text x="80" y="54" textAnchor="middle" className="nameplate-quiz__ring-unit">
              % 正解率
            </text>
          </svg>
        </div>
      )}
        <div className={`nameplate-quiz__media${!isMobile ? ' nameplate-quiz__media--monitor' : ''}`}>
         {!isMobile ? (
           // ---- モニタ表示：スマホでの参加を促すQR案内＋モバイル版のイメージ ----
           <>
             <div className="nameplate-quiz__invite">
               <div className="nameplate-quiz__invite-text">
                 <p className="nameplate-quiz__invite-title">
                   スマホでクイズに挑戦しよう
                 </p>
                 <p className="nameplate-quiz__invite-sub">全部で{questions.length}問</p>
               </div>
               <div className="nameplate-quiz__invite-qr">
                 <span className="nameplate-quiz__invite-qr-label">SCAN ME</span>
                 <img
                   src={theme.qr}
                   alt="クイズ参加用QRコード"
                   className="nameplate-quiz__invite-qr-img"
                  />
               </div>
             </div>
            
             
           </>
          ) : progress.phase === 'idle' ? (
            <div className="nameplate-quiz__start-view">
              <p className="nameplate-quiz__start-desc">銘板アイコンクイズ（全{questions.length}問）</p>
              <button className="nameplate-quiz__start-btn" onClick={handleStart}>
                クイズ開始
              </button>
            </div>
          ) : progress.phase === 'finished' ? (
            <div className="nameplate-quiz__final-view">
              <p className="nameplate-quiz__final-title">結果</p>
              <p className="nameplate-quiz__final-score">
                {progress.order.length}問中 <span>{progress.sessionCorrect}</span>問正解
              </p>
              <p className="nameplate-quiz__final-rate">
                正解率{' '}
                {progress.sessionAnswered > 0
                  ? Math.round((progress.sessionCorrect / progress.sessionAnswered) * 100)
                  : 0}
                %
              </p>
              <p className="nameplate-quiz__final-rate-note">※「わからない」は含めず</p>
              <button className="nameplate-quiz__toggle-btn" onClick={handleRestart}>
                もう一度挑戦する
              </button>
            </div>
          ) : showQuestionView ? (
            // 問題表示：動画（背景）＋問題文＋選択肢（クリック可）。タイマーなし。
            <div className="nameplate-quiz__question-view">
              {currentVideoUrl && (
             <img
               key={currentVideoUrl}
               src={currentVideoUrl}
               alt=""
               className="nameplate-quiz__video"
               style={{ opacity: videoReady ? 1 : 0 }}
               onLoad={() => setVideoReady(true)}
              
              />
              )}
              {currentVideoUrl && !videoReady && (
                <p className="nameplate-quiz__media-placeholder">読み込み中…</p>
              )}

              {question?.question && (
                <p className="nameplate-quiz__question-text">
                {currentIconUrl && (
                 <img
                 src={currentIconUrl}
                 alt=""
                 className="nameplate-quiz__question-icon-inline"
                />
              )}
             {question.question}
             </p>
             )}

              {question && (
                <div className="nameplate-quiz__question-choices">
                  {choiceOrder.map((idx) => (
                    <button
                      key={idx}
                      className="nameplate-quiz__question-choice nameplate-quiz__question-choice--clickable"
                      onClick={() => submitAnswer(idx)}
                    >
                      {question.choices[idx]}
                    </button>
                  ))}
                  <button
                    className="nameplate-quiz__question-choice nameplate-quiz__question-choice--clickable nameplate-quiz__question-choice--unknown"
                    onClick={() => submitAnswer(UNKNOWN_CHOICE_INDEX)}
                  >
                    わからない
                  </button>
                </div>
              )}
            </div>
          ) : (
            // 正誤判定ビュー：正解/不正解/未回答＋解説＋次へ
            <div className="nameplate-quiz__answer-view">
              <div className={`nameplate-quiz__result nameplate-quiz__result--${progress.resultFlag}`}>
                {progress.resultFlag === 'correct'
                  ? '正解 〇'
                  : progress.resultFlag === 'unanswered'
                  ? '未回答'
                  : '不正解 ×'}
              </div>

              {question?.question && (
                <p className="nameplate-quiz__question-text">
                 {currentIconUrl && (
                 <img
                 src={currentIconUrl}
                 alt=""
                 className="nameplate-quiz__question-icon-inline"
                 />
                 )}
              {question.question}
              </p>
              )}

              {question && (
                <div className="nameplate-quiz__question-choices">
                  {choiceOrder.map((idx) => {
                    const isCorrectChoice = idx === question.correctIndex
                    const isSelected = progress.selectedChoiceIndex === idx
                    return (
                      <div
                        key={idx}
                        className={`nameplate-quiz__question-choice${
                          isCorrectChoice ? ' is-correct-answer' : ''
                        }${isSelected && !isCorrectChoice ? ' is-wrong-answer' : ''}`}
                      >
                        {question.choices[idx]}
                      </div>
                    )
                  })}
                  <div
                    className={`nameplate-quiz__question-choice nameplate-quiz__question-choice--unknown${
                      progress.selectedChoiceIndex === UNKNOWN_CHOICE_INDEX ? ' is-wrong-answer' : ''
                    }`}
                  >
                    わからない
                  </div>
                </div>
              )}

              {question?.explanation && (
                <p className="nameplate-quiz__explanation">{question.explanation}</p>
              )}

              <div className="nameplate-quiz__answer-actions">
                <button className="nameplate-quiz__toggle-btn is-on" onClick={handleNext}>
                  次へ
                </button>
              </div>
            </div>
          )}
        </div>
        {!isMobile && (
         <img
          src={theme.mobile}
          alt="モバイル版クイズ画面のイメージ"
          className="nameplate-quiz__mobile-preview"
         />
        )}
        {!isMobile && (
          // ---- モニタ表示：下段にカテゴリ別・日別正解率のグラフ ----
          <div className="nameplate-quiz__trend">
            <AdminResultsPanel
              theme={theme}
              questions={questions}
              themeMode={themeMode}
              dateOptions={dateOptions}
              getBreakdown={getBreakdown}
              getDailyCorrectRates={getDailyCorrectRates}
              getDailyCorrectRatesByCategory={getDailyCorrectRatesByCategory}
              embedded
            />
          </div>
        )}
      </div>

      {isAdminOpen && (
       <AdminResultsPanel
         theme={theme}
         questions={questions}
         themeMode={themeMode}
         dateOptions={dateOptions}
         getBreakdown={getBreakdown}
         getDailyCorrectRates={getDailyCorrectRates}
         getDailyCorrectRatesByCategory={getDailyCorrectRatesByCategory}
         debugGetAllLogs={debugGetAllLogs}
         onClose={() => onAdminOpenChange(false)}
        />
     )}
    </PanelFrame>
  )
}