// AxisMetricCard.tsx
//
// STATUS画面仕様変更（再修正）対応：
// これまで「速度ゲージ（外側）」「トルクバー（内側）」を横に2本並べて1軸分を表現
// していたが、指示により1軸＝1枚の「トルク＋速度」まとめカードに統合した。
// ・カード内はトルク行／速度行の2段構成。各行の先頭にアイコン＋英語名称
//   （TORQUE／SPEED）を表示する。これにより行ごとに繰り返していた見出し
//   （旧axis-monitor__speed-caption「速度」・axis-monitor__torque-badge「トルク」）
//   の大きな文字＋箱は不要になったため、OperationStatus.tsx側で削除した。
// ・ピーク値の表記は「値% / ピーク%」から「値%（ピーク%）」に変更した。
// ・見た目はAverageSpeedGauge・旧SpeedBar/TorqueBarと統一感のあるガラス調。

import type { CSSProperties } from 'react'

interface Props {
  side: 'rb1' | 'rb2'
  torqueValue: number
  torquePeak: number
  speedValue: number
  /** バー本体の色（RB1/RB2のtheme色。編集パネルのカスタムカラーにも追従） */
  color: string
  /** トルク行の色。しきい値超過時はWARN_COLORを渡す想定（AxisRow.tsx側で判定） */
  torqueColor: string
  /** 80%でON、70%以下を3秒維持してOFFする軸警告状態 */
  isWarning?: boolean
  /** ロボット模式図の関節間隔（AXIS_ROW_FLEX）に合わせた行の高さ配分 */
  flexGrow: number
}

function pct(v: number) {
  return Math.min(100, Math.max(0, v))
}

// ピーク値の色。バー本体色（RB1/RB2の任意色）に埋もれない明るい黄色で固定する
// （旧TorqueBar.tsxのpeakColorと同じ値）
const PEAK_COLOR = '#ffeb3b'

const GEAR_TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

function TorqueIcon({ color }: { color: string }) {
  // トルク＝回転力を表す歯車アイコン。歯（塗りつぶしの角丸片）を8枚配置し、
  // 中央のリングと合わせて「歯車」に見える形にする。右上の円弧＋矢先で
  // 回転していることを示す（旧版は直線のみで太陽のように見えていたため変更）。
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GEAR_TEETH_ANGLES.map((deg) => (
        <rect
          key={deg}
          x="10.8"
          y="1.4"
          width="2.4"
          height="3.4"
          rx="0.6"
          fill={color}
          stroke="none"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="2" fill={color} stroke="none" />
      {/* 回転方向を示す矢印 */}
      <path d="M19 8.2a7.4 7.4 0 0 1 .6 5.1" />
      <path d="M20.2 12.6 L18.4 13.9 L18.8 11.6 Z" fill={color} stroke="none" />
    </svg>
  )
}

function SpeedIcon({ color }: { color: string }) {
  // 汎用の速度計（スピードメーター）アイコン。旧SpeedBar.tsxと同じ意匠。
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16 L16.2 10.4" />
      <circle cx="12" cy="16" r="1.3" fill={color} stroke="none" />
    </svg>
  )
}

export default function AxisMetricCard({
  side,
  torqueValue,
  torquePeak,
  speedValue,
  color,
  torqueColor,
  isWarning = false,
  flexGrow,
}: Props) {
  const torqueFillStyle: CSSProperties = {
    width: `${pct(torqueValue)}%`,
    background: torqueColor,
    boxShadow: `0 0 8px ${torqueColor}99`,
  }
  const speedFillStyle: CSSProperties = {
    width: `${pct(speedValue)}%`,
    background: `linear-gradient(90deg, ${color}66, ${color})`,
    boxShadow: `0 0 8px ${color}99`,
  }

  return (
    <div
      className={`axis-metric-card axis-metric-card--${side}${isWarning ? ' axis-metric-card--warning' : ''}`}
      style={{ flexGrow, flexBasis: 0, borderColor: `${color}55` }}
    >
      <div className="axis-metric-card__row">
        <span className="axis-metric-card__tag" style={{ color: torqueColor }}>
          <TorqueIcon color={torqueColor} />
          TORQUE
        </span>
        <div className="axis-metric-card__track">
          <div className="axis-metric-card__fill" style={torqueFillStyle} />
        </div>
        <span className="axis-metric-card__value" style={{ color: torqueColor }}>
          {torqueValue}%
          <span className="axis-metric-card__peak" style={{ color: PEAK_COLOR }}>
            {' '}
            ({torquePeak}%)
          </span>
        </span>
      </div>

      <div className="axis-metric-card__row">
        <span className="axis-metric-card__tag" style={{ color }}>
          <SpeedIcon color={color} />
          SPEED
        </span>
        <div className="axis-metric-card__track">
          <div className="axis-metric-card__fill" style={speedFillStyle} />
        </div>
        <span className="axis-metric-card__value" style={{ color }}>
          {speedValue}%
        </span>
      </div>
    </div>
  )
}
