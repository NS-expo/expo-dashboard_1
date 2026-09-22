// =============================================
// 型定義（テーマ・ページ共通）
// =============================================

export type ThemeKey = 'dark-exhibition' | 'dark-blue' | 'dark-red' | 'dark-green' | 'light-blue' | 'light-red' | 'light-green'

export type Theme = {
  label: string
  bg: string
  surface: string
  border: string
  text: string
  subtext: string
  accent: string
  headerBg: string
  logo: string
  qr: string
  mobile: string
}

export type PageKey = 'dashboard' | 'control' | 'anomaly'| 'quiz'

export type DataPoint = {
  time: string
  _ts: number
} & Record<string, number | string>
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
 * 「わからない」を表す固定の選択肢インデックス。
 * choices配列（0〜3）には含まれず、UI側（NameplateQuiz.tsx）で常に
 * 5番目の選択肢として追加される。正答率の集計（useQuizAnswerLog.ts）では
 * このインデックスのログを未回答として分母・分子から除外する。
 * NameplateQuiz.tsx / useQuizAnswerLog.ts の両方からこの定数を import して使う。
 */
export const UNKNOWN_CHOICE_INDEX = 4

/**
 * 1回の回答ログ。選択肢は choiceIndex 0-3 = choices配列のindex、
 * 4 = 「わからない」を表す。
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
// =============================================
// ロボットアームダッシュボード用（RobotArmDashboard）
// =============================================

/** キャンバス内の位置（% 座標, 0-100） */
export type Vec2 = {
  x: number
  y: number
}

/** カメラの点検結果（正常/異常の2値） */
export type CameraCheckStatus = '運転' | '待機' | '停止' | '異常'

/** カメラ映像1台分の状態 */
export type CameraFeed = {
  id: string
  label: string
  /** 撮影箇所（例: "正面" / "背面" / "側面"） */
  location?: string
  /** 現在の工程内容 */
  processContent?: string
  imageUrl?: string
  status?: CameraCheckStatus
  pos: Vec2   // キャンバス内の位置（% 座標）
  size: number // 表示幅（px）。高さは aspect-ratio で自動追従
  /** 完了工程数（PLCから工程完了/開始のたびに加算されるイメージ） */
  completedSteps?: number
  /** 全工程数 */
  totalSteps?: number
   /** 割り当てた物理カメラのdeviceId（getUserMediaで取得した映像デバイス） */
  deviceId?: string
  axisStream?: string 
}