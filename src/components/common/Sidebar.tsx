import { useLayoutEffect, useRef, useState } from 'react'
import type { Theme, PageKey } from '../../types'
import { PAGES } from './themes'
import { useIsMobile } from '../../hooks/useMediaQuery'

// =============================================
// ミニプレビュー用サムネイル枠
// 枠の実サイズと中身の自然なサイズをResizeObserverで実測し、
// X軸・Y軸それぞれ独立の倍率で「枠にぴったりフィット」させる。
// ページごとに中身の縦横比が違っても対応でき、画面サイズが
// 変わってもリアルタイムに追従する。
// =============================================
function PreviewThumb({ children }: { children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState({ x: 1, y: 1 })

  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    const measure = () => {
      // 実測の前に一旦transformを外して「中身の自然なサイズ」を取得する
      inner.style.transform = 'none'
      const boxRect = box.getBoundingClientRect()
      const innerRect = inner.getBoundingClientRect()
      if (innerRect.width === 0 || innerRect.height === 0) return
      setScale({
        x: boxRect.width / innerRect.width,
        y: boxRect.height / innerRect.height,
      })
    }

    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [children])

  return (
    <div ref={boxRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        ref={innerRef}
        style={{
          display: 'inline-block',
          transform: `scale(${scale.x}, ${scale.y})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// =============================================
// ミニプレビュー
// =============================================

function DashboardPreview({ theme }: { theme: Theme }) {
  return (
    <div style={{ padding: '8px' }}>
      <div style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '6px',
        padding: '6px',
        overflow: 'hidden',
      }}>
        {/* パネルタイトル */}
        <div style={{
          fontSize: '8px',
          color: theme.subtext,
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>監視カメラ</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: '#ff4d4d',
              display: 'inline-block',
            }} />
            <span style={{ color: '#ff4d4d', fontSize: '7px' }}>REC</span>
          </span>
        </div>

        {/* カメラ映像エリア */}
        <svg width="100%" height="80" viewBox="0 0 90 70" preserveAspectRatio="none">
          {/* 背景 */}
          <rect x="0" y="0" width="90" height="70" fill="#0a0e14" />

          {/* 床のライン（軽め） */}
          <line x1="0" y1="70" x2="35" y2="34" stroke={theme.border} strokeWidth="0.5" opacity="0.5" />
          <line x1="90" y1="70" x2="55" y2="34" stroke={theme.border} strokeWidth="0.5" opacity="0.5" />
          <line x1="0" y1="55" x2="90" y2="55" stroke={theme.border} strokeWidth="0.4" opacity="0.3" />

          {/* アーム型ロボット */}
          <g fill="none" stroke="#0af3e0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            {/* 台座 */}
            <rect x="36" y="48" width="16" height="5" rx="1" fill="#0af3e0" stroke="none" />
            {/* 第1関節から第2関節（斜め上に伸びるアーム） */}
            <line x1="44" y1="48" x2="44" y2="38" />
            <line x1="44" y1="38" x2="56" y2="30" />
            <line x1="56" y1="30" x2="52" y2="20" />
            {/* グリッパー（先端） */}
            <line x1="52" y1="20" x2="48" y2="16" />
            <line x1="52" y1="20" x2="56" y2="16" />
          </g>
          {/* 関節の丸 */}
          <g fill="#0af3e0">
            <circle cx="44" cy="48" r="1.8" />
            <circle cx="44" cy="38" r="1.6" />
            <circle cx="56" cy="30" r="1.6" />
            <circle cx="52" cy="20" r="1.4" />
          </g>

          {/* モーション検知の枠 */}
          <rect x="32" y="12" width="28" height="42" fill="none"
            stroke="#0af3e0" strokeWidth="0.7" strokeDasharray="2,1" />
          <text x="32" y="10" fontSize="4.5" fill="#0af3e0">ROBOT ARM 98%</text>

          {/* 四隅のビューファインダー */}
          {[
            { x: 3, y: 3, dx: 1, dy: 1 },
            { x: 87, y: 3, dx: -1, dy: 1 },
            { x: 3, y: 67, dx: 1, dy: -1 },
            { x: 87, y: 67, dx: -1, dy: -1 },
          ].map((c, i) => (
            <path
              key={i}
              d={`M${c.x + c.dx * 6},${c.y} L${c.x},${c.y} L${c.x},${c.y + c.dy * 6}`}
              fill="none"
              stroke="#0af3e0"
              strokeWidth="0.8"
            />
          ))}

          {/* カメラ名／タイムスタンプ */}
          <text x="3" y="66" fontSize="4" fill="#0af3e0">CAM-02</text>
          <text x="63" y="66" fontSize="4" fill="#0af3e0">14:32:07</text>
        </svg>
      </div>
    </div>
  )
}

function ControlPreview({ theme }: { theme: Theme }) {
  // 実ページ（ROBOT PERFORMANCE）のミニ版：
  // 上部の指標バッジ／全体フロー図／OK・NGドーナツ＋ロボットモニタ棒グラフ、で構成する。
  // 高さは全て固定pxにし、NAMEPLATEプレビューで起きたスケール不安定化を再発させない。
  // 実ページの色分け（METRIC_DEFS）に合わせてバッジにも枠色を付ける
  const badges: { label: string; value: string | number; color: string }[] = [
    { label: '稼働時間', value: '8.2h', color: theme.border },
    { label: '異常回数', value: 4, color: '#e0503f' },
    { label: '取付実行', value: 118, color: '#4fbf8f' },
    { label: '取出実行', value: 115, color: '#8a7fc9' },
  ]

  // 全体フロー（JobFlowDiagram.tsx の OVERALL_FLOW）と同じ工程順に合わせる：
  // 刃物取付→刃物取外→検査→検査結果OK？→刃物交換→刃物ストックへ返却→動作準備
  const flow = ['刃物取付', '刃物取外', '検査', '判定', '刃物交換', '返却', '準備']

  const okPct = 97
  const radius = 12
  const c = 2 * Math.PI * radius
  const offset = c - (okPct / 100) * c

  // METRIC_DEFS（OperationResults.tsx）と同じ4指標・同じ色に統一（検査回数は棒グラフ対象外のため削除）
  const monitorBars = [
    { color: '#e0503f', h: 3 },   // 異常回数
    { color: '#e0b04f', h: 79 },  // 上刃挿入回数
    { color: '#4fbf8f', h: 100 }, // 取付実行回数
    { color: '#8a7fc9', h: 97 },  // 取出実行回数
  ]

  return (
    <div style={{ padding: '8px' }}>
      {/* op-results__top-grid（左210px＝KPI／中央＝フロー＋グラフ／右260px＝OK-NG）と同じ3カラム配分 */}
      <div style={{
        background: '#141a2b',
        border: `1px solid ${theme.border}`,
        borderRadius: '6px',
        padding: '6px',
        display: 'flex',
        gap: '4px',
      }}>
        {/* 左：KPIバッジ（縦積み・全高） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: '0 0 27%', minWidth: 0 }}>
          {badges.map((b, i) => (
            <div key={i} style={{
              flex: 1, minWidth: 0,
              borderLeft: `2px solid ${b.color}`,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '2px',
              padding: '2px 3px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}>
              <div style={{
                fontSize: '4px', color: theme.subtext,
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                {b.label}
              </div>
              <div style={{ fontSize: '6px', fontWeight: 700, color: '#e8ecf3' }}>
                {b.value}
              </div>
            </div>
          ))}
        </div>

        {/* 中央：全体フロー（上段）＋日別実績の棒グラフ（下段） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
          {/* 全体フロー */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1px', height: '12px' }}>
            {flow.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1px', flex: 1, minWidth: 0 }}>
                <div style={{
                  flex: 1, height: '100%',
                  border: `1px solid ${theme.accent}`, borderRadius: '2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '4px', color: theme.accent,
                  whiteSpace: 'nowrap', overflow: 'hidden',
                }}>
                  {f}
                </div>
                {i < flow.length - 1 && (
                  <span style={{ fontSize: '5px', color: theme.subtext, flexShrink: 0, lineHeight: 1 }}>
                    ›
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 日別実績（棒グラフ） */}
          <div style={{
            flex: 1, minHeight: '26px',
            border: `1px solid ${theme.border}`, borderRadius: '3px',
            padding: '3px 4px',
            display: 'flex', alignItems: 'flex-end', gap: '2px',
          }}>
            {monitorBars.map((m, i) => (
              <div key={i} style={{
                flex: 1, height: `${m.h}%`,
                background: m.color, borderRadius: '1px 1px 0 0',
              }} />
            ))}
          </div>
        </div>

        {/* 右：OK/NGドーナツ（全高・中央寄せ） */}
        <div style={{
          flex: '0 0 22%', minWidth: 0,
          border: `1px solid ${theme.border}`, borderRadius: '3px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
            <circle cx="16" cy="16" r={radius} fill="none" stroke={theme.border} strokeWidth="5" />
            <circle
              cx="16" cy="16" r={radius} fill="none" stroke="#4fbf8f" strokeWidth="5"
              strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
              transform="rotate(-90 16 16)"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}

function AlertPreview({ theme }: { theme: Theme }) {
  // 実ページ（軸モニター RB1/RB2比較）のミニ版：
  // 上部にRB1/RB2バッジ、中央に簡易ロボットアイコン、
  // 軸ごとにTORQUE/SPEEDの2段バーを左右対称に配置する。
  //
  // ※これまで「flex:1の中に%幅の子」という間接参照でバーが表示されない問題が
  // 解消しなかったため、その依存関係自体を排除。バーの土台幅・塗り幅ともに
  // 固定pxで直接計算し、flexの解決タイミングに依存しない構造にしている。
  const RB1_COLOR = '#3fa9f5'
  const RB2_COLOR = '#f2a33f'
  const BAR_TRACK_W = 74 // 片側バー土台の幅(px)。左右2つ+中央16px+gapで204px枠に収まる値

  const axes = [
    { label: 'T軸', rb1t: 62, rb1s: 40, rb2t: 58, rb2s: 45 },
    { label: null,  rb1t: 48, rb1s: 55, rb2t: 52, rb2s: 38 }, // U軸：ラベルなし
    { label: 'S軸', rb1t: 70, rb1s: 30, rb2t: 65, rb2s: 42 },
  ]

  function Bar({ pct, color, align }: { pct: number; color: string; align: 'left' | 'right' }) {
    const fillW = Math.round((pct / 100) * BAR_TRACK_W)
    return (
      <div style={{
        width: `${BAR_TRACK_W}px`, height: '3px',
        background: theme.border, borderRadius: '1px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute',
          top: 0, bottom: 0,
          [align === 'left' ? 'right' : 'left']: 0,
          width: `${fillW}px`,
          background: color,
        }} />
      </div>
    )
  }

  function RobotIcon({ color }: { color: string }) {
    return (
      <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
        <path d="M7 20 V13 L11 8 V3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="20" r="1.6" fill={color} />
        <circle cx="7" cy="13" r="1.3" fill={color} />
        <circle cx="11" cy="8" r="1.3" fill={color} />
        <circle cx="11" cy="3" r="1.3" fill={color} />
      </svg>
    )
  }

  return (
    <div style={{ padding: '8px', width: '204px', boxSizing: 'border-box' }}>
      <div style={{
        background: theme.bg, border: `1px solid ${theme.border}`,
        borderRadius: '6px', padding: '6px 7px', display: 'flex',
        flexDirection: 'column', gap: '5px', width: '100%', boxSizing: 'border-box',
      }}>
        {/* タイトル + RB1/RB2バッジ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: '6px', fontWeight: 800, color: RB1_COLOR,
            border: `1px solid ${RB1_COLOR}`, borderRadius: '3px', padding: '1px 4px',
          }}>
            RB1
          </span>
          <span style={{ fontSize: '6px', color: theme.subtext, letterSpacing: '0.3px' }}>
            ROBOT MONITOR
          </span>
          <span style={{
            fontSize: '6px', fontWeight: 800, color: RB2_COLOR,
            border: `1px solid ${RB2_COLOR}`, borderRadius: '3px', padding: '1px 4px',
          }}>
            RB2
          </span>
        </div>

        {/* 軸ごとの行：左=RB1 (TORQUE/SPEED) / 中央=ロボットアイコン+ラベル / 右=RB2 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {axes.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '11px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                <Bar pct={a.rb1t} color={RB1_COLOR} align="left" />
                <Bar pct={a.rb1s} color={RB1_COLOR} align="left" />
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                width: '16px', flexShrink: 0, gap: '1px',
              }}>
                {i === 1 && <RobotIcon color={theme.subtext} />}
                {a.label && (
                  <span style={{ fontSize: '5px', color: theme.subtext, whiteSpace: 'nowrap' }}>
                    {a.label}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                <Bar pct={a.rb2t} color={RB2_COLOR} align="right" />
                <Bar pct={a.rb2s} color={RB2_COLOR} align="right" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


function NameplateQuizPreview({ theme }: { theme: Theme }) {
  // 実ページ（NAME PANEL）のミニ版：
  // 左：正解率のリングゲージ／右：スマホでクイズに挑戦しようのQR案内／下：正解率推移の棒グラフ
  // 高さは全て固定pxにし、以前の可変高さ(minHeight)で起きたスケール不安定化を再発させない。
  const accuracy = 80
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (accuracy / 100) * circumference

  // 実ページ同様、直近以外はまだ実績が無い（0）想定のスパースな棒グラフ
  const days = [100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const barColors = ['#c7ccd6', '#ef7a7a']

  // QRコード風の簡易パターン（実データではなく見た目のみのモック）
  const qrCells = [
    1, 0, 1, 1, 0, 1,
    0, 1, 1, 1, 0, 1,
    1, 0, 0, 1, 1, 0,
    1, 1, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
    1, 1, 0, 1, 1, 0,
  ]

  return (
    <div style={{ padding: '8px' }}>
      <div
        style={{
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '34px' }}>
          {/* 正解率リングゲージ */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: '32px',
              height: '34px',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r={radius} fill="none" stroke={theme.border} strokeWidth="4" />
              <circle
                cx="18" cy="18" r={radius} fill="none" stroke={theme.accent} strokeWidth="4"
                strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: '8px', fontWeight: 700, color: theme.accent, lineHeight: 1, marginTop: '1px' }}>
              {accuracy}
            </span>
            <span style={{ fontSize: '4px', color: theme.subtext, whiteSpace: 'nowrap' }}>
              % 正解率
            </span>
          </div>

          {/* スマホでクイズに挑戦しよう（QR案内） */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              padding: '3px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '5px', color: theme.text, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                スマホでクイズに挑戦しよう
              </div>
              <div style={{ fontSize: '4px', color: theme.subtext, marginTop: '1px' }}>
                全部で4問
              </div>
            </div>
            <div
              style={{
                width: '20px', height: '20px', flexShrink: 0,
                background: '#fff', borderRadius: '2px', padding: '2px',
                display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5px',
              }}
            >
              {qrCells.map((v, i) => (
                <span key={i} style={{ background: v ? '#111' : 'transparent' }} />
              ))}
            </div>
          </div>
        </div>

        {/* 正解率推移（日別棒グラフ） */}
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            padding: '4px 5px',
          }}
        >
          <div style={{ fontSize: '5px', color: theme.subtext, marginBottom: '2px' }}>
            正解率推移
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: '18px' }}>
            {days.map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: v ? '100%' : '2px',
                  background: v ? barColors[i % barColors.length] : theme.border,
                  borderRadius: '1px',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}


// スライドパネルの幅。ブックマークタブの水平位置もこの値を基準に計算するため、
// ここを変えれば両方が連動して動く。
export const SIDEBAR_WIDTH = 220

type Props = {
  theme: Theme
  currentPage: PageKey
  sidebarOpen: boolean
  onPageChange: (page: PageKey) => void
  onClose: () => void
  onToggle: () => void
  /**
   * 画面下部に固定フッターがある場合、その高さ(px)。
   * これを渡すとサイドバーパネルがフッターの上でぴったり止まり、
   * 一番下のミニプレビューがフッターの裏に隠れなくなる。
   * フッター側のpadding/フォントサイズを変えた場合はこの値も一緒に見直すこと。
   */
  footerHeight?: number
}

export default function Sidebar({
  theme,
  currentPage,
  sidebarOpen,
  onPageChange,
  onClose,
  onToggle,
  footerHeight = 30, // padding 3px*2 + 20pxテキストの行送り分の概算値
}: Props) {

  const isMobile = useIsMobile()

  // モバイル版：画面下部固定のコンパクトなタブバー
  if (isMobile) {
    const mobilePages = PAGES.filter((page) => page.key !== 'dashboard')

    return (
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        display: 'flex',
        background: theme.surface,
        borderTop: `1px solid ${theme.border}`,
        zIndex: 100,
        boxSizing: 'border-box',
      }}>
{mobilePages.map(page => {
  const isActive = currentPage === page.key

  return (
    <button
      key={page.key}
      onClick={() => onPageChange(page.key)}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: isActive ? theme.accent : theme.subtext,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isActive ? theme.accent : theme.subtext,
          opacity: isActive ? 1 : 0.5,
        }}
      />

      <span
        style={{
          fontSize: '11px',
          fontWeight: isActive ? 'bold' : 'normal',
          textAlign: 'center',
          lineHeight: '1.2',
        }}
      >
        {page.label === 'Workflow/Operation History' ? (
          <>
            Workflow/Operation
            <br />
            History
          </>
        ) : (
          page.label
        )}
      </span>
    </button>
     )
    })}
      </nav>
    )
  }

  function renderPreview(pageKey: string) {
  if (pageKey === 'dashboard') return <DashboardPreview theme={theme} />
  if (pageKey === 'anomaly')   return <AlertPreview theme={theme} />
  if (pageKey === 'quiz')      return <NameplateQuizPreview theme={theme} />
  return <ControlPreview theme={theme} />
 }
  const handleSidebarMouseEnter = () => {
    if (!sidebarOpen) {
      onToggle()
    }
  }

  return (
    <>
      {/* 画面端の開閉トリガー（非表示エリア）: sidebarが閉じている時だけ反応させる */}
      {!sidebarOpen && (
        <div
          onMouseEnter={handleSidebarMouseEnter}
          style={{
            position: 'fixed',
            top: '57px',
            left: 0,
            bottom: `${footerHeight}px`,
            width: '12px', // 端に置く反応幅。狭すぎると発火しづらいので調整可
            zIndex: 45,    // パネル(40)より前面、オーバーレイ(30)より前面
          }}
        />
      )}

      {/* スライドパネル */}
      <div
       onMouseLeave={onClose}
       style={{
        position: 'fixed', top: '57px', left: 0,
        bottom: `${footerHeight}px`, width: sidebarOpen ? `${SIDEBAR_WIDTH}px` : '0px',
        background: theme.surface,
        borderRight: sidebarOpen ? `1px solid ${theme.border}` : 'none',
        overflow: 'hidden',
        transition: 'width 0.3s ease',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 8px 8px', minWidth: '200px',
          display: 'flex', flexDirection: 'column',
          flex: 1, minHeight: 0,
        }}>
          <p style={{
            fontSize: '11px', color: theme.subtext, margin: '0 0 10px 4px',
            letterSpacing: '0.1em', flexShrink: 0,
          }}>
            ページ切り替え
          </p>

          <div style={{
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            {PAGES.map(page => (
              <div
                key={page.key}
                onClick={() => { onPageChange(page.key); onClose() }}
                style={{
                  flex: 1, minHeight: 0,
                  display: 'flex', flexDirection: 'column',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  border: `1px solid ${currentPage === page.key ? theme.accent : 'transparent'}`,
                  background: currentPage === page.key ? `${theme.accent}11` : 'transparent',
                  padding: '6px',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  padding: '2px 4px', fontSize: '12px',
                  color: currentPage === page.key ? theme.accent : theme.text,
                  fontWeight: currentPage === page.key ? 'bold' : 'normal',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  marginBottom: '4px',
                  flexShrink: 0,
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: currentPage === page.key ? theme.accent : theme.subtext,
                    flexShrink: 0,
                  }} />
                  {page.label}
                </div>

                <div style={{
                  flex: 1, minHeight: 0,
                  overflow: 'hidden',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  opacity: 0.7,
                }}>
                  <PreviewThumb>
                    {renderPreview(page.key)}
                  </PreviewThumb>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* オーバーレイ */}
      {sidebarOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.3)' }}
        />
      )}
    </>
  )
}