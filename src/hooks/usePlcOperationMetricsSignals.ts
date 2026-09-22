// hooks/usePlcOperationMetricsSignals.ts
//
// usePlcJobFlowSignals / usePlcRobotStatusSignals と同じ構成に統一しています。
// usePlcWebSocket が返す data（DataPoint[]、1時刻分ずつ蓄積された配列）を受け取り、
// 最新の1点から readAddress（usePlcSignalUtils）経由で値を取り出します。
//
// OK/NGはPLCからは「割合（%）」でしか来ないため、検査回数（OK回数＋NG回数）との整合を
// 取るためにここで回数へ変換します。OK割合・NG割合をそれぞれ四捨五入すると
// 合計が検査回数と一致しないことがあるため、OK回数のみ四捨五入で算出し、
// NG回数は「検査回数－OK回数」で求めることで必ず内訳の合計が検査回数と一致するようにしています。
//
// ※ サイクルタイム関連（cycleTimeSec・cycleStartTimeRaw・cycleEndTimeRaw、および
//   立上りエッジ検知によるコード側フォールバック計算）はここから撤去しました。
//   PLC側が直近5件のサイクル履歴・稼働時間・ベストサイクルタイムを直接保持するようになった
//   ため、hooks/usePlcCycleSignals.ts（config/cycleAddresses.ts）に置き換えています。
//   接続監視（usePlcConnectionStatus）に渡す「変化を監視する値」も、旧cycleStartTimeRawの
//   代わりにusePlcJobFlowSignalsのactiveStep、またはusePlcCycleSignalsの履歴の最新終了時刻を
//   使うよう呼び出し側を更新してください。

import type { DataPoint } from '../types'
import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import {
  INSPECT_COUNT_ADDRESS,
  ANOMALY_COUNT_ADDRESS,
  INSERT_COUNT_ADDRESS,
  TIGHTEN_COUNT_ADDRESS,
  LOOSEN_COUNT_ADDRESS,
  OK_RATIO_ADDRESS,
  NG_SIGNAL_ADDRESS,
} from '../config/operationMetricsAddresses'

export interface PlcOperationMetrics {
  /** 検査回数 */
  inspectCount: number
  /** 異常回数 */
  anomalyCount: number
  /** 上刃挿入回数 */
  insertCount: number
  /** 取付実行回数 */
  tightenCount: number
  /** 取出実行回数 */
  loosenCount: number
  /** 検査OK回数（検査回数×OK割合から算出） */
  okCount: number
  /** 検査NG回数（検査回数－OK回数から算出。OK割合の丸め誤差の影響を受けない） */
  ngCount: number
  /** NG判定信号（true = NG） */
  ngSignal: boolean
}

export function usePlcOperationMetricsSignals(data: DataPoint[]): PlcOperationMetrics {
  const latest = getLatestDataPoint(data)

  const inspectCount = readAddress(latest, INSPECT_COUNT_ADDRESS)
  const anomalyCount = readAddress(latest, ANOMALY_COUNT_ADDRESS)
  const insertCount = readAddress(latest, INSERT_COUNT_ADDRESS)
  const tightenCount = readAddress(latest, TIGHTEN_COUNT_ADDRESS)
  const loosenCount = readAddress(latest, LOOSEN_COUNT_ADDRESS)
  const okRatio = readAddress(latest, OK_RATIO_ADDRESS)
  const ngSignal = readAddress(latest, NG_SIGNAL_ADDRESS) === 1

  // OK割合（%）×検査回数からOK回数を算出。NG回数は「検査回数－OK回数」で求める
  // （OK割合・NG割合を個別に四捨五入すると合計が検査回数からズレることがあるため）。
  const okCount = Math.round(inspectCount * (okRatio / 100))
  const ngCount = Math.max(inspectCount - okCount, 0)

  return {
    inspectCount,
    anomalyCount,
    insertCount,
    tightenCount,
    loosenCount,
    okCount,
    ngCount,
    ngSignal,
  }
}
