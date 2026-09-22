import { useEffect, useRef, type ReactNode } from 'react'
import type { Theme } from '../../types'
import { useIsMobile } from '../../hooks/useMediaQuery'
import './JobFlowDiagram.css'

interface FlowNodeDef {
  id: string
  kind: 'process' | 'decision' | 'terminal'
  /** ラベル文字列。"\n" で改行 */
  label: string
  /**
   * PLCの現在ステップレジスタ（D100など、アドレス未定）と対応させる仮番号。
   * 実アドレス確定後、PLC側の実際のステップ値に合わせて書き換えてください。
   * 全体フロー=1〜、RB1フロー=21〜、RB2フロー=31〜 の範囲で仮採番しています。
   */
  plcStep?: number
}

/** 判定結果の色（テーマに依存せず固定。うっすら赤＝異常系の視認性を優先） */
const OK_COLOR = '#4fbf8f'
const NG_COLOR = '#d9713c'

// ── ①全体フロー（フロー画面草案.pdf「全体」を参照） ─────────────────────
// 刃物取付 → 刃物取外 → 検査 → 検査結果OK？
//   YES（OK） … 刃物交換を飛ばして「刃物ストックへ返却」へ
//   NO （NG） … 刃物交換 → 刃物ストックへ返却
// → 動作準備 → （先頭「刃物取付」へループ）
//
// D15000（config/jobFlowAddresses.ts）の確定値：
// 1:刃物取付 2:刃物取外 3:検査 4:検査結果OK？ 5:OK 6:NG 7:刃物交換 8:刃物ストックへ返却 9:動作準備
// 5(OK)・6(NG)はPLCが判定確定の瞬間だけ送る値で、進捗（n/m工程）には含めない。
// 表示上は専用ノードを設けず、従来どおり検査結果ノード（ov-d）をOK/NGの色付きチップに
// 差し替えるresolvedChipの仕組みで表現する（resolved判定にはngSignalを使用。
// activeStepの5/6は瞬間値のためそれだけでは7〜9到達後にOK/NGを区別できない）。
// 検査結果に到達したら判定信号に応じて後続工程を表示する。
// NOは刃物交換を経由し、YESは刃物交換を飛ばして刃物ストックへ返却する。
const OVERALL_FLOW: FlowNodeDef[] = [
  { id: 'ov-1', kind: 'process', label: '刃物取付', plcStep: 1 },
  { id: 'ov-3', kind: 'process', label: '刃物取外', plcStep: 2 },
  { id: 'ov-4', kind: 'process', label: '検査', plcStep: 3 },
  { id: 'ov-d', kind: 'decision', label: '検査結果\nOK？', plcStep: 4 },
  { id: 'ov-5', kind: 'process', label: '刃物交換', plcStep: 7 },
  { id: 'ov-6', kind: 'process', label: '刃物ストックへ\n返却', plcStep: 8 },
  { id: 'ov-7', kind: 'process', label: '動作準備', plcStep: 9 },
]
const OVERALL_DECISION_STEP = OVERALL_FLOW.find((n) => n.id === 'ov-d')!.plcStep!

/** 「n/m工程」の進捗を、plcStepを持つノードの数から計算する */
function computeProgress(nodes: FlowNodeDef[], activeStep: number | undefined, totalOverride?: number) {
  const stepped = nodes.filter((n) => n.plcStep !== undefined)
  const total = totalOverride ?? stepped.length
  if (activeStep === undefined) return { current: 0, total }
  let current = 0
  stepped.forEach((n, i) => {
    if (n.plcStep! <= activeStep) current = i + 1
  })
  return { current, total }
}

/**
 * 全体フローの表示ノードを、検査結果が判明しているかどうかに応じて組み立てる。
 * 判明前：検査結果の分岐（◆）まで表示。NOなら「刃物交換」を挟み、YESなら飛ばす。
 * 進捗の分母は「基本工程が多いパターン（NG＝7工程）」を初期値とし、
 * OKと判明した時点で6工程に縮める。
 */
