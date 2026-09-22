// OperationStatus.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PanelFrame from '../common/PanelFrame'
import type { Theme, ThemeMode } from '../../types'

import RobotHeaderBadge from './RobotHeaderBadge'
import AxisRow, { type AxisRowData, type AxisSideData } from './AxisRow'
import AxisTable from './AxisTable'
import AverageSpeedGauge from './AverageSpeedGauge'
import RobotAxisDiagram, { AXIS_NAMES, AXIS_DISPLAY_ORDER, IMAGE_JOINT_X, IMAGE_JOINT_Y, computeContainRect, type AxisName } from './RobotAxisDiagram'
import { RB1_COLOR, RB2_COLOR } from './robotColors'

import './OperationStatus.css'

export interface AxisStat {
  speed: number // MAX比(%)。PLC対象外のためサンプル値運用（config/robotStatusAddresses.ts 参照）
  torque: number // 定格トルク比(%)。PLC(Dレジスタ、未定)から取得予定
  /** トルクのピーク値（%）。PLC(Dレジスタ、未定)から取得予定 */
  peakTorque: number
}

export type RobotKey = 'RB1' | 'RB2'

export interface RobotStat {
  motors: AxisStat[] // 長さ6を想定。根元から順にS,L,U,R,B,Tに対応（motors[0]=S 〜 motors[5]=T）
  /** 稼働率（PLC由来。%）。Dレジスタのアドレスは config/robotStatusAddresses.ts を参照 */
  utilizationRate: number
}

interface OperationStatusProps {
  theme: Theme
  themeMode: ThemeMode
  imageUrl?: string
  robotRB1: RobotStat
  robotRB2: RobotStat
  /** 現状このページでは非表示（稼働実績ページ側で表示）。互換性のためpropsは残す */
  cycleTime?: number
  isEditing: boolean
  onEditingChange: (value: boolean) => void
}

// しきい値（トルク・速度どちらも同じ%で判定）
const THRESHOLD = 80
const WARNING_RELEASE_THRESHOLD = 70
const WARNING_RELEASE_DELAY_MS = 3000

// カード側の接続点から少し水平に伸ばしてから関節へ折れ曲がる「エルボー」形状にする
// ことで、線が必ずカードの端の縦方向中央から水平に出ているように見せる
// （直線1本だけだと、着地点の高さ次第で「中央から出ていない」ように見えてしまうため）。
const CONNECTOR_STUB = 20

interface ConnectorLine {
  axis: AxisName
  /** RB1カード（右端中央）→模式図の関節へのエルボー折れ線のSVG path */
  leftPath: string
  /** RB2カード（左端中央）→模式図の関節へのエルボー折れ線のSVG path */
  rightPath: string
}

