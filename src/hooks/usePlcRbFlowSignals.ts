// hooks/usePlcRbFlowSignals.ts
//
// RB1・RB2それぞれの現在工程ステップをPLC(Dレジスタ)から取得するためのフック。
// アドレス定義は config/rbFlowAddresses.ts 側に一本化し、ここではそれを使うだけにする。
// フロー内容が未確定のため、現時点ではステップ番号を返すだけで工程名への変換は行わない。

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import { RB1_FLOW_STEP_ADDRESS, RB2_FLOW_STEP_ADDRESS, RB_FLOW_ADDRESSES } from '../config/rbFlowAddresses'

export { RB1_FLOW_STEP_ADDRESS, RB2_FLOW_STEP_ADDRESS, RB_FLOW_ADDRESSES }

export interface PlcRbFlow {
  /** RB1の現在工程ステップ。未割り当て（0）時はundefined */
  rb1Step: number | undefined
  /** RB2の現在工程ステップ。未割り当て（0）時はundefined */
  rb2Step: number | undefined
}

export function usePlcRbFlowSignals(data: DataPoint[]): PlcRbFlow {
  const latest = getLatestDataPoint(data)
  const rawRb1 = readAddress(latest, RB1_FLOW_STEP_ADDRESS)
  const rawRb2 = readAddress(latest, RB2_FLOW_STEP_ADDRESS)

  // readAddressは未取得時に0を返すため、0はステップ未割り当てとして扱いundefinedにする
  const rb1Step = rawRb1 > 0 ? rawRb1 : undefined
  const rb2Step = rawRb2 > 0 ? rawRb2 : undefined

  return { rb1Step, rb2Step }
}