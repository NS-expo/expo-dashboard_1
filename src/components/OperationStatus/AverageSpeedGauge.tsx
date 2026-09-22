// AverageSpeedGauge.tsx
//
// STATUS画面仕様変更（再修正）対応。
// 当初は「心電図のような折れ線グラフ」で6軸平均負荷（トルク%+速度%）を表示する予定だったが、
// 以下のとおり方針変更：
// ・見た目：透明ガラス調・近未来感のある横長ゲージ（工場設備のUIらしい質感）に変更
// ・算出方法：「トルク%+速度%の平均」ではなく「速度%の平均のみ」に変更
// ・数値ラベル（%表記）は表示しない。バーの充填度合いのみで度合いを見せる
//
// 色はRB1/RB2のtheme色（編集パネルでのカスタムカラーにも追従）に合わせて発光させる。

import type { CSSProperties } from 'react'

interface Props {
  /** 6軸平均値（実値%） */
  value: number
  /** ゲージを100%として扱う実値。省略時は100。 */
  maxValue?: number
  /** ゲージの発光色・充填色（rb1Color / rb2Color） */
  color: string
  /** ゲージ内のラベル文言（例：'RB1 平均速度'） */
  label: string
  /** trueの場合、ゲージを右端から左向きに満たす */
  reverse?: boolean
  /** trueの場合、アイコンを右側、ラベルを右寄せにする */
  iconOnRight?: boolean
}

function clampPct(v: number) {
  return Math.min(100, Math.max(0, v))
}

export default function AverageSpeedGauge({ value, maxValue = 100, color, label, reverse = false, iconOnRight = false }: Props) {
  const pct = clampPct((value / maxValue) * 100)

  const fillStyle: CSSProperties = {
    width: `${pct}%`,
    background: reverse
      ? `linear-gradient(90deg, ${color}, ${color}66)`
      : `linear-gradient(90deg, ${color}66, ${color})`,
    boxShadow: `0 0 10px ${color}, 0 0 22px ${color}66`,
  }

  return (
    <div
      className={`speed-gauge${iconOnRight ? ' speed-gauge--icon-right' : ''}`}
      style={{ borderColor: `${color}55`, boxShadow: `0 0 18px ${color}22` }}
    >
      <div className="speed-gauge__icon" style={{ color }}>
        {/* ロボットアームのシンプルなシルエットアイコン */}
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none" />
          <path d="M5 19 L5 15 L11 12 L11 7" />
          <circle cx="11" cy="7" r="1.4" fill="currentColor" stroke="none" />
          <path d="M11 7 L16.5 5" />
          <circle cx="17.5" cy="4.6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <div className="speed-gauge__divider" />

      <div className="speed-gauge__body">
        <div className="speed-gauge__label" style={{ color }}>
          {label}
        </div>
        <div className={`speed-gauge__track${reverse ? ' speed-gauge__track--reverse' : ''}`}>
          <div className="speed-gauge__fill" style={fillStyle} />
        </div>
      </div>
    </div>
  )
}