export default function OperationStatus({
  theme,
  themeMode,
  robotRB1,
  robotRB2,
  isEditing,
  onEditingChange,
}: OperationStatusProps) {
  const axisCount = 6 // S,L,U,R,B,Tの6軸固定（安川協働ロボット：6軸垂直多関節）

  // RB1/RB2カラーの編集（参考：OperationResults.tsxの色編集パターン）
  const [customColors, setCustomColors] = useState<{ rb1?: string; rb2?: string }>({})
  const rb1Color = customColors.rb1 ?? RB1_COLOR
  const rb2Color = customColors.rb2 ?? RB2_COLOR
  const handleResetColors = () => setCustomColors({})

  // テーマの明暗に合わせてロボット画像も切り替える。
  const robotImageMode = themeMode

  // 軸名称はS/L/U/R/B/T固定（安川協働ロボットの実際の関節位置に対応させるため、
  // 数字のラベルや編集パネルでの名称変更は廃止した）
  const axisRows: AxisRowData[] = Array.from({ length: axisCount }, (_, i) => ({
    axis: i + 1,
    axisLabel: AXIS_NAMES[i],
    rb1: {
      torqueValue: robotRB1.motors[i]?.torque ?? 0,
      torquePeak: robotRB1.motors[i]?.peakTorque ?? 0,
      speed: robotRB1.motors[i]?.speed ?? 0,
    },
    rb2: {
      torqueValue: robotRB2.motors[i]?.torque ?? 0,
      torquePeak: robotRB2.motors[i]?.peakTorque ?? 0,
      speed: robotRB2.motors[i]?.speed ?? 0,
    },
  }))

  // 表示順は根元(S)を下・先端(T)を上に反転する（ロボット模式図が床に立っている
  // 見た目と揃えるため。データそのもの（axisRows・warningAxesの並び）は
  // 軸番号(axis-1)基準のままで変更しない） → 描画するときだけこの並びを使う
  const displayRows: AxisRowData[] = AXIS_DISPLAY_ORDER.map(
    (name) => axisRows[AXIS_NAMES.indexOf(name)],
  )

  const [warningAxes, setWarningAxes] = useState<boolean[]>(() => Array(axisCount).fill(false))
  const releaseTimersRef = useRef<Array<number | undefined>>([])
  const latestRowsRef = useRef(axisRows)
  latestRowsRef.current = axisRows

  useEffect(() => {
    setWarningAxes((previous) => {
      const next = Array.from({ length: axisCount }, (_, i) => previous[i] ?? false)
      let changed = false

      next.forEach((isWarning, index) => {
        const row = axisRows[index]
        if (!row) return
        const values = [
          row.rb1.torqueValue,
          row.rb2.torqueValue,
        ]
        const reachedWarning = values.some((value) => value >= THRESHOLD)
        const belowReleaseThreshold = values.every((value) => value <= WARNING_RELEASE_THRESHOLD)

        if (reachedWarning) {
          if (releaseTimersRef.current[index] !== undefined) {
            window.clearTimeout(releaseTimersRef.current[index])
            releaseTimersRef.current[index] = undefined
          }
          if (!isWarning) {
            next[index] = true
            changed = true
          }
        } else if (isWarning && belowReleaseThreshold && releaseTimersRef.current[index] === undefined) {
          releaseTimersRef.current[index] = window.setTimeout(() => {
            const latest = latestRowsRef.current[index]
            if (!latest) return
            const latestValues = [
              latest.rb1.torqueValue,
              latest.rb2.torqueValue,
            ]
            if (latestValues.every((value) => value <= WARNING_RELEASE_THRESHOLD)) {
              setWarningAxes((current) => {
                const released = [...current]
                released[index] = false
                return released
              })
            }
            releaseTimersRef.current[index] = undefined
          }, WARNING_RELEASE_DELAY_MS)
        }
      })

      return changed ? next : previous
    })
  }, [axisCount, axisRows])

  useEffect(() => () => {
    releaseTimersRef.current.forEach((timer) => {
      if (timer !== undefined) window.clearTimeout(timer)
    })
  }, [])

  // 6軸平均トルク（トルク%のみの平均）。履歴は持たず現在値のみを
  // ガラス調ゲージで表示する（各トルクグラフ群の直上・モニタ版のみ）
  const rb1AvgTorque = axisRows.reduce((sum, r) => sum + r.rb1.torqueValue, 0) / axisRows.length
  const rb2AvgTorque = axisRows.reduce((sum, r) => sum + r.rb2.torqueValue, 0) / axisRows.length

  // モバイルRB切替：選択中の側を強調し、同じ側を再タップすると両方を通常表示に戻す
  const [selectedMobileRB, setSelectedMobileRB] = useState<RobotKey | null>(null)
  const handleMobileRBToggle = (rb: RobotKey) => {
    setSelectedMobileRB((prev) => (prev === rb ? null : rb))
  }

  const toSideData = (row: AxisRowData, side: 'rb1' | 'rb2'): AxisSideData => ({
    axis: row.axis,
    torqueValue: row[side].torqueValue,
    torquePeak: row[side].torquePeak,
    speed: row[side].speed,
  })

  const gridRef = useRef<HTMLDivElement>(null)
  const [connectorLines, setConnectorLines] = useState<ConnectorLine[]>([])
  // SVGのviewBoxはgridRef.current経由でレンダー中に直接読むと、初回描画時点では
  // まだrefがセットされておらず"0 0 0 0"になってしまい、線が一切描画されない
  // 不具合があったため、実測後にstateへ保存してからviewBoxに使う。
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const image = grid.querySelector<HTMLImageElement>('.robot-diagram__img')
    if (!image) return

    const updateConnectorLines = () => {
      const rb1Rows = grid.querySelector<HTMLElement>('.axis-monitor__rows--rb1')
      const rb2Rows = grid.querySelector<HTMLElement>('.axis-monitor__rows--rb2')
      if (!image || !rb1Rows || !rb2Rows || !image.complete) return

      const gridRect = grid.getBoundingClientRect()
      // 接続線の左右端は「画像の実際の表示範囲」（object-fit: containで生じる
      // 余白を除いた範囲。RobotAxisDiagram.tsxのcomputeContainRectと同じ計算を
      // 共有し、警告マーカーの位置と必ず一致するようにしている）に揃える。
      // 以前は模式図の列全体(diagramRect)や画像の箱全体を使っていたため、
      // 余白がある場合に画像の実際の関節位置とズレていた。
      const imageRect = computeContainRect(image)
      const rb1Cards = rb1Rows.querySelectorAll<HTMLElement>('.axis-metric-card')
      const rb2Cards = rb2Rows.querySelectorAll<HTMLElement>('.axis-metric-card')

      const lines = AXIS_DISPLAY_ORDER.flatMap((name, index) => {
        const rb1Card = rb1Cards[index]
        const rb2Card = rb2Cards[index]
        if (!rb1Card || !rb2Card) return []

        // 接続線の終点は、画像の左右端ではなく「画像内の実際の関節位置」
        // （IMAGE_JOINT_X・IMAGE_JOINT_Y）に合わせる。以前はX座標を持たず画像の
        // 左右端に固定していたため、腕が左右に曲がっている新しいロボット画像では
        // 実際の関節（S/L/U/R/B/T）の位置と接続線の着地点がズレていた。
        const jointX = imageRect.left - gridRect.left + imageRect.width * IMAGE_JOINT_X[name]
        const jointY = imageRect.top - gridRect.top + imageRect.height * IMAGE_JOINT_Y[name]
        const rb1Rect = rb1Card.getBoundingClientRect()
        const rb2Rect = rb2Card.getBoundingClientRect()

        // RB1側の起点＝カード右端の縦方向中央。RB2側の起点＝カード左端の縦方向中央。
        const rb1X = rb1Rect.right - gridRect.left
        const rb1Y = rb1Rect.top - gridRect.top + rb1Rect.height / 2
        const rb2X = rb2Rect.left - gridRect.left
        const rb2Y = rb2Rect.top - gridRect.top + rb2Rect.height / 2

        return [{
          axis: name,
          // 起点からまずSTUB分だけ水平に伸ばし（＝カード端の中央から水平に出ている
          // ことが見た目にもはっきり分かるようにする）、その後関節位置まで直線で結ぶ。
          leftPath: `M ${rb1X} ${rb1Y} H ${rb1X + CONNECTOR_STUB} L ${jointX} ${jointY}`,
          rightPath: `M ${rb2X} ${rb2Y} H ${rb2X - CONNECTOR_STUB} L ${jointX} ${jointY}`,
        }]
      })
      setConnectorLines(lines)
      setGridSize({ width: gridRect.width, height: gridRect.height })
    }

    updateConnectorLines()
    const observer = new ResizeObserver(updateConnectorLines)
    observer.observe(grid)
    image.addEventListener('load', updateConnectorLines)
    return () => {
      observer.disconnect()
      image.removeEventListener('load', updateConnectorLines)
    }
  }, [])

  return (
    <PanelFrame className={`op-status op-status--${theme}`}>
      <div className="axis-monitor">
        <div className="axis-monitor__body">
          <div className="axis-monitor__main-col">
            {/* RB1/RB2ラベルは枠付きの箱(boxed)に変更し、縦に間延びさせず
               同じ行の隣に平均速度ゲージを並べる。
               このヘッダー行・軸データ行（＋接続線オーバーレイ）はすべて
               axis-monitor__grid（RB1列／模式図列／RB2列の3列グリッド）の
               直接の子要素として並べており、模式図と各データ行の高さが
               常に揃うようにしている。 */}
            <div className="axis-monitor__grid" ref={gridRef}>
              {/* --- 1行目：RB1バッジ・RB2バッジ ---
                 中央の「トルク」見出しバッジ（大きな文字＋箱）は、各軸カード
                 （AxisMetricCard）側にTORQUE/SPEEDのアイコン＋英語名称を
                 個別表示する仕様に変更したのに伴い廃止した。
                 header-rb1/header-rb2はCSS側でそれぞれgrid-column: 1 / 3を明示
                 指定しているため、中央列用の空divを挟まなくても正しい列に
                 配置される。 */}
              <div className="axis-monitor__header-rb1">
                <RobotHeaderBadge
                  label="RB1"
                  colorKey="RB1"
                  color={rb1Color}
                  utilizationRate={robotRB1.utilizationRate}
                  align="left"
                  layout="boxed"
                  textColor={rb1Color}
                  captionColor={theme.subtext}
                  onClick={() => handleMobileRBToggle('RB1')}
                  dimmed={selectedMobileRB === 'RB2'}
                />
                <AverageSpeedGauge
                  value={rb1AvgTorque}
                  maxValue={80}
                  color={rb1Color}
                  label="平均トルク"
                  reverse
                  iconOnRight
                />
              </div>

              <div className="axis-monitor__header-rb2">
                <AverageSpeedGauge value={rb2AvgTorque} maxValue={80} color={rb2Color} label="平均トルク" />
                <RobotHeaderBadge
                  label="RB2"
                  colorKey="RB2"
                  color={rb2Color}
                  utilizationRate={robotRB2.utilizationRate}
                  align="right"
                  layout="boxed"
                  textColor={rb2Color}
                  captionColor={theme.subtext}
                  onClick={() => handleMobileRBToggle('RB2')}
                  dimmed={selectedMobileRB === 'RB1'}
                />
              </div>

              {/* --- 2行目：RB1軸データ行 / ロボット模式図 / RB2軸データ行 ---
                 表示順は先端(T)が上・根元(S)が下（模式図が床に立っている見た目と揃える）。
                 各カードの高さは均等(flexGrow=1)にし、どの行がどの関節に対応するかは
                 下の接続線（実画像の関節位置IMAGE_JOINT_Y⇄各カードの実際の中心座標）で
                 示す（以前は行の高さ比率(AXIS_ROW_FLEX)で対応させていたが、画像側の
                 実際の関節間隔と一致せずズレていたため、この方式に変更した）。 */}
              <div className="axis-monitor__rows axis-monitor__rows--rb1">
                {displayRows.map((row) => (
                  <AxisRow
                    key={row.axis}
                    side="rb1"
                    data={toSideData(row, 'rb1')}
                    threshold={THRESHOLD}
                    isWarning={warningAxes[row.axis - 1] ?? false}
                    color={rb1Color}
                    flexGrow={1}
                  />
                ))}
              </div>

              <RobotAxisDiagram mode={robotImageMode} warningAxes={warningAxes} />

              <div className="axis-monitor__rows axis-monitor__rows--rb2">
                {displayRows.map((row) => (
                  <AxisRow
                    key={row.axis}
                    side="rb2"
                    data={toSideData(row, 'rb2')}
                    threshold={THRESHOLD}
                    isWarning={warningAxes[row.axis - 1] ?? false}
                    color={rb2Color}
                    flexGrow={1}
                  />
                ))}
              </div>

              {/* 画像内の実際の関節位置から、左右の対応カード中心へ接続する。 */}
              <svg
                className="axis-monitor__connectors"
                viewBox={`0 0 ${gridSize.width} ${gridSize.height}`}
                aria-hidden="true"
              >
                {connectorLines.map(({ axis, leftPath, rightPath }) => {
                  const name = axis
                  const axisIndex = AXIS_NAMES.indexOf(name)
                  const isWarning = warningAxes[axisIndex] ?? false
                  return (
                    <g key={name}>
                    <path
                      d={leftPath}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className={`axis-monitor__connector-line${isWarning ? ' axis-monitor__connector-line--warning' : ''}`}
                      style={isWarning ? undefined : { stroke: rb1Color }}
                    />
                    <path
                      d={rightPath}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className={`axis-monitor__connector-line${isWarning ? ' axis-monitor__connector-line--warning' : ''}`}
                      style={isWarning ? undefined : { stroke: rb2Color }}
                    />
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* モバイル表示：平均トルクカード、RB切替、軸別データ表 */}
            <div className="axis-monitor__mobile-average-torque-label" style={{ color: theme.text }}>
              平均トルク
            </div>
            <div className="axis-monitor__mobile-average-torque">
              <div
                className={`axis-monitor__mobile-torque-card${selectedMobileRB === 'RB2' ? ' is-dimmed' : ''}`}
                style={{ borderColor: rb1Color, color: rb1Color }}
              >
                <strong>{Math.round(rb1AvgTorque)}%</strong>
              </div>
              <div
                className={`axis-monitor__mobile-torque-card${selectedMobileRB === 'RB1' ? ' is-dimmed' : ''}`}
                style={{ borderColor: rb2Color, color: rb2Color }}
              >
                <strong>{Math.round(rb2AvgTorque)}%</strong>
              </div>
            </div>

            <AxisTable
              rows={displayRows}
              threshold={THRESHOLD}
              rb1Color={rb1Color}
              rb2Color={rb2Color}
              theme={theme}
              warningAxes={warningAxes}
              selectedRB={selectedMobileRB}
            />

          </div>

          {/* 編集パネル：RB1/RB2カラーのみ変更可能（軸名称はS/L/U/R/B/T固定のため編集項目を廃止） */}
          {isEditing && (
            <div
              className="axis-monitor__edit-panel"
              style={{ background: theme.headerBg, borderColor: theme.border }}
            >
              <div className="axis-monitor__edit-panel-scroll">
                {/* 編集モードのON/OFFはこのパネル先頭のトグルで切り替える（他ページと統一） */}
                <label className="axis-monitor__panel-toggle-row" style={{ color: theme.text }}>
                  <span>編集モード</span>
                  <span className={`toggle-switch${isEditing ? ' toggle-switch--on' : ''}`}>
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      checked={isEditing}
                      onChange={(e) => onEditingChange(e.target.checked)}
                      aria-label="編集モードの切替"
                    />
                    <span
                      className="toggle-switch__track"
                      style={{ background: isEditing ? theme.accent : theme.border }}
                    >
                      <span className="toggle-switch__thumb" />
                    </span>
                  </span>
                  <span className="axis-monitor__panel-toggle-state" style={{ color: theme.subtext }}>
                    {isEditing ? 'ON' : 'OFF'}
                  </span>
                </label>

                <section className="axis-monitor__panel-section">
                  <h3 style={{ color: theme.text }}>ロボットカラー</h3>
                  <div className="axis-monitor__edit-group">
                    <label className="axis-monitor__color-row">
                      <span style={{ color: theme.subtext }}>RB1</span>
                      <input
                        type="color"
                        value={rb1Color}
                        onChange={(e) => setCustomColors((prev) => ({ ...prev, rb1: e.target.value }))}
                      />
                    </label>
                    <label className="axis-monitor__color-row">
                      <span style={{ color: theme.subtext }}>RB2</span>
                      <input
                        type="color"
                        value={rb2Color}
                        onChange={(e) => setCustomColors((prev) => ({ ...prev, rb2: e.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      className="axis-monitor__panel-reset"
                      style={{ borderColor: theme.border, color: theme.subtext }}
                      onClick={handleResetColors}
                    >
                      色をリセット
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
