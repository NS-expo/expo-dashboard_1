
// ── 【稼働実績】各ジョブ実行回数（日別） ─────────────
export interface DailyJobCount {
  date: string // 'MM/DD'
  jobName: string
  count: number
}

// JobSeries はここで定義せず、common.ts の定義（export * from './common'）を使う

// ── 【稼働状況】速度 / トルク / サイクルタイム等 ──────
export interface OperationMetric {
  key: string
  label: string
  unit: string
  value: number
  min: number
  max: number
  nominal: number
  
}

export interface CycleTimePoint {
  cycle: number
  seconds: number
}

// ── 銘板アイコン用出題 / 正解率 ───────────────────────

export type ThemeMode = 'light' | 'dark'

// ── 集計ページ（作成者用）用：回答ログ ────────────────

/**
 * 「わからない」を表す固定の選択肢インデックス（本人が能動的に選んだ場合）。
 * choices配列（0〜3）には含まれず、UI側（NameplateQuiz.tsx）で常に
 * 5番目の選択肢として追加される。正答率の集計（useQuizAnswerLog.ts）では
 * このインデックスのログを未回答として分母・分子から除外する。
 * NameplateQuiz.tsx / useQuizAnswerLog.ts の両方からこの定数を import して使う。
 */
export const UNKNOWN_CHOICE_INDEX = 4

/**
 * 10分間操作がなく、そのままタイムアウト（＝実質的な離脱）になった場合の
 * 選択肢インデックス。「わからない」（本人が能動的に選んだ）とは意味が
 * 違うので、作成者ページで別々に集計できるようあえて別番号にしてある。
 * UNKNOWN_CHOICE_INDEX・TIMEOUT_CHOICE_INDEX はどちらも「答えていない」
 * ことに変わりはないため、正答率（correctRate）の集計では
 * 分母・分子どちらからも除外する（useQuizAnswerLog.ts の isAnswered 参照）。
 */
export const TIMEOUT_CHOICE_INDEX = 5

/**
 * 1回の回答ログ。選択肢は choiceIndex 0-3 = choices配列のindex、
 * 4 = 「わからない」（本人が選択）、5 = 未回答（タイムアウト・離脱）を表す。
 */
export interface QuizAnswerLog {
  questionId: string
  /** 'YYYY-MM-DD' */
  date: string
  choiceIndex: number
  correct: boolean
  timestamp: number
}

/** 選択肢ごとの集計（管理ページのタグ押下時に表示） */
export interface ChoiceBreakdown {
  choiceIndex: number
  label: string
  count: number
  percent: number
  isCorrect: boolean
}

/** 日別正解率（管理ページのグラフ用） */
export interface DailyCorrectRate {
  date: string
  totalAnswered: number
  totalCorrect: number
  correctRate: number
}

/**
 * 選択肢の並び順は固定（PLC側の選択肢アドレスと対応させるため）。
 * choices[correctIndex] が正解。「わからない」は選択肢配列に含めず、
 * 固定の第5選択肢としてUI側で常に追加する。
 */
export interface NameplateQuestion {
  id: string
  videoUrl?: {
    light: string
    dark: string
  }
  /** 設問文中（「◯◯のアイコンの意味は？」の◯◯部分）に表示するアイコン画像。テーマごとに切替可能 */
  iconUrl?: {
    light: string
    dark: string
  }
  question: string
  /** 4択の選択肢テキスト（正解1つ＋不正解3つ）。表示順=この配列順 */
  choices: string[]
  correctIndex: number
  /** 正誤判定後に表示する解説文 */
  explanation: string
}

// ── テーマ・ページ共通型（旧 src/types.ts より統合） ──
export * from './common'
