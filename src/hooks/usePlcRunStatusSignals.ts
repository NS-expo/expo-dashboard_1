// hooks/usePlcRunStatusSignals.ts
//
// 全体の稼働状況をPLC(Dレジスタ)から取得するためのフック。
// アドレス定義は config/runStatusAddress.ts 側に一本化し、ここではそれを使うだけにする。

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import { RUN_STATUS_ADDRESS, RUN_STATUS_ADDRESSES, RUN_STATUS_VALUE_MAP } from '../config/runStatusAddress'
import type { CameraStatus } from '../components/RobotArmDashboard/RobotArmDashboard' // ← 実際のパスに合わせて調整してください

export { RUN_STATUS_ADDRESS, RUN_STATUS_ADDRESSES }

export interface PlcRunStatus {
  /** 全体の稼働状況。PLC値がマップに無い（未取得時の0など）場合はundefined */
  status: CameraStatus | undefined
}

export function usePlcRunStatusSignals(data: DataPoint[]): PlcRunStatus {
  const latest = getLatestDataPoint(data)
  const rawValue = readAddress(latest, RUN_STATUS_ADDRESS)

  // RUN_STATUS_VALUE_MAPに無い値（未取得時の0など）はundefinedとして扱う
  const status = RUN_STATUS_VALUE_MAP[rawValue]

  return { status }
}