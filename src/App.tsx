// App.tsx（変更なし。参考として全文）
import { useState, useRef, useEffect,useMemo } from 'react'
import './App.css'
import type { ThemeKey, PageKey, NameplateQuestion } from './types'
import { THEMES, PAGES, getThemeMode } from './components/common/themes'
import Sidebar, { SIDEBAR_WIDTH } from './components/common/Sidebar'
import SettingsPanel from './components/common/SettingsPanel'
import OperationResults, { type MetricPoint } from './components/OperationResults/OperationResults'
import RobotArmDashboard, { type CameraStatus } from './components/RobotArmDashboard/RobotArmDashboard'
import OperationStatus from './components/OperationStatus/OperationStatus'
import NameplateQuiz from './components/NameplateQuiz/NameplateQuiz'
import LiveClock from './components/OperationStatus/LiveClock'
import { usePlcWebSocket } from './hooks/usePlcWebSocket'
import { useIsMobile } from './hooks/useMediaQuery'
import { usePlcRobotStatusSignals } from './hooks/usePlcRobotStatusSignals'
import { usePlcOperationMetricsSignals } from './hooks/usePlcOperationMetricsSignals'
import { useOperationHourlyTrend } from './hooks/useOperationHourlyTrend'
import { usePlcJobFlowSignals, JOB_FLOW_ADDRESSES } from './hooks/usePlcJobFlowSignals'
import { usePlcRbFlowSignals, RB_FLOW_ADDRESSES } from './hooks/usePlcRbFlowSignals'
import { usePlcCycleSignals } from './hooks/usePlcCycleSignals'
import { OPERATION_METRICS_ADDRESSES, DAILY_METRICS_ADDRESSES } from './config/operationMetricsAddresses'
import { usePlcDailyMetricsSignals } from './hooks/usePlcDailyMetricsSignals'
import { CYCLE_ADDRESSES } from './config/cycleAddresses'
import { getRecentDates, METRIC_DAYS } from './utils/dateRange'
import { ALL_ROBOT_STATUS_ADDRESSES } from './config/robotStatusAddresses'
import PlcConnectionIcon from './components/common/PlcConnectionIcon'
import { usePlcConnectionStatus } from './hooks/usePlcConnectionStatus'
import { usePlcRunStatusSignals, RUN_STATUS_ADDRESSES } from './hooks/usePlcRunStatusSignals'

const SHARED_ROBOT_IMAGE_URL = '/NS-Q3.png'

// 速度はPLC対象外のためサンプル値のまま。トルク・ピーク値・稼働率はPLC(Dレジスタ、未定)から取得予定で、
// アドレス確定までのフォールバックとしてここに仮の値を置いている（config/robotStatusAddresses.ts 参照）

const SAMPLE_RB1_UTILIZATION = 92
const SAMPLE_RB2_UTILIZATION = 88

// サイクルタイムはジョブ別・ロボット別ではなく、A・B合算の1つの値として扱う
const cycleTime = 4.4

// 銘板クイズ（quizページ）用データ
// choices[0] が正解（correctIndex: 0）。「わからない」は各問共通の固定第5選択肢
// としてNameplateQuiz側で自動的に追加される。
const sampleQuestions: NameplateQuestion[] = [
  {
    id: '1',
    question: 'のアイコンの意味は？',
    choices: ['運転合図', '高速運転', '低速運転', '寸動運転'],
    correctIndex: 0,
    explanation: '運転開始の合図で周りに運転することを知らせます。',
    videoUrl: {
      light: 'run buzzer.png',
      dark: 'run buzzer.png'
    },
    iconUrl: {
      light: 'buzzer_light.png',
      dark: 'buzzer.png'
    }
  },
  {
    id: '2',
    question: 'のアイコンの意味は？',
    choices: ['停止', '緊急停止', '低速運転', '高速運転'],
    correctIndex: 0,
    explanation: '減速しながら機械を停止させます。',
    videoUrl: {
      light: '停止.png',
      dark: '停止.png'
    },
    iconUrl: {
      light: 'stop_light.png',
      dark: 'stop.png'
    }
  },
  {
    id: '3',
    question: 'のアイコンの意味は？',
    choices: ['エラーリセット', '緊急停止', 'ブザーリセット', '設定値初期化'],
    correctIndex: 0,
    explanation: '異常状態をリセットします。',
    videoUrl: {
      light: 'エラーリセット.png',
      dark: 'エラーリセット.png'
    },
    iconUrl: {
      light: 'error reset_light.png',
      dark: 'error reset.png'
    }
  },
  {
    id: '4',
    question: 'のアイコンの意味は？',
    choices: ['カウンタリセット', 'パスワード入力', 'ブザーリセット', 'カウントアップ'],
    correctIndex: 0,
    explanation: 'カウントされていた値を0にリセットします。',
    videoUrl: {
      light: 'カウンタリセット.png',
      dark: 'カウンタリセット.png'
    },
    iconUrl: {
      light: 'counter reset_light.png',
      dark: 'counter reset.png'
    }
  },
]

