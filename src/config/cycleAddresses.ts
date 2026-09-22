// config/cycleAddresses.ts
//
// 稼働時間KPI・サイクルタイムKPI（取付／取出）・サイクル履歴（直近5件）のPLCアドレス定義。
// 「D15000〜D15098／D15200〜D15296 アドレス一覧」に基づく確定済みアドレス。
//
// 注意：サイクルタイムそのものもPLC側で計算・保持してくれるようになったため、
// usePlcOperationMetricsSignals.ts / useCycleHistory.ts 側にある旧方式
// （CYCLE_START_TIME_ADDRESS / CYCLE_END_TIME_ADDRESS / CYCLE_CHANGE_BIT_ADDRESS
//  など、operationMetricsAddresses.ts 内の仮アドレス＋コード側で立上りエッジを
//  検知してサイクルタイムを算出するロジック）は、この新しい直近5件の履歴データと
//  役割が重複しています。両方を残すか、こちらへ置き換えるかは要判断（別途相談）。

/** 稼働時間（時）（D15002） */
export const UPTIME_HOUR_ADDRESS = 15002
/** 稼働時間（分）（D15004） */
export const UPTIME_MINUTE_ADDRESS = 15004

/** 取付 1サイクル稼働時間積算値（分）（D15032） */
export const TIGHTEN_CYCLE_MIN_ADDRESS = 15032
/** 取付 1サイクル稼働時間積算値（秒）（D15034） */
export const TIGHTEN_CYCLE_SEC_ADDRESS = 15034
/** 取出 1サイクル稼働時間積算値（分）（D15036） */
export const LOOSEN_CYCLE_MIN_ADDRESS = 15036
/** 取出 1サイクル稼働時間積算値（秒）（D15038） */
export const LOOSEN_CYCLE_SEC_ADDRESS = 15038

/** 取付 ベスト1サイクル稼働時間積算値（分）（D15052） */
export const TIGHTEN_BEST_CYCLE_MIN_ADDRESS = 15052
/** 取付 ベスト1サイクル稼働時間積算値（秒）（D15054） */
export const TIGHTEN_BEST_CYCLE_SEC_ADDRESS = 15054
/** 取出 ベスト1サイクル稼働時間積算値（分）（D15056） */
export const LOOSEN_BEST_CYCLE_MIN_ADDRESS = 15056
/** 取出 ベスト1サイクル稼働時間積算値（秒）（D15058） */
export const LOOSEN_BEST_CYCLE_SEC_ADDRESS = 15058

/**
 * サイクル履歴（直近5件、記憶1＝1件目）の1件分のアドレス構成。
 * 開始時間記憶n：年・月・日・時・分の5項目、D15200を基準に(n-1)*10ずつオフセット。
 * 終了時間記憶n：同じ構成で、D15250を基準に(n-1)*10ずつオフセット。
 */
export interface CycleHistorySlotAddresses {
  slot: 1 | 2 | 3 | 4 | 5
  startYear: number
  startMonth: number
  startDay: number
  startHour: number
  startMinute: number
  endYear: number
  endMonth: number
  endDay: number
  endHour: number
  /**
   * 終了時間記憶5の「分」は資料に明記がなく、他の記憶1〜4と同じ+8オフセットの
   * 規則から推定した値（D15298）。PLC側で実測確認してから使用してください。
   */
  endMinute: number
  /** サイクルタイム（分） */
  cycleTimeMin: number
  /** サイクルタイム（秒） */
  cycleTimeSec: number
}

function startBase(slot: 1 | 2 | 3 | 4 | 5) {
  return 15200 + (slot - 1) * 10
}
function endBase(slot: 1 | 2 | 3 | 4 | 5) {
  return 15250 + (slot - 1) * 10
}

// サイクルタイム記憶n（分・秒）は、他の項目のように等間隔ではなく資料に
// 個別に記載された番地のため、規則計算せずそのまま定義する。
const CYCLE_TIME_MIN_ADDRESS_BY_SLOT: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 15014,
  2: 15072,
  3: 15076,
  4: 15092,
  5: 15096,
}
const CYCLE_TIME_SEC_ADDRESS_BY_SLOT: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 15016,
  2: 15074,
  3: 15078,
  4: 15094,
  5: 15098,
}

export const CYCLE_HISTORY_SLOTS: CycleHistorySlotAddresses[] = ([1, 2, 3, 4, 5] as const).map((slot) => {
  const sBase = startBase(slot)
  const eBase = endBase(slot)
  return {
    slot,
    startYear: sBase,
    startMonth: sBase + 2,
    startDay: sBase + 4,
    startHour: sBase + 6,
    startMinute: sBase + 8,
    endYear: eBase,
    endMonth: eBase + 2,
    endDay: eBase + 4,
    endHour: eBase + 6,
    endMinute: eBase + 8, // ← 推定値（上記コメント参照）
    cycleTimeMin: CYCLE_TIME_MIN_ADDRESS_BY_SLOT[slot],
    cycleTimeSec: CYCLE_TIME_SEC_ADDRESS_BY_SLOT[slot],
  }
})

/** usePlcWebSocket の selectedAddresses にまとめて渡すための一覧 */
export const CYCLE_ADDRESSES = [
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
  ...CYCLE_HISTORY_SLOTS.flatMap(({ slot: _slot, ...addrs }) => Object.values(addrs)),
]