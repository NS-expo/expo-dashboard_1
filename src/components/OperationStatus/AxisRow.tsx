// AxisRow.tsx
//
// STATUS画面仕様変更（再修正）対応：
// 「速度ゲージ」「トルクバー」を横に2本並べる構成をやめ、1軸＝1枚のカード
// （AxisMetricCard：トルク行＋速度行の2段構成）にまとめた。本コンポーネントは
// 引き続き「RB1側だけ」または「RB2側だけ」の軸データ1行分を受け取り、
// 色・しきい値判定（警告色への切替）をAxisMetricCardに渡す役割のみを持つ。
//
// 行の高さは軸ごとに均等ではなく、RobotAxisDiagramと共有するAXIS_ROW_FLEX比率
// （関節間隔のイメージ）に合わせたflexGrowを呼び出し側（OperationStatus.tsx）
// から受け取る。これにより模式図の関節位置とデータ行の高さが常に一致する。

import AxisMetricCard from './AxisMetricCard'
import { RB1_COLOR, RB2_COLOR, WARN_COLOR } from './robotColors'

/** 軸データ1行分（RB1・RB2両方）。AxisTable.tsx（モバイル表）側は
 * 引き続きこの結合済みの形を使うため、型はそのまま維持している。 */
export interface AxisRowData {
  axis: number
  /** 軸の表示名。S/L/U/R/B/T固定（OperationStatus.tsx側でAXIS_NAMESから設定） */
  axisLabel?: string
  rb1: { torqueValue: number; torquePeak: number; speed: number }
  rb2: { torqueValue: number; torquePeak: number; speed: number }
}

/** 片側（RB1 or RB2）1軸分のデータ */
export interface AxisSideData {
  axis: number
  torqueValue: number
  torquePeak: number
  speed: number
}

interface Props {
  data: AxisSideData
  side: 'rb1' | 'rb2'
  /** しきい値（%）。現状はAxisMetricCard側では未使用だが、呼び出し側との
   * インターフェース互換のため引き続き受け取る（しきい値ラインの再追加に備える）。 */
  threshold: number
  /** 編集パネルで変更されたRB色。省略時はside側のデフォルト色 */
  color?: string
  /** 80%でON、70%以下を3秒維持してOFFする軸警告状態 */
  isWarning?: boolean
  /** ロボット模式図の関節間隔（AXIS_ROW_FLEX）に合わせた行の高さ配分 */
  flexGrow: number
}

export default function AxisRow({ data, side, color, isWarning = false, flexGrow }: Props) {
  const defaultColor = side === 'rb1' ? RB1_COLOR : RB2_COLOR
  const baseColor = color ?? defaultColor
  const torqueColor = isWarning ? WARN_COLOR : baseColor

  return (
    <AxisMetricCard
      side={side}
      torqueValue={data.torqueValue}
      torquePeak={data.torquePeak}
      speedValue={data.speed}
      color={baseColor}
      torqueColor={torqueColor}
      isWarning={isWarning}
      flexGrow={flexGrow}
    />
  )
}