// URLの ?page=xxx を読み取り、4分割パネルごとに違う初期ページを開けるようにする
// 例）
//   .../?page=dashboard  → RobotArmDashboard
//   .../?page=control    → OperationResults
//   .../?page=anomaly    → OperationStatus
//   .../?page=quiz       → NameplateQuiz
// パラメータが無い/不正な場合は従来どおり 'dashboard' にフォールバックする
function getInitialPage(): PageKey {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('page')
  const validKeys = PAGES.map((p) => p.key)
  if (requested && (validKeys as string[]).includes(requested)) {
    return requested as PageKey
  }
  return 'dashboard'
}

function getDebugIdleSeconds(): number | null {
  if (!import.meta.env.DEV) return null
  const rawSeconds = new URLSearchParams(window.location.search).get('debugIdleSeconds')
  if (rawSeconds === null || !/^\d+$/.test(rawSeconds)) return null
  const seconds = Number(rawSeconds)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}

// アイドル検知：この時間ユーザー操作が無ければPLC接続を切る（Netlify無料枠の閲覧数上限対策）
const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const MAX_BROWSER_COUNT = 20

export default function App() {
  const isTouchDevice = !window.matchMedia('(hover: hover)').matches
  const [isGearHover, setIsGearHover] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [themeKey, setThemeKey] = useState<ThemeKey>('dark-exhibition')
  const [currentPage, setCurrentPage] = useState<PageKey>(getInitialPage)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const theme = THEMES[themeKey]
  const settingsRef = useRef<HTMLDivElement>(null)
  const gearBtnRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const mode = getThemeMode(themeKey)
  const isMobile = useIsMobile()
  const debugIdleSeconds = getDebugIdleSeconds()
  const idleTimeoutMs = debugIdleSeconds === null ? IDLE_TIMEOUT_MS : debugIdleSeconds * 1000
  const idleDurationLabel = debugIdleSeconds === null ? '10分間' : `${debugIdleSeconds}秒間`
  const [dashboardStatus, setDashboardStatus] = useState<CameraStatus>('停止')

  const STATUS_DOT_COLOR: Record<CameraStatus, string> = {
    '運転': '#4ade80',
    '停止': '#f5f5f5',
    '待機': '#60a5fa',
    '異常': mode === 'light' ? '#c81e1e' : '#ff4d4f',
  }

  // モバイル版ではMONITOR画面を使わず、ROBOT PERFORMANCEを初期画面にする
  useEffect(() => {
    if (isMobile && currentPage === 'dashboard') {
      setCurrentPage('control')
    }
  }, [isMobile, currentPage])

  // --- アイドル検知（モバイル版のみ：10分間ユーザー操作が無ければPLC接続を切る） ---
  // モニタ版は展示会場で常時つけっぱなし運用のため、絶対に接続を切ってはいけない。
  // モバイル版（来場者のスマホ等での閲覧）に限り、マウス・タッチ・キー操作が無い状態が
  // 続いたらWebSocket接続を停止する。画面消灯・別タブ移動中はブラウザがタイマーを
  // 遅延させるため、最終操作時刻も保存し、画面復帰時にも経過時間を確認する。
  // 切断後は同じページ内では復帰させず、ページを再読み込みしたときだけ新しい接続を開始する。
  const [isIdle, setIsIdle] = useState(false)
  const [hasReachedBrowserLimit, setHasReachedBrowserLimit] = useState(false)
  const idleTimerRef = useRef<number | undefined>(undefined)
  const lastActivityAtRef = useRef(0)

  useEffect(() => {
    if (!isMobile && debugIdleSeconds === null) {
      // モニタ版では常時接続を維持するため、アイドル判定自体を行わない
      setIsIdle(false)
      return
    }

    const markIdleIfExpired = () => {
      if (Date.now() - lastActivityAtRef.current >= idleTimeoutMs) {
        setIsIdle(true)
        return true
      }
      return false
    }

    const scheduleIdleTimer = () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      const remainingMs = Math.max(
        idleTimeoutMs - (Date.now() - lastActivityAtRef.current),
        0,
      )
      idleTimerRef.current = window.setTimeout(markIdleIfExpired, remainingMs)
    }

    const markActivity = () => {
      lastActivityAtRef.current = Date.now()
      scheduleIdleTimer()
    }

    const checkVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!markIdleIfExpired()) scheduleIdleTimer()
      }
    }

    const activityEvents = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'wheel'] as const
    activityEvents.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }))
    document.addEventListener('visibilitychange', checkVisibility)
    lastActivityAtRef.current = Date.now()
    scheduleIdleTimer() // 初期化（マウント時点からタイマー開始）

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, markActivity))
      document.removeEventListener('visibilitychange', checkVisibility)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [debugIdleSeconds, idleTimeoutMs, isMobile])

  const today = new Date()
  const dayStamp = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  const recentDates = useMemo(() => getRecentDates(METRIC_DAYS), [dayStamp])
  const DATES = useMemo(() => recentDates.map((d) => d.label), [recentDates])
  const dateOptions = useMemo(
     () => recentDates.map((d) =>({label: d.label, value: d.key})),
     [recentDates],
  )
  
  const { data: plcData, browserCount } = usePlcWebSocket({
    enabled: !isIdle && !hasReachedBrowserLimit,
    isPlaying: true,
    intervalSec: 0.5,
    selectedAddresses: [
      ...ALL_ROBOT_STATUS_ADDRESSES,
      ...OPERATION_METRICS_ADDRESSES,
      ...JOB_FLOW_ADDRESSES,
      ...RB_FLOW_ADDRESSES,
      ...CYCLE_ADDRESSES,
      ...RUN_STATUS_ADDRESSES,
      ...DAILY_METRICS_ADDRESSES,
    ],
  })

  // 閲覧数上限（Netlify無料枠対策）／アイドル切断。どちらの場合も
  // currentPageに関わらずページ内容そのものを表示しないようにするためのフラグ。
  const isOverLimit = hasReachedBrowserLimit || (browserCount !== null && browserCount >= MAX_BROWSER_COUNT)
  const isBlocked = isIdle || isOverLimit

  useEffect(() => {
    if (browserCount !== null && browserCount >= MAX_BROWSER_COUNT) {
      setHasReachedBrowserLimit(true)
    }
  }, [browserCount])

  const dailyMetrics = usePlcDailyMetricsSignals(plcData)
  const { activeStep } = usePlcJobFlowSignals(plcData)
  const { rb1Step, rb2Step } = usePlcRbFlowSignals(plcData)
  const {
    uptimeTotalSec,
    tightenCycleTimeSec,
    tightenBestCycleTimeSec,
    loosenCycleTimeSec,
    loosenBestCycleTimeSec,
    cycleHistory,
  } = usePlcCycleSignals(plcData)
  const { rb1Status, rb2Status } = usePlcRunStatusSignals(plcData)

  // RB1・RB2それぞれの稼働状況を各カメラIDに適用する
  // （RB1はアドレス未確定のため、確定するまではundefined＝RobotArmDashboard側で「停止」扱い）
  const plcStatusById =
    rb1Status !== undefined || rb2Status !== undefined
      ? { 'cam-1': rb1Status ?? '停止', 'cam-2': rb2Status ?? '停止' }
      : undefined

  // RB1・RB2のトルク値・ピーク値・稼働率（PLC Dレジスタは未定のため現状は常に0が返る想定。
  // 確定するまではサンプル値をフォールバックとして使用する）
  const { rb1AxisStats, rb2AxisStats } = usePlcRobotStatusSignals(plcData)

  // 稼働実績5指標・NG判定信号・サイクルタイム・サイクル開始/終了時刻（PLC Dレジスタは未定のため
  // 現状は常に0が返る想定。確定するまではサンプル値をフォールバックとして使用する。サイクルタイムは
  // PLC値が無い場合、サイクル変更タイミング用bitの立上り間隔からコード側で算出した値を使用する）
  // inspectCountはPLC側の検査回数信号（アドレスはoperationMetricsAddresses.ts参照）。
  // 表示上の検査回数はOK回数＋NG回数から算出するようになったためMetricPointへは反映しないが、
  // 信号自体は将来的な用途に備えてそのまま受け取っておく。
  const {
    anomalyCount,
    insertCount,
    tightenCount,
    loosenCount,
    okCount,
    ngCount,
    ngSignal: plcNgSignal,
  } = usePlcOperationMetricsSignals(plcData)

  // 全体フローの判定はD15000の瞬間値で確定する（5=OK、6=NG）。
  // 7〜9へ進んだ後も、次サイクル開始（1）まで判定結果を表示し続ける。
  const [overallNgSignal, setOverallNgSignal] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (activeStep === 5) {
      setOverallNgSignal(false)
    } else if (activeStep === 6) {
      setOverallNgSignal(true)
    } else if (activeStep === 1) {
      setOverallNgSignal(undefined)
    }
  }, [activeStep])

  // NG判定アドレスは仮値のため、全体フロー表示では使用しない。
  void plcNgSignal

  // 取付・取出のベストサイクルタイム（PLC側で保持している値）を接続判定の目安として監視する。
  // どちらか一方でも値が入っていれば接続中、両方0の状態が一定時間続けば非接続とみなす。
  const isPlcConnected = usePlcConnectionStatus(tightenBestCycleTimeSec, loosenBestCycleTimeSec)

  const hourlyTrendPoints = useOperationHourlyTrend(anomalyCount, tightenCount, loosenCount)

  // ヘッダー右側の運転状況表示：接続アイコン＋色付きドットのみ（ラベル文字は廃止）
  // ●は1つだけなので、RB1・RB2の状態をRobotArmDashboard側の優先度
  // （異常 > 運転 > 待機 > 停止。両方停止のときだけ「停止」）でまとめたdashboardStatusを使う。
  const headerStatus: CameraStatus = dashboardStatus
  const statusDot = (
    <span className="app-header__status-wrap">
      <PlcConnectionIcon connected={isPlcConnected} />
      <span
        className={`app-header__status-dot${headerStatus === '異常' ? ' is-abnormal' : ''}`}
        style={{
          backgroundColor: STATUS_DOT_COLOR[headerStatus],
          color: STATUS_DOT_COLOR[headerStatus],
        }}
        title={`運転状況：${headerStatus}（RB1：${rb1Status ?? '停止'}／RB2：${rb2Status ?? '停止'}）`}
      />
    </span>
  )

  // 当日分（配列末尾）はPLCの値があればそちらを優先し、無ければサンプル値を使う
  const liveMetrics: MetricPoint[] = DATES.map((date, i) => {
  if (i !== DATES.length - 1) {
    return {
      date,
      anomalyCount: 0,
      insertCount: 0,
      tightenCount: 0,
      loosenCount: 0,
      okCount: 0,
      ngCount: 0,
    }
  }
  return {
    date,
    anomalyCount,
    insertCount,
    tightenCount,
    loosenCount,
    okCount,
    ngCount,
  }
})

  // 稼働時間・取付/取出それぞれのサイクルタイム（ベスト／現在）・稼働時間ごとの
  // 異常回数/取付実行回数/取出実行回数の推移は、対応するPLCのDレジスタが未定のため
  // 現時点では未接続（OperationResults側でoverallCycleTimeSecへのフォールバックや
  // サンプル値表示が行われる）。アドレス確定後、config/operationMetricsAddresses.ts に
  // 追加のうえここで配線すること。

  // トルク警告の動作確認用。確認後はfalseに戻す。
  const DEBUG_FORCE_TORQUE_TEST = false
  const debugRb1AxisStats = rb1AxisStats.map((stat) => ({
    ...stat,
    torque: 106,
    peakTorque: 110,
  }))
  const debugRb2AxisStats = rb2AxisStats.map((stat) => ({
    ...stat,
    torque: 6,
    peakTorque: 6,
  }))

  const robotRB1 = {
    motors: DEBUG_FORCE_TORQUE_TEST ? debugRb1AxisStats : rb1AxisStats,
    utilizationRate: SAMPLE_RB1_UTILIZATION,
  }

  const robotRB2 = {
    motors: DEBUG_FORCE_TORQUE_TEST ? debugRb2AxisStats : rb2AxisStats,
    utilizationRate: SAMPLE_RB2_UTILIZATION,
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node) &&
        gearBtnRef.current &&
        !gearBtnRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false)
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handler)
    }
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  useEffect(() => {
    if (!headerRef.current) return
    const el = headerRef.current
    const update = () => {
      document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update) // svh再計算のフォールバック
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--panel-offset-x',
      sidebarOpen ? `${SIDEBAR_WIDTH}px` : '0px'
    )
  }, [sidebarOpen])

  // --- モバイルで下部が切れる対策 ---
  // 100vh はアドレスバー等を含んだ高さになり、スマホでは実際に見えている
  // 範囲より大きくなるため下端が隠れることがある。visualViewport（対応環境）
  // または innerHeight の実測値を --app-vh として常に反映し、index.css /
  // このコンポーネントの高さ指定はそれを基準にする。
  useEffect(() => {
    const setAppHeight = () => {
      const h = window.visualViewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-vh', `${h * 0.01}px`)
    }
    setAppHeight()
    window.addEventListener('resize', setAppHeight)
    window.addEventListener('orientationchange', setAppHeight)
    window.visualViewport?.addEventListener('resize', setAppHeight)
    return () => {
      window.removeEventListener('resize', setAppHeight)
      window.removeEventListener('orientationchange', setAppHeight)
      window.visualViewport?.removeEventListener('resize', setAppHeight)
    }
  }, [])

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(var(--app-vh, 1vh) * 100)',
        background: theme.bg,
        color: theme.text,
        transition: 'background-color 0.3s, color 0.3s',
      }}
    >
      {isBlocked ? (
        <div className="app-blocking-overlay">
          <section
            className="app-blocking-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-blocking-title"
            aria-describedby="app-blocking-message"
            style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
          >
            <h2 id="app-blocking-title">ページを表示できません</h2>
            <p id="app-blocking-message" style={{ color: theme.subtext }}>
              {isOverLimit
                ? `現在の閲覧数が上限（${MAX_BROWSER_COUNT}）に達しています。閲覧可能になってから再読み込みしてください。`
                : `${idleDurationLabel}操作がなかったため、接続を終了しました。再接続するにはページを再読み込みしてください。`}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ background: theme.accent }}
            >
              再読み込み
            </button>
          </section>
        </div>
      ) : (
        <>
      {/* スマホを横向きにしたときの操作ブロック案内（CSS側は index.css 参照） */}
      <div className="orientation-lock">
        <span className="orientation-lock__icon" aria-hidden="true">📱</span>
        <p className="orientation-lock__text">
          この画面は縦向き表示専用です。
          <br />
          お手数ですが端末を縦向きにしてご覧ください。
        </p>
      </div>

      {/* ヘッダー */}
      <header
        ref={headerRef}
        className="app-header"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div
          className="app-header__brand"
          style={{
            background: isMobile
              ? theme.bg
              : sidebarOpen
              ? mode === 'dark'
                ? 'rgba(0,0,0,0.55)'
                : 'rgba(180, 178, 178, 0.46)'
              : theme.bg,
            transition: 'background 0.1s ease',
          }}
        >
          <img src={theme.logo} alt="logo" className="logo" />
        </div>

        {!isMobile && (
          <span className="app-header__title" style={{ color: theme.subtext, fontSize: '19px' }}>
            {PAGES.find((p) => p.key === currentPage)?.label}
          </span>
        )}

        {/* 右側をまとめる */}
        <div
          className="header-right"
          ref={gearBtnRef}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifySelf: 'end',
          }}
          onMouseEnter={() => setIsGearHover(true)}
          onMouseLeave={() => setIsGearHover(false)}
        >
          {!isMobile && <LiveClock />}
          {statusDot}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowSettings((p) => !p)
            }}
            style={{
              background: showSettings ? `${theme.accent}33` : 'transparent',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: showSettings ? theme.accent : theme.border,
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '15px',
              lineHeight: 1,
              transition: 'all 0.2s',
            }}
          >
            ⚙️
          </button>

          <span
            className="settings-tooltip"
            style={{
              position: 'absolute',
              top: '100%', // ← bottom指定より安定
              marginTop: '6px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.75)',
              color: '#fff',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              opacity: isTouchDevice ? 0 : isGearHover ? 1 : 0,
              pointerEvents: 'none',
              transition: 'opacity 0.2s',
              zIndex: 200,
            }}
          >
            設定
          </span>
        </div>
      </header>

      {/* ヘッダー下レイアウト */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* サイドバー（内部でモバイル/PCを判定して表示を切替） */}
        <Sidebar
          theme={theme}
          currentPage={currentPage}
          sidebarOpen={sidebarOpen}
          onPageChange={setCurrentPage}
          onClose={() => setSidebarOpen(false)}
          onToggle={() => setSidebarOpen((p) => !p)}
          footerHeight={30}
        />

        {/* 設定パネル */}
        {showSettings && (
          <div ref={settingsRef}>
            <SettingsPanel
              theme={theme}
              themeKey={themeKey}
              isPlaying={isPlaying}
              isEditing={isEditing}
              onThemeChange={setThemeKey}
              onPlayingChange={setIsPlaying}
              onEditingChange={setIsEditing}
              isNameplatePage={currentPage === 'quiz'}
              isEditingEnabled={currentPage !== 'control' || !isMobile}
              onOpenAdmin={() => setIsAdminOpen(true)}
            />
          </div>
        )}

        {/* ページコンテンツ（4項目）*/}
        {/* 閲覧数上限 or アイドル切断の場合は、currentPageに関わらず内容を一切出さず案内のみ表示する */}
        <>
            <div className="dashboard-page" style={{ display: currentPage === 'dashboard' ? 'flex' : 'none' }}>
              <RobotArmDashboard
                theme={theme}
                isEditing={isEditing}
                onEditingChange={setIsEditing}
                plcStatusById={plcStatusById}
                onStatusChange={setDashboardStatus}
                rb1Step={rb1Step}
                rb2Step={rb2Step}
                activeStep={activeStep}
                ngSignal={overallNgSignal}
              />
            </div>

            <div className="dashboard-page dashboard-page--operation-results" style={{ display: currentPage === 'control' ? 'flex' : 'none' }}>
              <OperationResults
                theme={theme}
                metrics={liveMetrics}
                isEditing={isEditing}
                activeStep={activeStep}
                operatingTimeSec={uptimeTotalSec}
                tightenCycleTimeSec={tightenCycleTimeSec}
                tightenBestCycleTimeSec={tightenBestCycleTimeSec}
                loosenCycleTimeSec={loosenCycleTimeSec}
                loosenBestCycleTimeSec={loosenBestCycleTimeSec}
                cycleHistory={cycleHistory}
                ngSignal={overallNgSignal}
                hourlyTrend={hourlyTrendPoints}
                bladeImageUrl={SHARED_ROBOT_IMAGE_URL}
                onEditingChange={setIsEditing}
                dailyMetrics={dailyMetrics}
              />
            </div>

            <div className="dashboard-page dashboard-page--operation-status" style={{ display: currentPage === 'anomaly' ? 'flex' : 'none' }}>
              <OperationStatus
                theme={theme}
                themeMode={mode}
                robotRB1={robotRB1}
                robotRB2={robotRB2}
                cycleTime={cycleTime}
                isEditing={isEditing}
                onEditingChange={setIsEditing}
              />
            </div>

            <div className="dashboard-page dashboard-page--nameplate" style={{ display: currentPage === 'quiz' ? 'flex' : 'none' }}>
              <NameplateQuiz
                theme={theme}
                questions={sampleQuestions}
                themeMode={getThemeMode(themeKey)}
                isAdminOpen={isAdminOpen}
                onAdminOpenChange={setIsAdminOpen}
                dateOptions={dateOptions}
              />
            </div>
        </>
      </div>
      <footer
        className="app-footer"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '100%',
          padding: '3px 0px',
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: theme.surface,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          zIndex: 100,
        }}
      >
        <span
          style={{
            color: theme.text,
            fontSize: '20px',
            letterSpacing: '0.5px',
            fontFamily: '"Yu Gothic", "游ゴシック", sans-serif',
            fontWeight: 500,
            fontStyle: 'italic',
          }}
        >
          e
          <span style={{ color: theme.accent }}>X</span>
          <span style={{ marginRight: '15px' }}>ight</span>
        </span>
      </footer>
        </>
      )}
    </div>
  )
}