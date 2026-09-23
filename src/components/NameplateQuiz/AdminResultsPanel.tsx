// AdminResultsPanel.tsx
import { useEffect, useMemo, useState } from 'react'
import type { NameplateQuestion, Theme, ThemeMode, ChoiceBreakdown, DailyCorrectRate } from '../../types'
import './AdminResultsPanel.css'
import { createPortal } from 'react-dom'

interface AdminResultsPanelProps {
  theme: Theme
  questions: NameplateQuestion[]
  themeMode: ThemeMode
  dateOptions: { label: string; value: string }[]
  getBreakdown: (question: NameplateQuestion, dateRange?: string[]) => Promise<ChoiceBreakdown[]>
  getDailyCorrectRates: (dates: string[], questionIds?: string[]) => Promise<DailyCorrectRate[]>
  onClose?: () => void
  password?: string
  /**
   * true: モニタに常時埋め込む「公開用」表示。パスワード不要・答えは一切見せない
   *       （カテゴリ別の日別正解率をまとめた棒グラフのみ）。
   * false: 鍵ボタンから開くオーバーレイ表示。パスワード解錠後に詳細（問題別タグ・
   *        選択肢ごとの集計・折れ線グラフ）を表示する。モバイル/デスクトップ共通。
   */
  embedded?: boolean
}

const CATEGORY_TABS = ['全体', '運転合図', '停止', 'エラーリセット', 'カウンタリセット'] as const
type CategoryTab = (typeof CATEGORY_TABS)[number]

// モニタ表示のグラフで使う色。テーマの accent とは別に、5カテゴリを見分けやすい
// 固定パレットにしている（配色自体を変えたい場合はここだけ調整すればよい）。
const CATEGORY_COLORS: Record<CategoryTab, string> = {
  '全体': '#cbd5e1',
  '運転合図': '#fb923c',
  '停止': '#f87171',
  'エラーリセット': '#fde047',
  'カウンタリセット': '#4ade80',
}

// モニタ表示は常時開きっぱなしのため、定期的に再取得して反映する。
// 今はlocalStorageなので実質同一端末内の変化しか拾えないが、DB接続後は
// 他端末（スマホ）で増えた回答もここで自動的に反映されるようになる。
const EMBEDDED_POLL_INTERVAL_MS = 20000

