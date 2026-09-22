// RobotAxisDiagram.tsx
//
// STATUS画面仕様変更（再修正）対応：
// ・これまで自作のSVGシルエットで描いていた模式図を、支給されたロボット外観の
//   イラスト画像（ROBOT_DARK.png・ROBOT_LIGHT.png）に差し替えた。S/L/U/R/B/T
//   の軸名称ラベルは画像内に焼き込み済みのため、模式図側での文字描画・関節の
//   丸チップ表示は不要になった（警告時の発光表示のみ残す）。
// ・画像は呼び出し側（OperationStatus.tsx）が配置するpublicフォルダ
//   （/ROBOT_DARK.png・/ROBOT_LIGHT.png）を参照する。背景（テーマ）に応じて
//   出し分ける想定で、どちらを使うかはmode props（'dark' | 'light'）で受け取る。
//   実際のテーマ判定ロジックとの結線はOperationStatus.tsx側で行うこと
//   （現状はmode省略時 'dark' 固定）。
// ・関節間隔（AXIS_ROW_FLEX）・関節中心のY座標（JOINT_Y）は、模式図の見た目
//   そのものには使わなくなったが、引き続き以下2箇所の「唯一の基準値」として
//   共有する：
//     1) 左右の軸データ行（AxisRow）のflexGrow（行の高さ配分）
//     2) OperationStatus.tsx側で描く接続線（S/L/U/R/B/T→RB1/RB2カード）のY座標
//   これにより「模式図のどの関節が、どのデータ行・どの接続線に対応するか」が
//   ズレなく一致する。

import { useLayoutEffect, useRef, useState } from 'react'

export const AXIS_NAMES = ['S', 'L', 'U', 'R', 'B', 'T'] as const
export type AxisName = (typeof AXIS_NAMES)[number]

/** 画面表示順（上→下）。根元(S)を一番下、先端(T)を一番上にする */
export const AXIS_DISPLAY_ORDER: AxisName[] = ['T', 'B', 'R', 'U', 'L', 'S']

/** 関節間の間隔イメージ（合計100）。軸データ行（AxisRow）のflexGrowと、
 * 接続線（OperationStatus.tsx）のY座標の両方でこの値を共有することで、
 * 「どの軸がどのデータ行・どの接続線に対応するか」を一致させている。 */
export const AXIS_ROW_FLEX: Record<AxisName, number> = {
  T: 14,
  B: 17,
  R: 20,
  U: 20,
  L: 13,
  S: 16,
}

/** ROBOT_*.png内の各軸ラベル（関節付近）のY位置。画像の縦方向に対する割合。 */
export const IMAGE_JOINT_Y: Record<AxisName, number> = {
  T: 0.06,
  B: 0.22,
  R: 0.31,
  U: 0.36,
  L: 0.76,
  S: 0.91,
}

// 関節中心のY座標（0〜100）。AXIS_ROW_FLEXの累積区間の中間点として算出する
// （境界＝flexGrowの累積和、中心＝隣り合う境界の中間）。
function computeJointCenters(): Record<AxisName, number> {
  const bounds: number[] = [0]
  let acc = 0
  for (const name of AXIS_DISPLAY_ORDER) {
    acc += AXIS_ROW_FLEX[name]
    bounds.push(acc)
  }
  const centers = {} as Record<AxisName, number>
  AXIS_DISPLAY_ORDER.forEach((name, i) => {
    centers[name] = (bounds[i] + bounds[i + 1]) / 2
  })
  return centers
}

/** 関節中心のY座標（0〜100）。AxisRowのflexGrow・接続線のY座標として共有する */
export const JOINT_Y = computeJointCenters()

/** object-fit: containで表示している<img>の「実際に絵が見えている範囲」を
 * ビューポート座標で返す。imgの要素自体のgetBoundingClientRect()は箱全体
 * （レターボックスの余白込み）を返してしまうため、これを使わずに
 * naturalWidth/naturalHeightと箱のアスペクト比から実際の絵の範囲を計算する。
 * OperationStatus.tsx側の接続線計算とこのコンポーネント内の警告マーカー配置の
 * 両方で共有することで、画像上の同じ関節位置を指すようにしている。 */
export function computeContainRect(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect()
  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight
  if (!naturalW || !naturalH) return rect

  const boxRatio = rect.width / rect.height
  const imgRatio = naturalW / naturalH

  if (imgRatio > boxRatio) {
    // 箱より横長の画像 → 上下にレターボックス
    const height = rect.width / imgRatio
    return { top: rect.top + (rect.height - height) / 2, left: rect.left, width: rect.width, height }
  }
  // 箱より縦長の画像 → 左右にレターボックス
  const width = rect.height * imgRatio
  return { top: rect.top, left: rect.left + (rect.width - width) / 2, width, height: rect.height }
}

interface Props {
  /** 表示する画像をdark/lightどちらにするか。省略時は'dark'固定。
   * テーマの明暗との結線はOperationStatus.tsx側で行う想定。 */
  mode?: 'dark' | 'light'
  /** 軸ごとの警告状態（配列の並びはS〜T＝AXIS_NAMESの順。OperationStatus.tsxの
   * warningAxesをそのまま渡す） */
  warningAxes?: boolean[]
}

export default function RobotAxisDiagram({ mode = 'dark', warningAxes = [] }: Props) {
  const imageSrc = mode === 'light' ? '/ROBOT_LIGHT.png' : '/ROBOT_DARK.png'
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  // 警告マーカーのtop位置は「絵の実際の範囲(computeContainRect)」基準のpx値で持つ
  // （%指定だと箱基準になり、レターボックスがある画像でズレるため）
  const [markerTops, setMarkerTops] = useState<Partial<Record<AxisName, number>>>({})

  useLayoutEffect(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img) return

    const update = () => {
      if (!img.complete || !img.naturalWidth) return
      const containerRect = container.getBoundingClientRect()
      const contentRect = computeContainRect(img)
      const tops: Partial<Record<AxisName, number>> = {}
      AXIS_DISPLAY_ORDER.forEach((name) => {
        tops[name] = contentRect.top - containerRect.top + contentRect.height * IMAGE_JOINT_Y[name]
      })
      setMarkerTops(tops)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    img.addEventListener('load', update)
    return () => {
      observer.disconnect()
      img.removeEventListener('load', update)
    }
  }, [])

  return (
    <div className="robot-diagram" ref={containerRef}>
      <img
        ref={imgRef}
        className="robot-diagram__img"
        src={imageSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {/* 警告時のみ、画像内の実際の関節位置（IMAGE_JOINT_Y＝絵の縦方向に対する割合）に
         発光マーカーを絶対配置で重ねる。以前はAXIS_ROW_FLEX比率のflexセルで
         位置決めしていたため、実画像の関節位置とズレる場合があった。 */}
      <div className="robot-diagram__cells">
        {AXIS_DISPLAY_ORDER.map((name) => {
          const axisIndex = AXIS_NAMES.indexOf(name)
          const isWarning = warningAxes[axisIndex] ?? false
          const top = markerTops[name]
          if (!isWarning || top === undefined) return null
          return (
            <span
              key={name}
              className="robot-diagram__joint-warning"
              style={{ top }}
              aria-hidden="true"
            />
          )
        })}
      </div>
    </div>
  )
}