function resolveOverallFlow(activeStep: number | undefined, ngSignal: boolean | undefined) {
  const resolved = activeStep !== undefined && activeStep >= OVERALL_DECISION_STEP && ngSignal !== undefined
  const nodes = OVERALL_FLOW
  const progressNodes = resolved && ngSignal === false ? nodes.filter((n) => n.id !== 'ov-5') : nodes
  const progress = computeProgress(progressNodes, activeStep, resolved ? undefined : OVERALL_FLOW.length)
  return { nodes, resolved, progress }
}

// ══════════════════════════════════════════════════════════════════════
// 共通エンジン：全フロー（全体／RB1／RB2）で同じ形状（矩形・ひし形・端子）を
// 使う横並びSVG図。ノードごとに必要な行数分の高さ・幅を確保し、ラベルの
// 被りを防ぐ。戻りループの矢印は使わず、必要な場合は呼び出し側で
// キャプションテキストとして表示する。
// ══════════════════════════════════════════════════════════════════════

interface SizingConfig {
  boxW: number
  boxH: number
  diamondW: number
  diamondH: number
  termW: number
  termH: number
  gapX: number
  leftPad: number
  rightPad: number
  topPad: number
  bottomPad: number
  lineHeight: number
}

/** ノード1個あたりの最小幅目安（全角1文字＝約17px、左右余白込み）。ラベルの被りを防ぐため文字数に応じて広げる
 *  ※このフロー図（FlowCanvas）はモニタ（52インチ等の大画面）専用表示。モバイルは
 *  CurrentStepView（現在工程のみのシンプル表示）を使うため、文字サイズと箱の大きさは
 *  常にモニタでの視認性を優先してよい（下のCSSのフォントサイズと連動させること）。 */
function estimateNodeWidth(label: string, minWidth: number, charPx = 20, padding = 34) {
  const longestLine = Math.max(...label.split('\n').map((l) => l.length))
  return Math.max(minWidth, longestLine * charPx + padding)
}

const OVERALL_SIZING: SizingConfig = {
  boxW: 170,
  boxH: 68,
  diamondW: 124,
  diamondH: 108,
  termW: 96,
  termH: 50,
  gapX: 28,
  leftPad: 14,
  rightPad: 14,
  topPad: 24,
  bottomPad: 24,
  lineHeight: 21,
}

interface HorizontalPositioned {
  node: FlowNodeDef
  cx: number
  left: number
  right: number
  width: number
  height: number
  lines: string[]
}