export default function AdminResultsPanel({
  theme,
  questions,
  themeMode,
  dateOptions,
  getBreakdown,
  getDailyCorrectRates,
  onClose,
  password = 'nishi2460',
  embedded = false,
}: AdminResultsPanelProps) {
  const themeVars = {
    '--nq-bg': theme.bg,
    '--nq-surface': theme.surface,
    '--nq-border': theme.border,
    '--nq-text': theme.text,
    '--nq-subtext': theme.subtext,
    '--nq-accent': theme.accent,
  } as React.CSSProperties

  // ─────────────────────────────────────────────
  // 公開用（embedded）：カテゴリ別・日別正解率をまとめた棒グラフのみ。答えは一切表示しない。
  // 操作UIは持たず、直近日数ぶんを自動表示・自動更新する。
  // ─────────────────────────────────────────────
  if (embedded) {
    const dates = useMemo(() => dateOptions.map((d) => d.value), [dateOptions])

    const questionIdsByCategory = useMemo(() => {
      const map = {} as Record<CategoryTab, string[] | undefined>
      CATEGORY_TABS.forEach((cat) => {
        map[cat] =
          cat === '全体'
            ? undefined
            : questions.filter((q) => q.choices[q.correctIndex] === cat).map((q) => q.id)
      })
      return map
    }, [questions])

    const [seriesData, setSeriesData] = useState<Record<CategoryTab, DailyCorrectRate[]>>(
      () =>
        Object.fromEntries(CATEGORY_TABS.map((c) => [c, [] as DailyCorrectRate[]])) as Record<
          CategoryTab,
          DailyCorrectRate[]
        >
    )

    useEffect(() => {
      let cancelled = false
      const refresh = async () => {
        const entries = await Promise.all(
          CATEGORY_TABS.map(async (cat) => {
            const rates = await getDailyCorrectRates(dates, questionIdsByCategory[cat])
            return [cat, rates] as const
          })
        )
        if (!cancelled) {
          setSeriesData(Object.fromEntries(entries) as Record<CategoryTab, DailyCorrectRate[]>)
        }
      }
      refresh()
      const interval = setInterval(refresh, EMBEDDED_POLL_INTERVAL_MS)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }, [dates, questionIdsByCategory, getDailyCorrectRates])

    const chartW = 1200         // 640 → 1200：3日分でも間隔にゆとりが出る横幅に拡大
    const chartH = 260
    const padX = 60              // 36 → 60：左右の余白も少し拡大
    const padTop = 30
    const padBottom = 90         // 日付ラベルが大きなHTML文字になったので、下の余白を広く確保
    const groupGap = 80          // 22 → 80：日付グループ同士の間隔を大きく広げる
    const barGap = 10            // 3 → 10：カテゴリ同士の棒の間隔をさらに広げ、ラベル同士の被りを軽減
    const plotW = chartW - padX * 2
    const plotH = chartH - padTop - padBottom
    const dateCount = dateOptions.length
    const groupW = dateCount > 0 ? (plotW - groupGap * (dateCount - 1)) / dateCount : 0
    const barW =
      dateCount > 0 ? (groupW - barGap * (CATEGORY_TABS.length - 1)) / CATEGORY_TABS.length : 0

    // 正解率の数値ラベル：SVG内のviewBoxスケールに引きずられないよう、
    // 位置だけ%で計算してHTMLオーバーレイとして描画する（フォントサイズはCSSの実px基準になる）
    const valueLabels: { key: string; xPct: number; yPct: number; value: number; color: string }[] = []
    const dateLabels: { key: string; xPct: number; yPct: number; text: string }[] = []
    dateOptions.forEach((d, gi) => {
      const groupX = padX + gi * (groupW + groupGap)
      dateLabels.push({
        key: d.value,
        xPct: ((groupX + groupW / 2) / chartW) * 100,
        // 下の余白帯（baselineから下）の中央あたりに配置
        yPct: ((padTop + plotH + padBottom * 0.55) / chartH) * 100,
        text: d.value.slice(5).replace('-', '/'),
      })
      CATEGORY_TABS.forEach((cat, ci) => {
        const rate = seriesData[cat]?.[gi]
        // 有効回答（わからない・未回答を除く）が0件の日は「0%」ではなく
        // 「データなし」なので、棒自体を描かない（非表示）。ラベルも出さない。
        if (!rate || rate.totalAnswered === 0) return
        const h = (rate.correctRate / 100) * plotH
        const x = groupX + ci * (barW + barGap) + barW / 2
        const y = padTop + (plotH - h) // ← バー上端（X方向のみ中央、Yはバーの上）
        valueLabels.push({
          key: `${d.value}-${cat}`,
          xPct: (x / chartW) * 100,
          yPct: (y / chartH) * 100,
          value: rate.correctRate,
          color: CATEGORY_COLORS[cat],
        })
      })
    })

    return (
      <div className="admin-panel__embed" style={themeVars}>
        <div className="admin-panel__modal admin-panel__modal--embedded">
          <div className="admin-panel__content admin-panel__lockview">
            <div className="admin-panel__chart-section">
              
              <div className="admin-panel__chart-wrap">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  preserveAspectRatio="none"
                  className="admin-panel__chart"
                >
                  <line
                    x1={padX}
                    y1={padTop + plotH}
                    x2={chartW - padX}
                    y2={padTop + plotH}
                    className="admin-panel__chart-baseline"
                  />
                  {dateOptions.map((d, gi) => {
                    const groupX = padX + gi * (groupW + groupGap)
                    return (
                      <g key={d.value}>
                        {CATEGORY_TABS.map((cat, ci) => {
                          const rate = seriesData[cat]?.[gi]
                          // 有効回答が0件（＝わからない・未回答のみ、または回答自体なし）の
                          // 日は「0%の棒」ではなく「棒を描かない」ことでデータなしを表す。
                          if (!rate || rate.totalAnswered === 0) return null
                          const h = (rate.correctRate / 100) * plotH
                          const x = groupX + ci * (barW + barGap)
                          const y = padTop + (plotH - h)
                          return (
                            <rect
                              key={cat}
                              x={x}
                              y={y}
                              width={Math.max(barW, 0)}
                              height={Math.max(h, 0)}
                              rx={2}
                              style={{ fill: CATEGORY_COLORS[cat] }}
                            />
                          )
                        })}
                      </g>
                    )
                  })}
                </svg>

                {/* 数値ラベル・日付ラベルはどちらもSVGの外（HTML）に出す。preserveAspectRatio="none"で
                    箱いっぱいに非均等スケールしているので、%指定の位置はそのまま正しく一致する。
                    フォントサイズはCSSの実px（clamp/vw）指定がそのまま効くので、大画面モニタでも
                    グラフの描画スケールに関係なく狙った大きさになる */}
                <div className="admin-panel__chart-values">
                  {valueLabels.map((v) => (
                    <span
                      key={v.key}
                      className={`admin-panel__chart-value-label${
                        String(v.value).length >= 3 ? ' admin-panel__chart-value-label--long' : ''
                      }`}
                      style={{ left: `${v.xPct}%`, top: `${v.yPct}%` }}
                    >
                      {v.value}
                    </span>
                  ))}
                  {dateLabels.map((d) => (
                    <span
                      key={d.key}
                      className="admin-panel__chart-date-label"
                      style={{ left: `${d.xPct}%`, top: `${d.yPct}%` }}
                    >
                      {d.text}
                    </span>
                  ))}
                </div>
              </div>

              <div className="admin-panel__legend">
                {CATEGORY_TABS.map((cat) => (
                  <span key={cat} className="admin-panel__legend-item">
                    <span
                      className="admin-panel__legend-dot"
                      style={{ background: CATEGORY_COLORS[cat] }}
                    />
                    {cat}
                  </span>
                ))}
              </div>

              {dateOptions.length === 0 && (
                <p className="admin-panel__empty">表示する日付がありません</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // オーバーレイ（鍵ボタンから開く）：パスワード解錠後に詳細パネルを表示
  // ─────────────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)

  const [selectedQuestionId, setSelectedQuestionId] = useState(questions[0]?.id ?? null)
  const [selectedDates, setSelectedDates] = useState<string[]>(dateOptions.map((d) => d.value))

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedQuestionId) ?? null,
    [questions, selectedQuestionId]
  )

  const [breakdown, setBreakdown] = useState<ChoiceBreakdown[]>([])
  useEffect(() => {
    let cancelled = false
    if (!selectedQuestion) {
      setBreakdown([])
      return
    }
    getBreakdown(selectedQuestion, selectedDates).then((b) => {
      if (!cancelled) setBreakdown(b)
    })
    return () => {
      cancelled = true
    }
  }, [selectedQuestion, selectedDates, getBreakdown])

  const [dailyRates, setDailyRates] = useState<DailyCorrectRate[]>([])
  useEffect(() => {
    let cancelled = false
    getDailyCorrectRates(dateOptions.map((d) => d.value)).then((r) => {
      if (!cancelled) setDailyRates(r)
    })
    return () => {
      cancelled = true
    }
  }, [dateOptions, getDailyCorrectRates])

  const toggleDate = (value: string) => {
    setSelectedDates((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    )
  }

  const handleUnlock = () => {
    if (pwInput === password) {
      setUnlocked(true)
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  const maxRate = 100
  const chartW = 480
  const chartH = 160
  const padX = 30
  const padY = 20
  const stepX = dailyRates.length > 1 ? (chartW - padX * 2) / (dailyRates.length - 1) : 0
  const points = dailyRates.map((d, i) => {
    const x = padX + i * stepX
    const y = padY + (1 - d.correctRate / maxRate) * (chartH - padY * 2)
    return { x, y, d }
  })
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  return createPortal(
    <div className="admin-panel__overlay" style={themeVars}>
      <div className="admin-panel__modal">
        <button className="admin-panel__close" onClick={onClose} aria-label="閉じる">
          ×
        </button>

        {!unlocked ? (
          <div className="admin-panel__gate">
            <h2 className="admin-panel__title">作成者用ページ</h2>
            <p className="admin-panel__gate-desc">パスワードを入力してください</p>
            <input
              type="password"
              id="adminPassword"
              name="adminPassword"
              className={`admin-panel__pw-input${pwError ? ' is-error' : ''}`}
              value={pwInput}
              onChange={(e) => {
                setPwInput(e.target.value)
                setPwError(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="パスワード"
              autoFocus
            />
            {pwError && <p className="admin-panel__pw-error">パスワードが違います</p>}
            <button className="admin-panel__unlock-btn" onClick={handleUnlock}>
              開く
            </button>
          </div>
        ) : (
          <div className="admin-panel__content">
            <h2 className="admin-panel__title">正解集計ページ</h2>

            <div className="admin-panel__tags">
              {questions.map((q) => (
                <button
                  key={q.id}
                  className={`admin-panel__tag${selectedQuestionId === q.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedQuestionId(q.id)}
                >
                  {q.choices[q.correctIndex]}
                </button>
              ))}
            </div>

            <div className="admin-panel__dates">
              {dateOptions.map((d) => (
                <label key={d.value} className="admin-panel__date-chip">
                  <input
                    type="checkbox"
                    id={`date-${d.value}`}
                    name="selectedDates"
                    checked={selectedDates.includes(d.value)}
                    onChange={() => toggleDate(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>

            {selectedQuestion && (
              <div className="admin-panel__breakdown">
                <p className="admin-panel__question-label">
                  {selectedQuestion.iconUrl?.[themeMode] && (
                    <img
                      src={selectedQuestion.iconUrl[themeMode]}
                      alt=""
                      className="admin-panel__question-icon-inline"
                    />
                  )}
                  {selectedQuestion.question}
                </p>
                {breakdown.map((b) => (
                  <div key={b.choiceIndex} className="admin-panel__bar-row">
                    <span className={`admin-panel__bar-label${b.isCorrect ? ' is-correct' : ''}`}>
                      {b.label}
                    </span>
                    <div className="admin-panel__bar-track">
                      <div
                        className={`admin-panel__bar-fill${b.isCorrect ? ' is-correct' : ''}`}
                        style={{ width: `${b.percent}%` }}
                      />
                    </div>
                    <span className="admin-panel__bar-value">
                      {b.percent}%（{b.count}件）
                    </span>
                  </div>
                ))}
                {breakdown.every((b) => b.count === 0) && (
                  <p className="admin-panel__empty">選択した期間のデータがありません</p>
                )}
              </div>
            )}

            <div className="admin-panel__chart-section">
              <p className="admin-panel__chart-title">日別正解率</p>
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="admin-panel__chart">
                <polyline points={polyline} className="admin-panel__chart-line" />
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={3.5} className="admin-panel__chart-dot" />
                    <text x={p.x} y={chartH - 4} textAnchor="middle" className="admin-panel__chart-x-label">
                      {p.d.date.slice(5).replace('-', '/')}
                    </text>
                    <text x={p.x} y={p.y - 8} textAnchor="middle" className="admin-panel__chart-y-label">
                      {p.d.totalAnswered > 0 ? `${p.d.correctRate}%` : '-'}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
