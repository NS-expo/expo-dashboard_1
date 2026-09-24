// UtilizationRateDisplay.tsx
//
// 変更点：
// ・これまでリング色はcolorKey（'RB1'|'RB2'）に基づく内部固定色のみだったため、
//   OperationStatus側の編集パネルでRB1/RB2色を変更してもドーナツの色は
//   追従しなかった。外部からcolor（実際に使用中のRB色）を渡せるようにし、
//   渡された場合はそちらを優先する形にした（省略時は従来どおりcolorKeyの固定色）。
// ・trackColorも同様に外部から上書きできるようにした（省略時は従来色）

export type UtilizationColorKey = 'RB1' | 'RB2'

interface Props {
  label: string // 例: 'RB1'。空文字なら見出しを表示しない
  rate: number // 0-100 (%)
  /** リング色（RB1/RB2で色分け）。省略時はRB1色。 */
  colorKey?: UtilizationColorKey
  /** リングの実際の色。編集パネルで変更されたRB1/RB2色を渡す。省略時はcolorKeyの固定色 */
  color?: string
  /** 未達成部分（トラック）の色。省略時は既定色 */
  trackColor?: string
  /** RobotPanelのヘッダーなど、小さく凡例なしで表示したい場合に true */
  compact?: boolean
}

// RB1/RB2で色分け（軸別トルク使用率のバー色と統一）。colorが渡されない場合のフォールバック
const RING_COLOR: Record<UtilizationColorKey, string> = {
  RB1: '#3b82f6', // 青
  RB2: '#ff9a3d', // 橙
}

const DEFAULT_TRACK_COLOR = 'var(--border-soft, #2a3650)'

export default function UtilizationRateDisplay({
  label,
  rate,
  colorKey = 'RB1',
  color,
  trackColor = DEFAULT_TRACK_COLOR,
  compact = false,
}: Props) {
  const clamped = Math.min(200, Math.max(0, rate))
  const ringColor = color ?? RING_COLOR[colorKey]

  return (
    <div className={`utilization-donut${compact ? ' utilization-donut--compact' : ''}`}>
      {label && <div className="utilization-donut__label">{label}</div>}
      <div className="utilization-donut__ring">
        <svg viewBox="0 0 100 100">
          <circle
            cx={50}
            cy={50}
            r={40}
            className="utilization-donut__track"
            style={{ stroke: trackColor }}
            pathLength={100}
          />
          <circle
            cx={50}
            cy={50}
            r={40}
            className="utilization-donut__value"
            style={{
              stroke: ringColor,
              strokeDasharray: `${clamped} ${100 - clamped}`,
            }}
            pathLength={100}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="utilization-donut__center">
          <span className="utilization-donut__number">{clamped.toFixed(0)}</span>
          <span className="utilization-donut__percent">%</span>
          {!compact && <span className="utilization-donut__caption">運転</span>}
        </div>
      </div>
      {!compact && (
        <div className="utilization-donut__legend">
          <span>
            <i style={{ background: ringColor }} />
            運転
          </span>
          <span>
            <i style={{ background: trackColor }} />
            停止
          </span>
        </div>
      )}
    </div>
  )
}
