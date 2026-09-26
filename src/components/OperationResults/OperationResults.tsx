import { useEffect, useMemo, useRef, useState } from 'react'
import PanelFrame from '../common/PanelFrame'
import JobFlowDiagram, { useLatchedNgSignal } from './JobFlowDiagram'
import { useIsMobile } from '../../hooks/useMediaQuery'
import type { CycleRecord } from '../../hooks/useCycleHistory'
import type { Theme } from '../../types'
import './OperationResults.css'

/** 稼働実績（異常回数・上刃挿入回数・取付実行回数・取出実行回数・検査OK/NG）の日別データ。
 *  検査回数は「OK回数＋NG回数」から算出するため、専用フィールドは持たない（円グラフ脇のラベルにのみ表示）。 */
export interface MetricPoint {
  date: string
  /** 異常回数 */
  anomalyCount: number
  /** 上刃挿入回数 */
  insertCount: number
  /** 取付実行回数 */
  tightenCount: number
  /** 取出実行回数 */
  loosenCount: number
  /** 検査OK回数 */
  okCount: number
  /** 検査NG回数 */
  ngCount: number
}

type MetricKey = Exclude<keyof MetricPoint, 'date'>

/** 日別実績（棒グラフ）専用のデータ点。PLC側が当日／1日前／2日前の値をそれぞれ別アドレスに
 *  ラッチして保持するようになったため、MetricPointのように「日ごとに1件ずつコード側で蓄積する」
 *  方式は不要（＝ラッチされておらず表示が残らない不具合の原因だった）。3件（古い→新しい）を
 *  そのまま渡すだけでよい。
 *  異常回数＝D15112(当日)／D15152(1日前)／D15194(2日前)
 *  取付実行回数＝D15114(当日)／D15154(1日前)／D15196(2日前)
 *  取出実行回数＝D15116(当日)／D15156(1日前)／D15198(2日前) */
export interface DailyMetricPoint {
  /** 表示ラベル（例: '9/22' '9/23' '9/24' のような実際の日付。'当日'などの文言ではなく
   *  日付そのものを表示する） */
  date: string
  anomalyCount: number
  tightenCount: number
  loosenCount: number
}

/** 異常回数・取付実行回数・取出実行回数の時系列推移点（横軸＝稼働時間）。
 *  データが空の間はグラフに「データ待機中…」を表示する（サンプル値は使わない）。
 *  time フィールドは元データのまま保持するが、実際の描画ラベルはPCの実時計から30分単位で
 *  機械的に再生成するため、ここでの time の値自体は表示に直接使われない（値の並び順の目印として保持）。 */
export interface HourlyTrendPoint {
  /** 時刻ラベル（例: '10:00'） */
  time: string
  anomalyCount: number
  tightenCount: number
  loosenCount: number
}

interface OperationResultsProps {
  theme: Theme
  isEditing: boolean
  /** PLCのDアドレスから受け取る現在工程ステップ値。フロー図の該当工程を強調表示します。 */
  activeStep?: number
  /** 稼働実績（異常回数・上刃挿入回数・取付実行回数・取出実行回数・検査OK/NG）の日別データ。
   *  KPIカード・OK/NG円グラフは引き続きこちら（＝D15181・D15186・D15188など、これまでどおりの
   *  最新値）を参照する。日別実績グラフ（棒グラフ）は下のdailyMetricsを参照するため対象外。 */
  metrics: MetricPoint[]
  /** 日別実績グラフ（棒グラフ、当日／1日前／2日前）専用データ。PLC側がラッチして保持している
   *  D15112〜／D15152〜／D15194〜（config/operationMetricsAddresses.ts参照）を3件そのまま渡す。
   *  未指定または空のときは「データ待機中…」を表示する。 */
  dailyMetrics?: DailyMetricPoint[]
  /** 稼働時間（秒）。usePlcCycleSignals().uptimeTotalSec（D15002時／D15004分から算出）を渡す。
   *  KPIカードに表示するのみで、日別実績の棒グラフには含めない（旧・検査回数カードの位置に表示）。 */
  operatingTimeSec?: number
  /** 取付サイクルの現在サイクルタイム（秒）。usePlcCycleSignals().tightenCycleTimeSec（D15032/15034）。 */
  tightenCycleTimeSec?: number
  /** 取付サイクルのベストサイクルタイム（秒）。usePlcCycleSignals().tightenBestCycleTimeSec（D15052/15054、PLC側で保持）。 */
  tightenBestCycleTimeSec?: number
  /** 取出サイクルの現在サイクルタイム（秒）。usePlcCycleSignals().loosenCycleTimeSec（D15036/15038）。 */
  loosenCycleTimeSec?: number
  /** 取出サイクルのベストサイクルタイム（秒）。usePlcCycleSignals().loosenBestCycleTimeSec（D15056/15058、PLC側で保持）。 */
  loosenBestCycleTimeSec?: number
  /** サイクル履歴（直近5件、発生順）。usePlcCycleSignals().cycleHistory（D15200〜／D15014〜）をそのまま渡す。 */
  cycleHistory?: CycleRecord[]
  /** PLCのNG判定信号（true = NG検出中） */
  ngSignal?: boolean
  /** 刃物画像のURL。後から差替え可能な構造にするため、固定値ではなくpropsで受け取る */
  bladeImageUrl?: string
  /** 異常回数・取付実行回数・取出実行回数の時系列推移データ（横軸＝稼働時間）。
   *  未指定または空のときは「データ待機中…」を表示する */
  hourlyTrend?: HourlyTrendPoint[]
  onEditingChange: (value: boolean) => void
}

