// useQuizAnswerLog.ts
//
// 銘板クイズの回答ログを集計するフック。
// 保存・取得そのものは services/answerLogStore.ts の AnswerLogStore に
// 委譲している。現在はAPI経由で回答ログを取得し、クライアント側で集計する。
//
// ストレージ層が非同期（Promiseベース）になったため、
// logAnswer / getOverallStats / getBreakdown / getDailyCorrectRates /
// getDailyCorrectRatesByCategory はすべて Promise を返す点に注意
// （呼び出し側は await するか .then() する）。

import { useCallback, useMemo } from 'react'
import type {
  NameplateQuestion,
  QuizAnswerLog,
  ChoiceBreakdown,
  DailyCorrectRate,
} from '../types'
// UNKNOWN_CHOICE_INDEX = 「わからない」（本人が能動的に選んだ）
// TIMEOUT_CHOICE_INDEX = 「未回答」（10分間操作なしでタイムアウト＝離脱）
// どちらもUI側(NameplateQuiz.tsx)と共有する固定値。
import { UNKNOWN_CHOICE_INDEX, TIMEOUT_CHOICE_INDEX } from '../types'
import { getAnswerLogStore } from '../services/answerLogStore'

function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── 「わからない」「未回答」は正答率の集計から除外する ──────────────
// UNKNOWN_CHOICE_INDEX（わからないを選んだ）・TIMEOUT_CHOICE_INDEX（タイムアウトで
// 未回答のまま次に進んだ）は、どちらも「実際には回答していない」ため、
// 正答率（correctRate）の分母・分子どちらにも含めない。
// ここで isAnswered = false になったログは、以下の
//   ・getOverallStats（サイドのリング表示・モバイルの累計正解率）
//   ・getDailyCorrectRates / getDailyCorrectRatesByCategory（作成者ページの
//     日別グラフ／モニタ埋め込みのグラフ）
// の集計から丸ごと除外される。
// 一方 getBreakdown（作成者ページの選択肢別の内訳バー）は「何人がわからない／
// 未回答だったか」を見せるための集計なので、そちらには影響しない
// （わからない・未回答も1つずつの選択肢として個別の行に表示される）。
function isAnswered(log: QuizAnswerLog): boolean {
  return log.choiceIndex !== UNKNOWN_CHOICE_INDEX && log.choiceIndex !== TIMEOUT_CHOICE_INDEX
}

// dates × idSet の条件で dayLogs → 集計結果1件分を作る共通処理。
// getDailyCorrectRates / getDailyCorrectRatesByCategory の両方から使う。
function buildDailyRates(
  logs: QuizAnswerLog[],
  dates: string[],
  idSet: Set<string> | null
): DailyCorrectRate[] {
  return dates.map((date) => {
    const dayLogs = logs.filter(
      (l) => l.date === date && (!idSet || idSet.has(l.questionId))
    )
    const answered = dayLogs.filter(isAnswered)
    const totalAnswered = answered.length
    const totalCorrect = answered.filter((l) => l.correct).length
    return {
      date,
      totalAnswered,
      totalCorrect,
      correctRate: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    }
  })
}

