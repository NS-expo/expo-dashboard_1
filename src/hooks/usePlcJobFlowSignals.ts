// hooks/usePlcJobFlowSignals.ts
//
// 全体フロー（ROBOT PERFORMANCE）の現在工程ステップをPLC(Dレジスタ)から取得するための
// フック。アドレス定義自体は config/jobFlowAddresses.ts 側に一本化し、ここでは
// それを使うだけにする（以前はここに D15004 を直接ハードコードしていたが、
// 確定版アドレス（D15000）と食い違っていたため修正）。
//
// D15000の値と工程の対応（JobFlowDiagram.tsxのOVERALL_FLOWと対応させること）：
// 1：刃物取付 / 2：刃物取外 / 3：検査 / 4：検査結果OK？ / 5：OK / 6：NG /
// 7：刃物交換 / 8：刃物ストックへ返却 / 9：動作準備
// ※ JobFlowDiagram.tsx側のOVERALL_FLOWのplcStepは、この新しい5〜9の並びに
//   まだ合わせて更新できていないので別途修正が必要です。

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import { JOB_FLOW_STEP_ADDRESS, JOB_FLOW_ADDRESSES } from '../config/jobFlowAddresses'

export { JOB_FLOW_STEP_ADDRESS, JOB_FLOW_ADDRESSES }

export interface PlcJobFlow {
  /** 全体フローの現在工程ステップ（1〜7）。未割り当て（0）時は undefined */
  activeStep: number | undefined
}

export function usePlcJobFlowSignals(data: DataPoint[]): PlcJobFlow {
  const latest = getLatestDataPoint(data)
  const rawStep = readAddress(latest, JOB_FLOW_STEP_ADDRESS)

  // readAddressは未取得時に0を返すため、0はステップ未割り当てとして扱いundefinedにする
  // （JobFlowDiagram側のactiveStep?: numberは「どの工程も強調しない」状態として扱う）
  const activeStep = rawStep > 0 ? rawStep : undefined

  return { activeStep }
}