const CHART_W = 560
const PIE_CANVAS_H = 460
const DEFAULT_PIE_R = PIE_CANVAS_H / 2 - 40
const PIE_CX = CHART_W / 2
const PIE_CY = PIE_CANVAS_H / 2

// 棒グラフ専用：3日分しかないので横に広めのアスペクト比を確保
const BAR_CHART_W = 1800
const BAR_CHART_H = 260
const BAR_PAD_L = 120
const BAR_PAD_R = 12
const BAR_PAD_B = 60
const BAR_PAD_T = 40
const CHART_AXIS_FONT_SIZE = 48

// 時系列推移グラフ（折れ線：異常回数・取付実行回数・取出実行回数）
const HOURLY_CHART_W = 1800
const HOURLY_CHART_H = 260
const HOURLY_PAD_L = 160
const HOURLY_PAD_R = 5
const HOURLY_PAD_T = 55
const HOURLY_PAD_B = 50
/** Y軸最大値の刻み幅。50→100→150…と、実データの最大値を超えるまで50刻みで切り上げる */
const HOURLY_Y_STEP = 50
/** 稼働時間推移グラフ：実際にラベル・線・マーカーを描く点数（30分間隔） */
const HOURLY_VISIBLE_POINTS = 5

/** 稼働時間がこの秒数（=0.5h）進むごとに表示範囲（直近5点）を更新する */
const HOURLY_WINDOW_UPDATE_SEC = 1800

/** グラフエリア（④）の自動切替間隔（ミリ秒） */
const CAROUSEL_INTERVAL_MS = 180000

/** サイクル履歴（⑤）：最下部ティッカーの最大表示件数 */
const CYCLE_HISTORY_DISPLAY_MAX = 5

/** KPIカード・棒グラフ共通の4指標定義（色を統一するため同じ定義を両方で使用する）。
 *  検査回数は稼働時間カードに置き換わったためここには含めない（日別の棒グラフにも表示しない）。 */
const METRIC_DEFS: { key: MetricKey; label: string; defaultColor: string }[] = [
  { key: 'anomalyCount', label: '異常回数', defaultColor: '#e0503f' },
  { key: 'insertCount', label: '上刃挿入回数', defaultColor: '#e0b04f' },
  { key: 'tightenCount', label: '取付実行回数', defaultColor: '#4fbf8f' },
  { key: 'loosenCount', label: '取出実行回数', defaultColor: '#8a7fc9' },
]

/** KPIカードとして表示する指標のキー（上刃挿入回数は稼働時間カード新設に伴いカード表示を廃止。
 *  ただし棒グラフ・色編集パネルには引き続き含める） */
const KPI_CARD_KEYS: MetricKey[] = ['anomalyCount', 'tightenCount', 'loosenCount']

/** 時系列推移グラフ（異常回数・取付実行回数・取出実行回数）の3指標定義。色はKPIカードと統一する */
const HOURLY_DEFS: { key: 'anomalyCount' | 'tightenCount' | 'loosenCount'; label: string; defaultColor: string }[] = [
  { key: 'anomalyCount', label: '異常回数', defaultColor: '#e0503f' },
  { key: 'tightenCount', label: '取付実行回数', defaultColor: '#4fbf8f' },
  { key: 'loosenCount', label: '取出実行回数', defaultColor: '#8a7fc9' },
]

/** 円グラフ（OK/NG判定割合）の2指標定義 */
const OKNG_DEFS: { key: MetricKey; label: string; defaultColor: string }[] = [
  { key: 'okCount', label: 'OK', defaultColor: '#4fbf8f' },
  { key: 'ngCount', label: 'NG', defaultColor: '#e0503f' },
]

/** サイクルタイム表示用：秒 → "HH:MM:SS" */
function formatHms(sec?: number) {
  if (sec === undefined || sec === null || sec < 0 || Number.isNaN(sec)) return '--:--:--'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}：${pad(m)}：${pad(s)}`
}
/** サイクルタイム表示用：秒 → "□□：□□"（分：秒。時は使わない前提のため省略） */
function formatMmSs(sec?: number) {
  if (sec === undefined || sec === null || sec < 0 || Number.isNaN(sec)) return '--：--'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}：${pad(s)}`
}

/** 前回タイムとの差表示用：秒 → "+3.2秒" / "-1.5秒" / "±0.0秒" / null→"--" */
function formatDiffSec(diff: number | null) {
  if (diff === null) return '--'
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '±'
  return `${sign}${Math.abs(diff).toFixed(1)}秒`
}

/** 稼働時間カード表示用：秒 → "○h○min"（時・分）。
 *  PLC側がD15002(時)・D15004(分)を別々に持っているのに合わせた表記。 */
function formatOperatingTime(sec?: number) {
  if (sec === undefined || sec === null || sec < 0 || Number.isNaN(sec)) {
    return '--h--min'
  }
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${h}h${m}min`
}

/** 指定した時刻を30分単位に切り捨てて "HH:MM" ラベルを返す。
 *  stepsBack を渡すと、そこから30分刻みで遡ったラベルを返す（直近点から過去方向へ生成する用途）。
 *  これにより、元データ（PLCの記録タイミング）が多少ずれていても、横軸ラベルは必ず :00 か :30 になる。 */
function roundToHalfHourLabel(date: Date, stepsBack = 0): string {
  const totalMinutes = date.getHours() * 60 + date.getMinutes()
  const roundedMinutes = Math.floor(totalMinutes / 30) * 30 - stepsBack * 30
  const normalized = ((roundedMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}`
}

