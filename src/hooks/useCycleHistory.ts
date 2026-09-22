// useCycleHistory.ts
//
// 「ダッシュボード改修仕様書」の下記2項目に対応する純粋関数：
//   ・⑤サイクルタイムを最下部ティッカー表示 → サイクルタイム機能追加（ベストサイクルタイム）
//   ・サイクル履歴追加（新規パネル）＋ステータス判定ロジック
//
// 【旧方式との違い】
// 以前はPLCから来る「サイクル終了時刻（cycleEndTimeRaw）」の変化をuseEffectで監視し、
// コード側でReactの状態として無制限に履歴を蓄積していました。
// 現在はPLC自身が直近5件（記憶1〜5）の開始/終了時刻・サイクルタイムを保持して送ってくる
// ようになったため、コード側での蓄積・エッジ検知は不要になりました。
// 5件のスナップショットを毎回まるごと受け取り、その場でステータス判定して整形するだけの
// 純粋関数（buildCycleHistory）に置き換えています。呼び出し側は
// hooks/usePlcCycleSignals.ts を参照してください。
//
// ステータス判定ロジック（仕様書どおり。時系列（発生順）に並べ替えてから判定する）:
//   1件目            … 判定なし（pending）
//   2件目            … 判定なし（pending）
//   3件目            … 3件揃った時点で相互比較。他2件との差がいずれも10秒以内なら「正常」
//                        正常判定されたデータを基準値プールに登録
//   4件目以降        … 基準値＝正常履歴の平均値。|現在値−基準値|≦10秒なら「正常」、
//                        10秒超なら「異常」。正常と判定されたものは基準値プールに追加

export type CycleStatus = 'normal' | 'abnormal' | 'pending'

export interface CycleRecord {
  no: number
  startTime: string
  endTime: string
  cycleTimeSec: number
  status: CycleStatus
}

/** PLCから読み取った1記憶分の生値（config/cycleAddresses.ts の CycleHistorySlotAddresses に対応） */
export interface CycleHistorySlotValues {
  slot: number
  startYear: number
  startMonth: number
  startDay: number
  startHour: number
  startMinute: number
  endYear: number
  endMonth: number
  endDay: number
  endHour: number
  endMinute: number
  /** サイクルタイム（分） */
  cycleTimeMin: number
  /** サイクルタイム（秒の端数） */
  cycleTimeSec: number
}

/** 正常/異常判定のしきい値（秒）。仕様書に基づく固定値。 */
const STATUS_THRESHOLD_SEC = 10

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDate(y: number, mo: number, d: number, h: number, mi: number): Date | undefined {
  // 年が0＝そのスロットはまだ記録が無い（起動直後などでサイクル数が5件未満）
  if (!y) return undefined
  return new Date(y, mo - 1, d, h, mi)
}

function formatClock(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * PLCから受け取った直近5件（記憶1〜5）のスナップショットを、発生順（古い→新しい）に
 * 並べ替えてステータス判定した履歴配列に変換する。
 * ※ 記憶1〜5のうちどれが最新かはPLC側の格納順に依存しうるため、番号ではなく
 *   実際の開始時刻（年月日時分から復元したDate）でソートすることで順序に依存しないようにしている。
 */
export function buildCycleHistory(slots: CycleHistorySlotValues[]): CycleRecord[] {
  const withDates = slots
    .map((s) => ({
      slot: s,
      startDate: toDate(s.startYear, s.startMonth, s.startDay, s.startHour, s.startMinute),
      endDate: toDate(s.endYear, s.endMonth, s.endDay, s.endHour, s.endMinute),
    }))
    .filter((x): x is { slot: CycleHistorySlotValues; startDate: Date; endDate: Date } => !!x.startDate && !!x.endDate)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  const normalPool: number[] = []
  const records: CycleRecord[] = []

  withDates.forEach(({ slot, startDate, endDate }, i) => {
    const cycleTimeSec = slot.cycleTimeMin * 60 + slot.cycleTimeSec
    let status: CycleStatus

    if (i < 2) {
      status = 'pending'
    } else if (i === 2) {
      const others = [records[0].cycleTimeSec, records[1].cycleTimeSec]
      status = others.every((v) => Math.abs(cycleTimeSec - v) <= STATUS_THRESHOLD_SEC) ? 'normal' : 'abnormal'
    } else {
      const baseline = normalPool.length > 0 ? normalPool.reduce((sum, v) => sum + v, 0) / normalPool.length : undefined
      status = baseline !== undefined && Math.abs(cycleTimeSec - baseline) <= STATUS_THRESHOLD_SEC ? 'normal' : 'abnormal'
    }

    if (status === 'normal') normalPool.push(cycleTimeSec)

    records.push({
      no: i + 1,
      startTime: formatClock(startDate),
      endTime: formatClock(endDate),
      cycleTimeSec,
      status,
    })
  })

  return records
}
