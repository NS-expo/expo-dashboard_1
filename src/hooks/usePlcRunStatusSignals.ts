import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import {
  RUN_STATUS_RB1_ADDRESS,
  RUN_STATUS_RB2_ADDRESS,
  RUN_STATUS_ADDRESSES,
  RUN_STATUS_VALUE_MAP,
} from '../config/runStatusAddress'
import type { CameraStatus } from '../components/RobotArmDashboard/RobotArmDashboard' // ← 実際のパスに合わせて調整してください

export { RUN_STATUS_ADDRESSES }

export interface PlcRunStatus {
  /** RB1の稼働状況。アドレス未確定、またはPLC値がマップに無い（未取得時の0など）場合はundefined */
  rb1Status: CameraStatus | undefined
  /** RB2の稼働状況。PLC値がマップに無い（未取得時の0など）場合はundefined */
  rb2Status: CameraStatus | undefined
}

/**
 * RB1・RB2の状態を1つに集約する。
 * 優先度：異常 > 運転 > 待機 > 停止（両方停止のときだけ「停止」）。
 * 値が未取得（undefined）のロボットは「停止」として扱う。
 * ヘッダーの●表示など、RB1・RB2をまとめて1つの状態で見せたい箇所で使用する。
 */
export function combineRunStatus(
  rb1Status: CameraStatus | undefined,
  rb2Status: CameraStatus | undefined,
): CameraStatus {
  const a = rb1Status ?? '停止'
  const b = rb2Status ?? '停止'
  if (a === '異常' || b === '異常') return '異常'
  if (a === '運転' || b === '運転') return '運転'
  if (a === '待機' || b === '待機') return '待機'
  return '停止'
}

export function usePlcRunStatusSignals(data: DataPoint[]): PlcRunStatus {
  const latest = getLatestDataPoint(data)

  // RB1はアドレス未確定のため、確定するまでは常にundefinedを返す
  const rb1RawValue = RUN_STATUS_RB1_ADDRESS !== undefined ? readAddress(latest, RUN_STATUS_RB1_ADDRESS) : undefined
  const rb2RawValue = readAddress(latest, RUN_STATUS_RB2_ADDRESS)

  // RUN_STATUS_VALUE_MAPに無い値（未取得時の0など）はundefinedとして扱う
  const rb1Status = rb1RawValue !== undefined ? RUN_STATUS_VALUE_MAP[rb1RawValue] : undefined
  const rb2Status = RUN_STATUS_VALUE_MAP[rb2RawValue]

  return { rb1Status, rb2Status }
}
