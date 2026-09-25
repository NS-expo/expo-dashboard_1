// AxisTable.tsx
//
// 軸モニタのモバイル表示用。モバイルではグラフ／ゲージが見にくいという指摘のため、
// 軸ごとの数値を表（テーブル）形式で並べる。モバイルは横幅が短いため、
// 表自体は横スクロールできるようにしてあり、縦方向は親側でスクロールを許可する想定。
//
// 表示・非表示の切替はOperationStatus.css側のメディアクエリで行う
// （モニタ幅ではこの表を非表示、モバイル幅ではAxisRowのグリッド表示を非表示にする）。
//
// STATUS画面仕様変更（9. モバイル版簡略表示／10. モバイル版RB切替機能）対応：
// ・ヘッダーを2段構成にし、「RB1」「RB2」のロボット名は列見出しに1回だけ表示、
//   以降は色（rb1Color/rb2Color）で識別する（横スクロール発生時の繰り返し表示を削減）。
// ・セル内表示は「現在値%（Peak値%）」形式に統一し、「ピーク」の文字表記は廃止した
//   （モニタ版AxisMetricCardの表記と統一。旧「値% / Peak値%」形式から変更）。
// ・警告（しきい値80%到達〜70%以下で3秒維持して解除）はOperationStatus側の
//   warningAxes（モニタ版のaxis-row--warningと共通のヒステリシス付き判定）を
//   そのまま受け取る。仕様の最終イメージ「色は変化せずフリッカのみ」に合わせ、
//   文字色は変えずに点滅のみで通知する（モニタ版と動作を統一）。
// ・モバイルRB切替（タップした側を強調、もう一方を減光）に対応するため、
//   selectedRBを受け取り、非選択側の列を減光表示する。

import type { AxisRowData } from './AxisRow'
import type { Theme } from '../../types'
import type { RobotKey } from './OperationStatus'

interface Props {
  rows: AxisRowData[]
  threshold: number
  rb1Color: string
  rb2Color: string
  theme: Theme
  /** RB1/RB2ごとの軸別警告状態。省略時は全軸非警告扱い */
  warningAxesByRobot?: Record<RobotKey, boolean[]>
  warningAxes?: boolean[]
  /** モバイルRB切替で選択中のロボット。nullなら両方とも通常表示 */
  selectedRB?: RobotKey | null
}




export default function AxisTable({
  rows,
  rb1Color,
  rb2Color,
  theme,
  warningAxesByRobot,
  warningAxes = [],
  selectedRB = null,
}: Props) {
  const DIM_OPACITY = 0.35
  const rb1Dim = selectedRB === 'RB2'
  const rb2Dim = selectedRB === 'RB1'

  return (
    <div className="axis-table-scroll">
      <table className="axis-table">
        <thead>
          <tr>
            <th rowSpan={2} className="axis-table__axis-head" style={{ color: theme.subtext, borderColor: theme.border }}>
              軸
            </th>
            <th colSpan={2} className="axis-table__group-head" style={{ color: rb1Color, borderColor: theme.border, opacity: rb1Dim ? DIM_OPACITY : 1 }}>
              RB1
            </th>
            <th colSpan={2} className="axis-table__group-head" style={{ color: rb2Color, borderColor: theme.border, opacity: rb2Dim ? DIM_OPACITY : 1 }}>
              RB2
            </th>
          </tr>
          <tr>
            <th style={{ color: rb1Color, borderColor: theme.border, opacity: rb1Dim ? DIM_OPACITY : 1 }}>
              速度
            </th>
            <th style={{ color: rb1Color, borderColor: theme.border, opacity: rb1Dim ? DIM_OPACITY : 1 }}>
              トルク
            </th>
            <th style={{ color: rb2Color, borderColor: theme.border, opacity: rb2Dim ? DIM_OPACITY : 1 }}>
              速度
            </th>
            <th style={{ color: rb2Color, borderColor: theme.border, opacity: rb2Dim ? DIM_OPACITY : 1 }}>
              トルク
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // 現在値・Peak値の表記「値%（Peak値%）」はモニタ版（AxisMetricCard）と統一している
            const rb1IsWarning = warningAxesByRobot?.RB1[row.axis - 1] ?? warningAxes[row.axis - 1] ?? false
            const rb2IsWarning = warningAxesByRobot?.RB2[row.axis - 1] ?? warningAxes[row.axis - 1] ?? false
            
            return (
              <tr key={row.axis}>
                <td className="axis-table__label" style={{ color: theme.text, borderColor: theme.border }}>
                  {row.axisLabel ?? `軸${row.axis}`}
                </td>
                <td style={{ color: rb1Color, borderColor: theme.border, opacity: rb1Dim ? DIM_OPACITY : 1 }}>
                  {row.rb1.speed}%
                </td>
                <td
                  className={rb1IsWarning ? 'axis-table__cell--warning' : undefined}
                  style={{ color: rb1Color, borderColor: theme.border, opacity: rb1Dim ? DIM_OPACITY : 1 }}
                >
                  {row.rb1.torqueValue}%{' '}
                  <span className="axis-table__peak-value">
                    ({row.rb1.torquePeak}%)
                  </span>
                </td>
                <td style={{ color: rb2Color, borderColor: theme.border, opacity: rb2Dim ? DIM_OPACITY : 1 }}>
                  {row.rb2.speed}%
                </td>
                <td
                  className={rb2IsWarning ? 'axis-table__cell--warning' : undefined}
                  style={{ color: rb2Color, borderColor: theme.border, opacity: rb2Dim ? DIM_OPACITY : 1 }}
                >
                  {row.rb2.torqueValue}%{' '}
                  <span className="axis-table__peak-value">
                    ({row.rb2.torquePeak}%)
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
