// hooks/usePlcCycleSignals.ts
//
// 稼働時間KPI・サイクルタイムKPI（取付／取出、現在値・ベスト値）・サイクル履歴（直近5件）を
// PLC(Dレジスタ)からまとめて取得するフック。usePlcJobFlowSignals / usePlcOperationMetricsSignals
// と同じ構成に統一しています。アドレス定義は config/cycleAddresses.ts を参照。
//
// 旧方式（usePlcOperationMetricsSignals内でCYCLE_CHANGE_BIT_ADDRESSの立上りエッジを検知して
// コード側でサイクルタイム・履歴を蓄積する方式）はここで完全に置き換えられました。
// PLC自身が稼働時間・ベストサイクルタイム・直近5件の履歴を保持して送ってくるため、
// コード側は値を読んで整形するだけで済みます。

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import {
  UPTIME_HOUR_ADDRESS,
  UPTIME_MINUTE_ADDRESS,
  TIGHTEN_CYCLE_MIN_ADDRESS,
  TIGHTEN_CYCLE_SEC_ADDRESS,
  LOOSEN_CYCLE_MIN_ADDRESS,
  LOOSEN_CYCLE_SEC_ADDRESS,
  TIGHTEN_BEST_CYCLE_MIN_ADDRESS,
  TIGHTEN_BEST_CYCLE_SEC_ADDRESS,
  LOOSEN_BEST_CYCLE_MIN_ADDRESS,
  LOOSEN_BEST_CYCLE_SEC_ADDRESS,
  CYCLE_HISTORY_SLOTS,
} from '../config/cycleAddresses'
import { buildCycleHistory, type CycleRecord } from './useCycleHistory'

export interface PlcCycleMetrics {
  /** 稼働時間（時） */
  uptimeHour: number
  /** 稼働時間（分） */
  uptimeMinute: number
  /** 稼働時間（秒に換算した合計値。既存のformatOperatingHours(operatingTimeSec)にそのまま渡せる） */
  uptimeTotalSec: number
  /** 取付 現在の1サイクル稼働時間（秒） */
  tightenCycleTimeSec: number
  /** 取付 ベスト1サイクル稼働時間（秒） */
  tightenBestCycleTimeSec: number
  /** 取出 現在の1サイクル稼働時間（秒） */
  loosenCycleTimeSec: number
  /** 取出 ベスト1サイクル稼働時間（秒） */
  loosenBestCycleTimeSec: number
  /** サイクル履歴（発生順・古い→新しい、正常/異常判定つき） */
  cycleHistory: CycleRecord[]
}

function minSecToTotalSec(min: number, sec: number) {
  return min * 60 + sec
}

export function usePlcCycleSignals(data: DataPoint[]): PlcCycleMetrics {
  const latest = getLatestDataPoint(data)

  const uptimeHour = readAddress(latest, UPTIME_HOUR_ADDRESS)
  const uptimeMinute = readAddress(latest, UPTIME_MINUTE_ADDRESS)
  const uptimeTotalSec = uptimeHour * 3600 + uptimeMinute * 60

  const tightenCycleTimeSec = minSecToTotalSec(
    readAddress(latest, TIGHTEN_CYCLE_MIN_ADDRESS),
    readAddress(latest, TIGHTEN_CYCLE_SEC_ADDRESS)
  )
  const loosenCycleTimeSec = minSecToTotalSec(
    readAddress(latest, LOOSEN_CYCLE_MIN_ADDRESS),
    readAddress(latest, LOOSEN_CYCLE_SEC_ADDRESS)
  )
  const tightenBestCycleTimeSec = minSecToTotalSec(
    readAddress(latest, TIGHTEN_BEST_CYCLE_MIN_ADDRESS),
    readAddress(latest, TIGHTEN_BEST_CYCLE_SEC_ADDRESS)
  )
  const loosenBestCycleTimeSec = minSecToTotalSec(
    readAddress(latest, LOOSEN_BEST_CYCLE_MIN_ADDRESS),
    readAddress(latest, LOOSEN_BEST_CYCLE_SEC_ADDRESS)
  )

  const slotValues = CYCLE_HISTORY_SLOTS.map((slot) => ({
    slot: slot.slot,
    startYear: readAddress(latest, slot.startYear),
    startMonth: readAddress(latest, slot.startMonth),
    startDay: readAddress(latest, slot.startDay),
    startHour: readAddress(latest, slot.startHour),
    startMinute: readAddress(latest, slot.startMinute),
    endYear: readAddress(latest, slot.endYear),
    endMonth: readAddress(latest, slot.endMonth),
    endDay: readAddress(latest, slot.endDay),
    endHour: readAddress(latest, slot.endHour),
    endMinute: readAddress(latest, slot.endMinute),
    cycleTimeMin: readAddress(latest, slot.cycleTimeMin),
    cycleTimeSec: readAddress(latest, slot.cycleTimeSec),
  }))

  const cycleHistory = buildCycleHistory(slotValues)

  return {
    uptimeHour,
    uptimeMinute,
    uptimeTotalSec,
    tightenCycleTimeSec,
    tightenBestCycleTimeSec,
    loosenCycleTimeSec,
    loosenBestCycleTimeSec,
    cycleHistory,
  }
}