export function useQuizAnswerLog() {
  const store = useMemo(() => getAnswerLogStore(), [])

  const logAnswer = useCallback(
    (questionId: string, choiceIndex: number, correct: boolean, date = todayStr()) => {
      const log: QuizAnswerLog = { questionId, date, choiceIndex, correct, timestamp: Date.now() }
      return store.append(log)
    },
    [store]
  )

  /**
   * 全期間の累計正解率（サイドのリング表示・モバイルの累計正解率用）。
   * 「わからない」「未回答（タイムアウト）」はどちらも isAnswered で除外される
   * ため、正答率には一切影響しない。
   */
  const getOverallStats = useCallback(async () => {
    const logs = await store.getAll()
    const answered = logs.filter(isAnswered)
    const totalAnswered = answered.length
    const totalCorrect = answered.filter((l) => l.correct).length
    return { totalAnswered, totalCorrect }
  }, [store])

  // 選択肢ごとの内訳（作成者用ページのバー表示）。
  // 「わからない」（本人が選んだ）と「未回答」（タイムアウトで離脱）は
  // choiceIndex が別（4と5）なので、ここでは別々の行として並べて表示する。
  // 人数が見えたほうが実用的なので、正答率の集計とは切り離してどちらも
  // 集計対象に含めている（正答率の分母には影響しない＝ isAnswered 参照）。
  const getBreakdown = useCallback(
    async (question: NameplateQuestion, dateRange?: string[]): Promise<ChoiceBreakdown[]> => {
      const all = await store.getAll()
      const logs = all.filter(
        (l) => l.questionId === question.id && (!dateRange || dateRange.includes(l.date))
      )
      const total = logs.length
      // idx: 0-3 = 4択、4 = わからない、5 = 未回答（別々の枠として並べる）
      const labels = [...question.choices, 'わからない', '未回答']

      return labels.map((label, idx) => {
        const count = logs.filter((l) => l.choiceIndex === idx).length
        return {
          choiceIndex: idx,
          label,
          count,
          percent: total > 0 ? Math.round((count / total) * 100) : 0,
          isCorrect: idx === question.correctIndex,
        }
      })
    },
    [store]
  )

  // 第2引数 questionIds で対象問題を絞り込める（省略時は全問題＝全体）。
  // 「わからない」「未回答（タイムアウト）」はどちらも isAnswered で
  // 正答率の分母・分子どちらからも除外される（作成者ページの日別グラフに使用）。
  const getDailyCorrectRates = useCallback(
    async (dates: string[], questionIds?: string[]): Promise<DailyCorrectRate[]> => {
      const logs = await store.getAll()
      const idSet = questionIds ? new Set(questionIds) : null
      return buildDailyRates(logs, dates, idSet)
    },
    [store]
  )

  // 複数カテゴリの日別正解率をまとめて計算する版。
  // store.getAll() を1回だけ呼び、その結果を全カテゴリで使い回すことで
  // 「カテゴリ数ぶん getAll()（＝ネットワーク越しの全ログ取得）が走る」
  // 問題を解消する（NameplateQuiz.tsx の embedded グラフ表示用）。
  const getDailyCorrectRatesByCategory = useCallback(
    async (
      dates: string[],
      categoryQuestionIds: Record<string, string[] | undefined>
    ): Promise<Record<string, DailyCorrectRate[]>> => {
      const logs = await store.getAll() // ← ここが1回だけになる

      const result: Record<string, DailyCorrectRate[]> = {}
      for (const [category, questionIds] of Object.entries(categoryQuestionIds)) {
        const idSet = questionIds ? new Set(questionIds) : null
        result[category] = buildDailyRates(logs, dates, idSet)
      }
      return result
    },
    [store]
  )

  // ── デバッグ用：一切加工しない生ログをそのまま返す ──────────────
  // 「40回答したのに集計が9件」のような食い違いを調べるためのもの。
  // 作成者ページ側に生ログの件数・日付内訳・choiceIndex内訳をそのまま
  // 見せることで、①APIが本当に全件返しているか、②date文字列が
  // dateOptionsとズレていないか（タイムゾーン差など）、③わからない／
  // 未回答が想定以上に多くないか、を切り分けられるようにする。
  const debugGetAllLogs = useCallback(() => store.getAll(), [store])

  const clearLogs = useCallback(() => store.clear(), [store])

  return useMemo(
    () => ({
      logAnswer,
      getOverallStats,
      getBreakdown,
      getDailyCorrectRates,
      getDailyCorrectRatesByCategory,
      debugGetAllLogs,
      clearLogs,
    }),
    [
      logAnswer,
      getOverallStats,
      getBreakdown,
      getDailyCorrectRates,
      getDailyCorrectRatesByCategory,
      debugGetAllLogs,
      clearLogs,
    ]
  )
}