function layoutHorizontal(nodes: FlowNodeDef[], s: SizingConfig) {
  let x = s.leftPad
  const maxH = Math.max(s.boxH, s.diamondH, s.termH)
  const rowCenterY = s.topPad + maxH / 2
  const positioned: HorizontalPositioned[] = nodes.map((node) => {
    const baseW = node.kind === 'decision' ? s.diamondW : node.kind === 'terminal' ? s.termW : s.boxW
    const width = node.kind === 'terminal' ? baseW : estimateNodeWidth(node.label, baseW)
    const height = node.kind === 'decision' ? s.diamondH : node.kind === 'terminal' ? s.termH : s.boxH
    const left = x
    const right = x + width
    const cx = x + width / 2
    x = right + s.gapX
    return { node, cx, left, right, width, height, lines: node.label.split('\n') }
  })
  const totalW = Math.max(x - s.gapX + s.rightPad, 0)
  const totalH = s.topPad + maxH + s.bottomPad
  return { positioned, totalW, totalH, rowCenterY }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

interface ResolvedChip {
  nodeId: string
  label: string
  color: string
}

interface FlowCanvasProps {
  theme: Theme
  nodes: FlowNodeDef[]
  sizing: SizingConfig
  markerId: string
  activeStep?: number
  /** 判定確定後、指定ノードを色付きチップ表示に差し替える（全体フローのOK/NG用） */
  resolvedChip?: ResolvedChip
  /** trueの場合、現在工程が常に見える位置へ自動スライドする */
  autoSlide?: boolean
  /** 枠の高さなどを個別指定するための追加クラス名 */
  scrollClassName?: string
}

function FlowCanvas({ theme, nodes, sizing: s, markerId, activeStep, resolvedChip, autoSlide, scrollClassName }: FlowCanvasProps) {
  const { positioned, totalW, totalH, rowCenterY } = layoutHorizontal(nodes, s)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeIdx = positioned.findIndex((p) => p.node.plcStep !== undefined && p.node.plcStep === activeStep)
  const focusTarget = activeIdx >= 0 ? positioned[activeIdx] : undefined

  useEffect(() => {
    if (!autoSlide) return
    const el = scrollRef.current
    const target = focusTarget ?? positioned[positioned.length - 1]
    if (!el || !target) return
    const containerW = el.clientWidth || totalW
    const left = clamp(target.cx - containerW / 2, 0, Math.max(totalW - containerW, 0))
    el.scrollTo({ left, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSlide, activeStep, nodes.length])

  const isActive = (p: HorizontalPositioned) => p.node.plcStep !== undefined && activeStep !== undefined && p.node.plcStep === activeStep

  /** 現在工程が判明している間だけ、それ以外のノードを暗め表示にする（仕様書：現在工程を強調、それ以外は暗め） */
  const hasActive = activeStep !== undefined
  const nodeOpacity = (active: boolean) => (!hasActive || active ? 1 : 0.4)

  const renderLines = (p: HorizontalPositioned, cx: number, labelClass: string, fill: string) => {
    const lineDy = s.lineHeight
    const startDy = -((p.lines.length - 1) * lineDy) / 2
    return (
      <text x={cx} y={rowCenterY + startDy} dominantBaseline="middle" textAnchor="middle" className={labelClass} fill={fill}>
        {p.lines.map((line, li) => (
          <tspan key={li} x={cx} dy={li === 0 ? 0 : lineDy}>
            {line}
          </tspan>
        ))}
      </text>
    )
  }

  const renderChip = (p: HorizontalPositioned, chip: ResolvedChip) => {
    const y = rowCenterY - p.height / 4
    const h = p.height / 2
    return (
      <g key={p.node.id} className="flow__node" opacity={nodeOpacity(true)}>
        <rect x={p.left} y={y} width={p.width} height={h} rx={h / 2} fill={chip.color} />
        <text x={p.cx} y={y + h / 2} dominantBaseline="middle" textAnchor="middle" className="flow__terminal-label" fill="#fff">
          {chip.label}
        </text>
      </g>
    )
  }

  const renderDiamond = (p: HorizontalPositioned) => {
    const active = isActive(p)
    const strokeColor = active ? theme.accent : theme.border
    const groupClass = active ? 'flow__node flow__node--active' : 'flow__node'
    const points = [
      [p.left, rowCenterY],
      [p.cx, rowCenterY - p.height / 2],
      [p.right, rowCenterY],
      [p.cx, rowCenterY + p.height / 2],
    ]
      .map((pt) => pt.join(','))
      .join(' ')
    return (
      <g key={p.node.id} className={groupClass} opacity={nodeOpacity(active)}>
        {active && <polygon className="flow__active-glow" points={points} fill="none" stroke={theme.accent} strokeWidth={9} />}
        <polygon points={points} fill={theme.surface} stroke={strokeColor} strokeWidth={active ? 3 : 1.5} />
        {renderLines(p, p.cx, 'flow__label flow__label--sm', theme.subtext)}
      </g>
    )
  }

  const renderTerminal = (p: HorizontalPositioned) => {
    const active = isActive(p)
    const strokeColor = active ? theme.accent : theme.border
    const groupClass = active ? 'flow__node flow__node--active' : 'flow__node'
    const y = rowCenterY - p.height / 2
    const rx = p.height / 2
    return (
      <g key={p.node.id} className={groupClass} opacity={nodeOpacity(active)}>
        <rect x={p.left} y={y} width={p.width} height={p.height} rx={rx} fill={theme.surface} stroke={strokeColor} strokeWidth={active ? 3 : 1.5} />
        <text x={p.cx} y={rowCenterY} dominantBaseline="middle" textAnchor="middle" className="flow__terminal-label" fill={theme.subtext}>
          {p.node.label}
        </text>
      </g>
    )
  }

  const renderBox = (p: HorizontalPositioned) => {
    const active = isActive(p)
    const strokeColor = active ? theme.accent : theme.border
    const groupClass = active ? 'flow__node flow__node--active' : 'flow__node'
    const labelClass = p.lines.length > 1 ? 'flow__label flow__label--sm' : 'flow__label'
    const y = rowCenterY - p.height / 2

    return (
      <g key={p.node.id} className={groupClass} opacity={nodeOpacity(active)}>
        {active && (
          <rect
            className="flow__active-glow"
            x={p.left - 5}
            y={y - 5}
            width={p.width + 10}
            height={p.height + 10}
            rx={7}
            fill="none"
            stroke={theme.accent}
            strokeWidth={8}
          />
        )}
        <rect x={p.left} y={y} width={p.width} height={p.height} rx={5} fill={theme.surface} stroke={strokeColor} strokeWidth={active ? 3 : 1.5} />
        <rect x={p.left} y={y} width={4} height={p.height} fill={theme.accent} rx={2} />
        {renderLines(p, p.cx + 3, labelClass, theme.subtext)}
      </g>
    )
  }

  const renderNode = (p: HorizontalPositioned) => {
    if (resolvedChip && p.node.id === resolvedChip.nodeId) return renderChip(p, resolvedChip)
    if (p.node.kind === 'decision') return renderDiamond(p)
    if (p.node.kind === 'terminal') return renderTerminal(p)
    return renderBox(p)
  }



  return (
    <div
      className={`op-results__flow-scroll${scrollClassName ? ` ${scrollClassName}` : ''}`}
      ref={scrollRef}
      style={{ border: `1px solid ${theme.border}`, background: theme.surface }}
    >
      <div className="flow-diagram-wrap">
        <svg className="flow-diagram" width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}>
          <defs>
            <marker id={markerId} markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill={theme.subtext} />
            </marker>
          </defs>
          {positioned.map((p) => renderNode(p))}
          {positioned.slice(0, -1).map((p, i) => {
            const next = positioned[i + 1]
            return (
              <line
                key={`${p.node.id}-arrow`}
                x1={p.right}
                y1={rowCenterY}
                x2={next.left}
                y2={rowCenterY}
                stroke={theme.accent}
                strokeWidth={2}
                markerEnd={`url(#${markerId})`}
              />
            )
          })}
          {/* 現在工程を指すポインター。工程が進むとtransformのtransitionでスライド移動する
              （仕様書：フロー上を移動するポインター／工程移動時は滑らかに遷移） */}
          {focusTarget && (
            <g
              style={{ transition: 'transform 0.5s ease' }}
              transform={`translate(${focusTarget.cx}, ${rowCenterY - focusTarget.height / 2 - 14})`}
            >
              <g className="flow__pointer">
                <path d="M0,-2 L-8,-16 L8,-16 Z" fill={theme.accent} />
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

interface FlowPanelProps {
  theme: Theme
  title: string
  progress: { current: number; total: number }
  children: ReactNode
}

function FlowPanel({ theme, title, progress, children }: FlowPanelProps) {
  return (
    <div className="flow-diagram-panel">
      <div className="flow-diagram-panel-head">
        <span className="flow-diagram-panel-title" style={{ color: theme.text }}>
          {title}
        </span>
        <span className="flow-diagram-progress" style={{ color: theme.subtext }}>
          進捗 {progress.current || '--'}/{progress.total}工程
        </span>
      </div>
      {children}
    </div>
  )
}

/** モバイルで表示する「現在工程」の中身（通常の工程名、または判定確定後のOK/NGチップ） */
interface CurrentStepInfo {
  label: string
  chipColor?: string
}

/** activeStepに対応する「現在工程」を1件だけ探す。判定確定後はOK/NGチップに差し替える */
function findCurrentStep(
  nodes: FlowNodeDef[],
  activeStep: number | undefined,
  resolvedChip?: ResolvedChip
): CurrentStepInfo | undefined {
  if (activeStep === undefined) return undefined
  let current: FlowNodeDef | undefined
  nodes.forEach((n) => {
    if (n.plcStep !== undefined && n.plcStep <= activeStep) current = n
  })
  if (!current) return undefined
  if (resolvedChip && current.id === resolvedChip.nodeId) {
    return { label: resolvedChip.label, chipColor: resolvedChip.color }
  }
  return { label: current.label.replace(/\n/g, ' ') }
}

export interface OverallFlowStatus {
  currentLabel?: string
  current: number
  total: number
}

/** WORKFLOWと同じ全体工程情報を、他の表示（STATUSのRB1カードなど）でも使う。 */
export function getOverallFlowStatus(
  activeStep: number | undefined,
  ngSignal?: boolean,
): OverallFlowStatus {
  const { nodes, resolved, progress } = resolveOverallFlow(activeStep, ngSignal)
  const resolvedChip = resolved
    ? { nodeId: 'ov-d', label: ngSignal ? 'NG' : 'OK', color: ngSignal ? NG_COLOR : OK_COLOR }
    : undefined
  const current = findCurrentStep(nodes, activeStep, resolvedChip)

  return {
    currentLabel: current?.label,
    current: progress.current,
    total: progress.total,
  }
}

/** モバイル専用：フロー図（横スクロール）の代わりに現在工程だけをシンプルに表示する */
function CurrentStepView({
  theme,
  title,
  progress,
  current,
}: {
  theme: Theme
  title: string
  progress: { current: number; total: number }
  current?: CurrentStepInfo
}) {
  return (
    <div className="flow-diagram-panel">
      <div className="flow-diagram-panel-head">
        <span className="flow-diagram-panel-title" style={{ color: theme.text }}>
          {title}
        </span>
        <span className="flow-diagram-progress" style={{ color: theme.subtext }}>
          進捗 {progress.current || '--'}/{progress.total}工程
        </span>
      </div>
      <div className="flow-current-step" style={{ borderColor: theme.border, background: theme.surface }}>
        {current ? (
          <span
            className="flow-current-step__label"
            style={
              current.chipColor
                ? { background: current.chipColor, color: '#fff' }
                : { color: theme.text }
            }
          >
            {current.label}
          </span>
        ) : (
          <span className="flow-current-step__label" style={{ color: theme.subtext }}>
            --
          </span>
        )}
      </div>
    </div>
  )
}

interface JobFlowDiagramProps {
  theme: Theme
  /** PLCのDレジスタ（現在工程ステップ）から受け取る値。該当工程を強調表示します。 */
  activeStep?: number
  /** PLCのNG判定信号（true = NG検出中）。全体フローの分岐確定に使用します。 */
  ngSignal?: boolean
}

/** 全体フロー図（自動スライド方式・枠で囲んだ表示）。RB1／RB2フローは改修仕様書により廃止済み。
 *  モバイルでは横スクロールのフロー図自体が不要なため、現在工程のみを表示する簡易ビューに切り替える。 */
export default function JobFlowDiagram({ theme, activeStep, ngSignal }: JobFlowDiagramProps) {
  const isMobile = useIsMobile()
  const { nodes, resolved, progress } = resolveOverallFlow(activeStep, ngSignal)
  const resolvedChip = resolved ? { nodeId: 'ov-d', label: ngSignal ? 'NG' : 'OK', color: ngSignal ? NG_COLOR : OK_COLOR } : undefined

  if (isMobile) {
    const current = findCurrentStep(nodes, activeStep, resolvedChip)
    return <CurrentStepView theme={theme} title=" " progress={progress} current={current} />
  }

  return (
    <FlowPanel theme={theme} title=" " progress={progress}>
      <FlowCanvas
        theme={theme}
        nodes={nodes}
        sizing={OVERALL_SIZING}
        markerId="flow-arrow-overall"
        activeStep={activeStep}
        resolvedChip={resolvedChip}
        autoSlide
        scrollClassName="op-results__flow-scroll--overall"
      />
    </FlowPanel>
  )
}