function computeMaxCount(values: number[][]): number {
  const allValues = values.flat()
  const max = Math.max(...allValues, 0)
  const padded = max + 5
  return Math.max(Math.round(padded / 10) * 10, 10)
}

/** 時系列推移グラフのY軸最大値：50スタートで、実データの最大値を超えるまで50刻みで切り上げる
 *  （50→100→150→200…）。戻り値は必ずHOURLY_Y_STEPの倍数。 */
function computeHourlyMaxY(values: number[][]): number {
  const max = Math.max(...values.flat(), 0)
  return Math.max(Math.ceil(max / HOURLY_Y_STEP) * HOURLY_Y_STEP, HOURLY_Y_STEP)
}

/** 目盛りポイント数：Y軸最大値の水準に関わらず3ポイント（0・中間・最大）に統一する */
const HOURLY_GRID_LINES = 2

interface ChartItem {
  id: string
  label: string
  color: string
  values: number[]
}

export default function OperationResults({
  theme,
  isEditing,
  activeStep,
  metrics,
  dailyMetrics,
  operatingTimeSec,
  tightenCycleTimeSec,
  tightenBestCycleTimeSec,
  loosenCycleTimeSec,
  loosenBestCycleTimeSec,
  ngSignal,
  bladeImageUrl,
  hourlyTrend,
  cycleHistory,
  onEditingChange,
}: OperationResultsProps) {
  const isMobile = useIsMobile()
  const [customColors, setCustomColors] = useState<Record<string, string>>({})

  /** 刃物交換（NG時のみ発生する工程）の間、NG判定信号が瞬間値のため一旦falseに戻っても
   *  OK側の見た目に戻ってしまわないよう、JobFlowDiagram側と同じルールでラッチする。
   *  刃物交換の次工程に入った時点でラッチは解除される。 */
  const latchedNgSignal = useLatchedNgSignal(activeStep, ngSignal)

  /** グラフエリア統合（④）：日別実績／稼働時間推移（異常・取付・取出）を一定間隔で自動切替する */
  const [carouselIndex, setCarouselIndex] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselIndex((i) => (i + 1) % 2)
    }, CAROUSEL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  /** サイクル履歴（⑤）。PLC側が直近5件を保持するようになったため、算出は呼び出し元
   *  （usePlcCycleSignals）で行い、ここでは整形済みの配列を受け取るだけにしている。 */
  const history = cycleHistory ?? []

  /** 新規追加された行だけにスライドインアニメーションを付ける */
  const [flashNo, setFlashNo] = useState<number | null>(null)
  const prevLenRef = useRef(history.length)
  useEffect(() => {
    if (history.length > prevLenRef.current) {
      const latest = history[history.length - 1]
      setFlashNo(latest.no)
      const t = window.setTimeout(() => setFlashNo(null), 500)
      prevLenRef.current = history.length
      return () => window.clearTimeout(t)
    }
    prevLenRef.current = history.length
  }, [history])

  /** No.・前回差分の算出は発生順（古い→新しい）のまま行い、表示直前だけ新しい順に並べ替える
   *  （最新の記録を一番上に表示するため）。 */
  const displayedHistory = history.slice(-CYCLE_HISTORY_DISPLAY_MAX).slice().reverse()

  /** モニタごとの実高さの違いに自動追従して、コンテンツ全体を「はみ出さない最大サイズ」にスケールする */
  const scaleOuterRef = useRef<HTMLDivElement | null>(null)
  const scaleInnerRef = useRef<HTMLDivElement | null>(null)
  const [contentScale, setContentScale] = useState(1)
  const [contentStageHeight, setContentStageHeight] = useState(0)

  const latest = metrics.at(-1)

  /** 日別実績（棒グラフ）：当日／1日前／2日前の3件固定。PLC側でラッチ済みのためコード側での
   *  蓄積は不要（dailyMetricsをそのまま使う。未指定なら空配列＝「データ待機中…」表示）。 */
  const dailyData = dailyMetrics ?? []
  const dailyDates = dailyData.map((m) => m.date)
  const dailyItems: ChartItem[] = useMemo(
    () =>
      HOURLY_DEFS.map((def) => ({
        id: def.key,
        label: def.label,
        color: customColors[def.key] ?? def.defaultColor,
        values: (dailyMetrics ?? []).map((m) => m[def.key]),
      })),
    [dailyMetrics, customColors]
  )
  const dailyGroupW = (BAR_CHART_W - BAR_PAD_L - BAR_PAD_R) / Math.max(dailyDates.length, 1)
  const dailyBarW = Math.min(60, dailyGroupW / (dailyItems.length + 1))
  const dailyMaxCount = computeMaxCount(dailyItems.map((it) => it.values))

  const kpiItems: ChartItem[] = useMemo(
    () =>
      METRIC_DEFS.map((def) => ({
        id: def.key,
        label: def.label,
        color: customColors[def.key] ?? def.defaultColor,
        values: metrics.map((m) => m[def.key]),
      })),
    [metrics, customColors]
  )

  const okNgItems: ChartItem[] = useMemo(
    () =>
      OKNG_DEFS.map((def) => ({
        id: def.key,
        label: def.label,
        color: customColors[def.key] ?? def.defaultColor,
        values: metrics.map((m) => m[def.key]),
      })),
    [metrics, customColors]
  )

  const plotH = BAR_CHART_H - BAR_PAD_T - BAR_PAD_B
  const gridLines = 2

  const okNgTotals = useMemo(
    () => okNgItems.map((it) => ({ ...it, total: it.values.reduce((sum, v) => sum + v, 0) })),
    [okNgItems]
  )
  const inspectTotal = okNgTotals.reduce((sum, it) => sum + it.total, 0)
  const grandTotal = Math.max(inspectTotal, 1)

  /** 稼働時間推移（④の折れ線グラフ）：
   *  ・実データ（hourlyTrend、30分間隔で蓄積される想定）から直近5点だけを表示範囲として切り出す
   *  ・データが空のときはダミー点も作らず空配列を返す（「データ待機中…」表示）
   *  ・稼働時間（operatingTimeSec）が0.5h進むごとにこの範囲を更新する（30分未満の変化では再計算しない）
   *  ・横軸ラベルは元データの time をそのまま使わず、PCの実時計を30分単位に切り捨てて機械的に
   *    再生成する（:00 / :30 に必ず乗せるため。稼働時間ベースではなく実時間ベース）
   *  ・末尾に非表示のダミー点を1点追加し、6点分の間隔で描画することで5点目のラベルが画面端で
   *    見切れるのを防ぐ（ダミー点自体・そこへの線分・マーカーは描画しない） */
  const hourlyWindowIndex =
    operatingTimeSec !== undefined ? Math.floor(operatingTimeSec / HOURLY_WINDOW_UPDATE_SEC) : undefined

  const hourlyData = useMemo(() => {
    const source = hourlyTrend ?? []
    const visible = source.slice(-HOURLY_VISIBLE_POINTS)
    if (visible.length === 0) return []

    const now = new Date()
    const labeled = visible.map((p, i) => ({
      ...p,
      time: roundToHalfHourLabel(now, visible.length - 1 - i),
    }))

    // 常に末尾へ余白確保用のダミー(time: '')を1点追加する。
    // 実点1〜4点の間はスロット数もそれに応じて2〜5に伸び、5点そろって初めて
    // 6スロット（実点5＋ダミー1）で固定される。
    return [...labeled, { ...labeled[labeled.length - 1], time: '' }]
  }, [hourlyTrend, hourlyWindowIndex])

  const hourlyItems: ChartItem[] = useMemo(
    () =>
      HOURLY_DEFS.map((def) => ({
        id: def.key,
        label: def.label,
        color: customColors[def.key] ?? def.defaultColor,
        values: hourlyData.map((p) => p[def.key]),
      })),
    [hourlyData, customColors]
  )
  const hourlyPlotW = HOURLY_CHART_W - HOURLY_PAD_L - HOURLY_PAD_R
  const hourlyPlotH = HOURLY_CHART_H - HOURLY_PAD_T - HOURLY_PAD_B
  const hourlyMaxY = computeHourlyMaxY(hourlyItems.map((it) => it.values))
  const hourlyGridLines = HOURLY_GRID_LINES
  const hourlyXAt = (i: number) => HOURLY_PAD_L + (hourlyPlotW / Math.max(hourlyData.length - 1, 1)) * i
  const hourlyYAt = (v: number) =>
    HOURLY_PAD_T + hourlyPlotH - (Math.min(Math.max(v, 0), hourlyMaxY) / hourlyMaxY) * hourlyPlotH
  const hourlySeries = hourlyItems.map((it) => {
    const points = it.values.map((v, i) => ({
      x: hourlyXAt(i),
      y: hourlyYAt(v),
      time: hourlyData[i].time,
      value: v,
    }))
    return {
      ...it,
      points,
      // ダミーはtime: ''で判別。常に末尾1点だけを除外する
      visiblePoints: points.filter((p) => p.time !== ''),
    }
  })

  const handleColorChange = (id: string, color: string) => {
    setCustomColors((prev) => ({ ...prev, [id]: color }))
  }

  const handleResetColors = () => setCustomColors({})

  useEffect(() => {
    const outer = scaleOuterRef.current
    const inner = scaleInnerRef.current
    if (!outer || !inner) return

    let frame = 0
    const recompute = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const availableH = outer.clientHeight
        const naturalH = inner.offsetHeight
        if (availableH <= 0 || naturalH <= 0) return
        // モバイルは表示内容が多く、フォントが小さくなっても1画面に収めることを優先するため、
        // 下限スケールをデスクトップ（0.55）よりも大幅に低く設定する
        const next = Math.min(Math.max(availableH / naturalH, isMobile ? 0.32 : 0.55), 1.6)
        setContentScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev))
        const nextStageHeight = Math.max(availableH, naturalH * next)
        setContentStageHeight((prev) =>
          Math.abs(prev - nextStageHeight) > 1 ? nextStageHeight : prev,
        )
      })
    }

    const ro = new ResizeObserver(recompute)
    ro.observe(outer)
    ro.observe(inner)
    recompute()

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [
    metrics,
    dailyMetrics,
    activeStep,
    ngSignal,
    latchedNgSignal,
    isMobile,
    operatingTimeSec,
    tightenCycleTimeSec,
    tightenBestCycleTimeSec,
    loosenCycleTimeSec,
    loosenBestCycleTimeSec,
    hourlyTrend,
    carouselIndex,
    displayedHistory.length,
  ])

  /** サイクルタイム（取付／取出）：2枚のカードを横並びにし、各カード内はサイクル対象名／BESTタイム／
   *  現在タイムを縦に3行で表示する。棒グラフの色分けと混同しないよう色は付けず、BESTタイムのみ強調色・
   *  やや小さめのフォントで表示する（"BEST"の文字はさらに一段小さく）。
   *  取付／取出それぞれのサイクルタイム・ベストタイムはD15032〜／D15052〜（config/cycleAddresses.ts）
   *  でPLCから確定アドレスが取れるようになったため、フォールバックは廃止した。 */
  const cycleTimeSection = (
    <div className="op-results__cycletime-section">
      <span className="op-results__cycletime-heading" style={{ color: theme.subtext }}>
        サイクルタイム
      </span>
      <div className="op-results__cycletime-cards">
        <div
          className="op-results__cycletime-card"
          style={{
            border: `1px solid ${theme.border}`,
            background: theme.headerBg,
          }}
        >
          <span className="op-results__cycletime-name" style={{ color: theme.text }}>
            取付
          </span>
          <span className="op-results__cycletime-best" style={{ color: theme.accent }}>
            <span className="op-results__cycletime-best-label">BEST</span>
            {formatHms(tightenBestCycleTimeSec)}
          </span>
          <span className="op-results__cycletime-current" style={{ color: theme.text }}>
            {formatHms(tightenCycleTimeSec)}
          </span>
        </div>
        <div
          className="op-results__cycletime-card"
          style={{
            border: `1px solid ${theme.border}`,
            background: theme.headerBg,
          }}
        >
          <span className="op-results__cycletime-name" style={{ color: theme.text }}>
            取出
          </span>
          <span className="op-results__cycletime-best" style={{ color: theme.accent }}>
            <span className="op-results__cycletime-best-label">BEST</span>
            {formatHms(loosenBestCycleTimeSec)}
          </span>
          <span className="op-results__cycletime-current" style={{ color: theme.text }}>
            {formatHms(loosenCycleTimeSec)}
          </span>
        </div>
      </div>
    </div>
  )

  /** 稼働時間カード：旧・検査回数カードの位置に表示。日別実績の棒グラフには含めない。表示形式は「○h○min」。 */
  const operatingTimeCard = (
    <div className="op-results__kpi-card" style={{ borderLeftColor: theme.border, background: theme.headerBg }}>
      <span className="op-results__kpi-label" style={{ color: theme.subtext }}>
        稼働時間
      </span>
      <span className="op-results__kpi-value-wrap">
        <span className="op-results__kpi-value" style={{ color: theme.text }}>
          {formatOperatingTime(operatingTimeSec)}
        </span>
      </span>
    </div>
  )

  /** KPIカード（②）：稼働時間・異常回数・取付実行回数・取出実行回数＋サイクルタイム（取付／取出）を縦配置。
   *  色は棒グラフと統一し、異常回数のみ常時うっすら赤みを付ける。上刃挿入回数はカード表示を廃止（棒グラフ・
   *  色編集パネルには残す）。カードが2枚減った分、各カードの高さを広げてよい。 */
  const kpiColumn = (
    <div className="op-results__kpi-col">
      {operatingTimeCard}
      {kpiItems
        .filter((it) => KPI_CARD_KEYS.includes(it.id as MetricKey))
        .map((it) => (
          <div
            key={it.id}
            className={`op-results__kpi-card${it.id === 'anomalyCount' ? ' op-results__kpi-card--anomaly' : ''}`}
            style={{ borderLeftColor: it.color, background: theme.headerBg }}
          >
            <span className="op-results__kpi-label" style={{ color: theme.subtext }}>
              {it.label}
            </span>
            <span className="op-results__kpi-value-wrap">
              <span className="op-results__kpi-value" style={{ color: theme.text }}>
                {latest?.[it.id as MetricKey] ?? '--'}
              </span>
              <span className="op-results__kpi-unit" style={{ color: theme.subtext }}>
                回
              </span>
            </span>
          </div>
        ))}
      {cycleTimeSection}
    </div>
  )

  /** モバイル専用：横スクロールKPI・ドーナツ・棒/折れ線グラフは廃止し、
   *  検査系の各回数・OK/NG回数・現在の稼働率を、全体フローと同じ「ボックス」形式で縦に積んで表示する。
   *  （幅が途切れる横スクロールや、読み取りにくいグラフを避けるための簡易表示） */
  const mobileStatsList = (
    <div className="op-results__kpi-col">
      {operatingTimeCard}
      {kpiItems
        .filter((it) => KPI_CARD_KEYS.includes(it.id as MetricKey))
        .map((it) => (
          <div
            key={it.id}
            className={`op-results__kpi-card${it.id === 'anomalyCount' ? ' op-results__kpi-card--anomaly' : ''}`}
            style={{ borderLeftColor: it.color, background: theme.headerBg }}
          >
            <span className="op-results__kpi-label" style={{ color: theme.subtext }}>
              {it.label}
            </span>
            <span className="op-results__kpi-value-wrap">
              <span className="op-results__kpi-value" style={{ color: theme.text }}>
                {latest?.[it.id as MetricKey] ?? '--'}
              </span>
              <span className="op-results__kpi-unit" style={{ color: theme.subtext }}>
                回
              </span>
            </span>
          </div>
        ))}
      {okNgTotals.map((it) => (
        <div key={it.id} className="op-results__kpi-card" style={{ borderLeftColor: it.color, background: theme.headerBg }}>
          <span className="op-results__kpi-label" style={{ color: theme.subtext }}>
            {it.label}
          </span>
          <span className="op-results__kpi-value-wrap">
            <span className="op-results__kpi-value" style={{ color: theme.text }}>
              {it.total}
            </span>
            <span className="op-results__kpi-unit" style={{ color: theme.subtext }}>
              回
            </span>
          </span>
        </div>
      ))}
      <div className="op-results__kpi-card" style={{ borderLeftColor: theme.border, background: theme.headerBg }}>
        <span className="op-results__kpi-label" style={{ color: theme.subtext }}>
          検査回数
        </span>
        <span className="op-results__kpi-value-wrap">
          <span className="op-results__kpi-value" style={{ color: theme.text }}>
            {inspectTotal}
          </span>
          <span className="op-results__kpi-unit" style={{ color: theme.subtext }}>
            回
          </span>
        </span>
      </div>
      {cycleTimeSection}
    </div>
  )

  /** OK/NG判定割合（ドーナツ）＋刃物画像（③）。NG時はボックス全体を赤色点滅させ、即座に異常を認識できるようにする。 */
  const okNgAndBlade = (
    <div className={`op-results__okng-col${latchedNgSignal ? ' op-results__okng-col--ng' : ''}`}>
      <svg
        className="op-results__okng-chart"
        viewBox={`0 0 ${CHART_W} ${PIE_CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="検査OK/NG判定割合の円グラフ"
      >
        <circle cx={PIE_CX} cy={PIE_CY} r={DEFAULT_PIE_R} fill="none" stroke={theme.border} strokeWidth={Math.max(DEFAULT_PIE_R * 0.42, 12)} opacity={0.4} />
        <g transform={`rotate(-90 ${PIE_CX} ${PIE_CY})`}>
          {(() => {
            const ringWidth = Math.max(DEFAULT_PIE_R * 0.42, 12)
            const circumference = 2 * Math.PI * DEFAULT_PIE_R
            let cumulative = 0
            return okNgTotals.map((it) => {
              const pct = it.total / grandTotal
              const dash = pct * circumference
              const el = (
                <circle
                  key={it.id}
                  cx={PIE_CX}
                  cy={PIE_CY}
                  r={DEFAULT_PIE_R}
                  fill="none"
                  stroke={it.color}
                  strokeWidth={ringWidth}
                  strokeDasharray={`${dash} ${Math.max(circumference - dash, 0)}`}
                  strokeDashoffset={-cumulative}
                  strokeLinecap={okNgTotals.length > 1 ? 'butt' : 'round'}
                />
              )
              cumulative += dash
              return el
            })
          })()}
        </g>
        {(() => {
          const okItem = okNgTotals.find((it) => it.id === 'okCount')
          const okPct = grandTotal > 0 ? Math.round(((okItem?.total ?? 0) / grandTotal) * 100) : 0
          return (
            <text x={PIE_CX} y={PIE_CY} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(DEFAULT_PIE_R * 0.42, 22)} fontWeight={700} fill={theme.text}>
              {okPct}%
            </text>
          )
        })()}
      </svg>
      <div className="op-results__okng-legend">
        {okNgTotals.map((it) => {
          const pct = grandTotal > 0 ? Math.round((it.total / grandTotal) * 100) : 0
          return (
            <span key={it.id} className="op-results__okng-legend-item" style={{ color: theme.subtext }}>
              <span className="op-results__swatch" style={{ background: it.color }} />
              {it.label}：{it.total}回（{pct}%）
            </span>
          )
        })}
      </div>
      {/* 検査回数＝OK回数＋NG回数。専用カード・円グラフ内の区分は設けず、ラベルのみ legend の下に表示する */}
      <span className="op-results__okng-inspect-total" style={{ color: theme.subtext }}>
        検査回数：{inspectTotal}回
      </span>

      {!isMobile && (
        <div className="op-results__blade-frame" style={{ borderColor: theme.border }}>
          {bladeImageUrl ? <img src={bladeImageUrl} alt="刃物画像" /> : (
            <span style={{ color: theme.subtext, fontSize: 20 }}>刃物画像未設定</span>
          )}
        </div>
      )}
    </div>
  )

  /** グラフエリア統合（④）：日別実績（棒グラフ）と稼働時間推移（異常回数・取付実行回数・取出実行回数の折れ線）を
   *  一定間隔で自動切替。傾向把握が目的のため、棒の上の数値ラベルは表示しない（折れ線側は凡例のみ表示）。
   *  データ未受信の間は、枠と目盛りを残したまま中央に「データ待機中…」を表示する。 */
  const graphCarousel = (
    <div className="op-results__graph-carousel">
      <div className="op-results__graph-carousel-head">
        <span className="op-results__graph-carousel-title" style={{ color: theme.text }}>
          {carouselIndex === 0 ? '日別実績' : '稼働時間推移（異常・取付・取出）'}
        </span>
        <span className="op-results__graph-carousel-dots">
          <span className={`op-results__graph-carousel-dot${carouselIndex === 0 ? ' op-results__graph-carousel-dot--active' : ''}`} style={{ background: theme.accent }} />
          <span className={`op-results__graph-carousel-dot${carouselIndex === 1 ? ' op-results__graph-carousel-dot--active' : ''}`} style={{ background: theme.accent }} />
        </span>
      </div>
      <div className="op-results__graph-carousel-body">
        {carouselIndex === 0 ? (
          <svg
            className="op-results__chart"
            viewBox={`0 0 ${BAR_CHART_W} ${BAR_CHART_H}`}
            preserveAspectRatio="xMinYMin meet"
            role="img"
            aria-label="日別稼働実績の棒グラフ"
            style={{ background: theme.surface }}
          >
            {Array.from({ length: gridLines + 1 }).map((_, i) => {
              const y = BAR_PAD_T + (plotH / gridLines) * i
              const value = Math.round(dailyMaxCount - (dailyMaxCount / gridLines) * i)
              return (
                <g key={i}>
                  <line x1={BAR_PAD_L} x2={BAR_CHART_W - 10} y1={y} y2={y} stroke={theme.border} strokeWidth={1} opacity={0.6} />
                  <text x={BAR_PAD_L - 8} y={y + 3} textAnchor="end" fontSize={CHART_AXIS_FONT_SIZE} fill={theme.subtext}>
                    {value}
                  </text>
                </g>
              )
            })}
            {dailyDates.length === 0 && (
              <text
                x={BAR_CHART_W / 2}
                y={BAR_CHART_H / 2}
                textAnchor="middle"
                fontSize={CHART_AXIS_FONT_SIZE}
                fill={theme.subtext}
              >
                データ待機中…
              </text>
            )}
            {dailyDates.map((date, dIdx) => {
              const groupX = BAR_PAD_L + dailyGroupW * dIdx
              return (
                <g key={date}>
                  <text
                    x={groupX + dailyGroupW / 2}
                    y={BAR_CHART_H - 10}
                    textAnchor="middle"
                    fontSize={CHART_AXIS_FONT_SIZE}
                    fill={theme.subtext}
                  >
                    {date}
                  </text>
                  {dailyItems.map((it, sIdx) => {
                    const count = it.values[dIdx] ?? 0
                    const barH = (count / dailyMaxCount) * plotH
                    const x = groupX + (dailyGroupW - dailyItems.length * dailyBarW) / 2 + sIdx * dailyBarW
                    const y = BAR_PAD_T + plotH - barH
                    return (
                      <rect key={it.id} x={x} y={y} width={dailyBarW - 10} height={barH} rx={1.5} fill={it.color} opacity={dIdx === dailyDates.length - 1 ? 1 : 0.72}>
                        <title>{`${date} ${it.label}: ${count}回`}</title>
                      </rect>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        ) : (
          <svg
            className="op-results__chart"
            viewBox={`0 0 ${HOURLY_CHART_W} ${HOURLY_CHART_H}`}
            preserveAspectRatio="xMinYMin meet"
            role="img"
            aria-label="稼働時間ごとの異常回数・取付実行回数・取出実行回数の推移グラフ"
            style={{ background: theme.surface }}
          >
            {Array.from({ length: hourlyGridLines + 1 }).map((_, i) => {
              const value = Math.round((hourlyMaxY / hourlyGridLines) * i)
              const y = hourlyYAt(value)
              return (
                <g key={i}>
                  <line x1={HOURLY_PAD_L} x2={HOURLY_CHART_W - HOURLY_PAD_R} y1={y} y2={y} stroke={theme.border} strokeWidth={1} opacity={0.6} />
                  <text x={HOURLY_PAD_L - 8} y={y + 3} textAnchor="end" fontSize={CHART_AXIS_FONT_SIZE} fill={theme.subtext}>
                    {value}
                  </text>
                </g>
              )
            })}
            {hourlyData.length === 0 && (
              <text
                x={HOURLY_CHART_W / 2}
                y={HOURLY_CHART_H / 2}
                textAnchor="middle"
                fontSize={CHART_AXIS_FONT_SIZE}
                fill={theme.subtext}
              >
                データ待機中…
              </text>
            )}
            {hourlyData.map((p, i) => (
              <text
                key={`${p.time}-${i}`}
                x={hourlyXAt(i)}
                y={HOURLY_CHART_H - 8}
                textAnchor="middle"
                fontSize={CHART_AXIS_FONT_SIZE}
                fill={theme.subtext}
                opacity={p.time === '' ? 0 : 1}
              >
                {p.time}
              </text>
            ))}
            {hourlySeries.map((s) => (
              <g key={s.id}>
                <polyline points={s.visiblePoints.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={s.color} strokeWidth={3} />
                {s.visiblePoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={4} fill={s.color}>
                    <title>{`${p.time} ${s.label}: ${p.value}回`}</title>
                  </circle>
                ))}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  )

  /** サイクル履歴（グラフのすぐ下にボックス表示・最大5件・新規は下からスライドイン）
   *  ベスト／現在サイクルタイムはKPIカード側に統合済みのため、ここは履歴表のみ */
  const cycleSection = (
    <div className={`op-results__cycle-history${isMobile ? ' op-results__cycle-history--mobile' : ''}`}>
      <span className="op-results__cycle-history-title" style={{ color: theme.text }}>
        サイクル履歴
      </span>
      <table className="op-results__cycle-history-table">
        <thead>
          <tr style={{ color: theme.subtext }}>
            <th>No.</th>
            <th>開始時刻</th>
            <th>終了時刻</th>
            <th>サイクルタイム</th>
            <th>前回との差</th>
          </tr>
        </thead>

        <tbody>
          {displayedHistory.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: theme.subtext }}>
                データ収集中…
              </td>
            </tr>
          )}
          {displayedHistory.map((rec) => (
            <tr key={rec.no} className={rec.no === flashNo ? 'op-results__cycle-history-row--enter' : undefined} style={{ color: theme.text }}>
              <td>{rec.no}</td>
              <td>{rec.startTime}</td>
              <td>{rec.endTime}</td>
              <td>{formatMmSs(rec.cycleTimeSec)}</td>
              <td>{formatDiffSec(rec.diffFromPrevSec)}</td>
            </tr>
          ))}
          {/* 履歴件数が5件未満の間、テーブルの高さが変動して全体の自動縮小(contentScale)に
              影響しないよう、不足分を非表示の空行で埋めて常に5行分の高さを確保する */}
          {displayedHistory.length > 0 &&
            Array.from({ length: CYCLE_HISTORY_DISPLAY_MAX - displayedHistory.length }).map((_, i) => (
              <tr key={`filler-${i}`} style={{ visibility: 'hidden' }} aria-hidden="true">
                <td>-</td>
                <td>--:--</td>
                <td>--:--</td>
                <td>--:--</td>
                <td>-</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <PanelFrame className="op-results">
      <div className="op-results__body">
        <div className="op-results__main-col">
          <div className="op-results__scale-outer" ref={scaleOuterRef}>
            <div
              className="op-results__scale-stage"
              style={contentStageHeight > 0 ? { height: `${contentStageHeight}px` } : undefined}
            >
              <div
                className="op-results__scale-inner"
                ref={scaleInnerRef}
                style={{
                  transform: `scale(${contentScale})`,
                  width: contentScale !== 1 ? `${100 / contentScale}%` : '100%',
                }}
              >
                {isMobile ? (
                <>
                  {/* モバイル：フローは簡易ボックス表示、各回数・OK/NG・稼働率も同じボックス形式で縦積み
                      （横スクロールKPIやドーナツ／棒・折れ線グラフは可読性のため廃止）。
                      サイクル履歴も含めて全てスケール対象に含めることで、内容量が多い場合でも
                      1画面に収まるよう自動的に縮小される（フォントサイズは小さくなってよい）。 */}
                  <JobFlowDiagram theme={theme} activeStep={activeStep} ngSignal={ngSignal} />
                  {mobileStatsList}
                  <div className="op-results__cycle-wrap">{cycleSection}</div>
                </>
              ) : (
                <>
                  {/* ①ロボットフロー（中央上段）／②KPI＋サイクルタイム（左・全高）／
                      ③OK/NG＋刃物（右・全高）／④グラフ＋サイクル履歴（中央下段・縦積み） */}
                  <div className="op-results__top-grid">
                    {kpiColumn}
                    <div className="op-results__flow-col">
                      <JobFlowDiagram theme={theme} activeStep={activeStep} ngSignal={ngSignal} />
                    </div>
                    {/* グラフの直下にサイクル履歴をボックス表示し、グラフ下の余白をそのまま履歴に充てる */}
                    <div className="op-results__graph-history-col">
                      {graphCarousel}
                      {cycleSection}
                    </div>
                    {okNgAndBlade}
                  </div>
                </>
                )}
              </div>
            </div>
          </div>
        </div>

        {isEditing && !isMobile && (
          <div className="op-results__edit-panel" style={{ background: theme.headerBg, borderColor: theme.border }}>
            <div className="op-results__edit-panel-scroll">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '20px', color: theme.text }}>編集モード</span>
                <label className={`toggle-switch${isEditing ? ' toggle-switch--on' : ''}`}>
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={isEditing}
                    onChange={(e) => onEditingChange(e.target.checked)}
                    aria-label="編集モードの切替"
                  />
                  <span className="toggle-switch__track" style={{ background: isEditing ? theme.accent : theme.border }}>
                    <span className="toggle-switch__thumb" />
                  </span>
                </label>
                <span style={{ fontSize: '20px', color: theme.text }}>{isEditing ? 'ON' : 'OFF'}</span>
              </div>

              <section className="op-results__panel-section">
                <h3 style={{ color: theme.text }}>色（KPIカード／ロボットモニタ共通）</h3>
                <div className="op-results__edit-group">
                  {kpiItems.map((it) => (
                    <label key={it.id} className="op-results__color-row">
                      <span className="op-results__color-row-label" style={{ color: theme.subtext }}>{it.label}</span>
                      <input className="op-results__color-input" type="color" value={it.color} onChange={(e) => handleColorChange(it.id, e.target.value)} />
                    </label>
                  ))}
                </div>
              </section>

              <section className="op-results__panel-section">
                <h3 style={{ color: theme.text }}>色（OK/NG判定割合）</h3>
                <div className="op-results__edit-group">
                  {okNgItems.map((it) => (
                    <label key={it.id} className="op-results__color-row">
                      <span className="op-results__color-row-label" style={{ color: theme.subtext }}>{it.label}</span>
                      <input className="op-results__color-input" type="color" value={it.color} onChange={(e) => handleColorChange(it.id, e.target.value)} />
                    </label>
                  ))}
                  <button type="button" className="op-results__color-reset" style={{ borderColor: theme.border, color: theme.subtext }} onClick={handleResetColors}>
                    色をリセット
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
