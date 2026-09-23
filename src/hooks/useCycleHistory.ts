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
  /** 前回サイクルとのサイクルタイム差（秒）。直前の記録が無い場合はnull */
  diffFromPrevSec: number | null
}

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
  cycleTimeMin: number
  cycleTimeSec: number
}

/** No.・前回差分の計算に使う永続状態。呼び出し元（usePlcCycleSignals）で
 *  useRef(createCycleHistoryState())として保持し、buildCycleHistoryへ毎回渡す。
 *  これにより、PLCが送ってくる「直近5件」の窓がスライドしても、
 *  一度割り振ったNo.や前回タイムとの比較基準が失われない。 */
export interface CycleHistoryState {
  /** 開始時刻(ms) → 割り当て済みのNo. */
  noByStartTime: Map<number, number>
  /** No. → そのサイクルタイム（秒）。前回差分の算出に使う */
  cycleTimeByNo: Map<number, number>
  /** 次に新規レコードへ割り振るNo. */
  nextNo: number
}

export function createCycleHistoryState(): CycleHistoryState {
  return { noByStartTime: new Map(), cycleTimeByNo: new Map(), nextNo: 1 }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDate(y: number, mo: number, d: number, h: number, mi: number): Date | undefined {
  if (!y) return undefined
  return new Date(y, mo - 1, d, h, mi)
}

function formatClock(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** PLCから受け取った直近5件を、発生順（古い→新しい）で整形する。
 *  No.は一度割り振ったら固定、前回差分は「No.-1」のサイクルタイムとの差。 */
export function buildCycleHistory(
  slots: CycleHistorySlotValues[],
  state: CycleHistoryState
): CycleRecord[] {
  const withDates = slots
    .map((s) => ({
      slot: s,
      startDate: toDate(s.startYear, s.startMonth, s.startDay, s.startHour, s.startMinute),
      endDate: toDate(s.endYear, s.endMonth, s.endDay, s.endHour, s.endMinute),
    }))
    .filter((x): x is { slot: CycleHistorySlotValues; startDate: Date; endDate: Date } => !!x.startDate && !!x.endDate)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  const records: CycleRecord[] = []

  withDates.forEach(({ slot, startDate, endDate }) => {
    const cycleTimeSec = slot.cycleTimeMin * 60 + slot.cycleTimeSec
    const key = startDate.getTime()

    let no = state.noByStartTime.get(key)
    if (no === undefined) {
      no = state.nextNo
      state.noByStartTime.set(key, no)
      state.nextNo += 1
    }
    state.cycleTimeByNo.set(no, cycleTimeSec)

    const prevCycleTimeSec = state.cycleTimeByNo.get(no - 1)
    const diffFromPrevSec = prevCycleTimeSec !== undefined ? cycleTimeSec - prevCycleTimeSec : null

    records.push({
      no,
      startTime: formatClock(startDate),
      endTime: formatClock(endDate),
      cycleTimeSec,
      diffFromPrevSec,
    })
  })

  // 古いNo.のエントリはもう参照されないので、メモリが無限に増えないよう間引く
  const cutoff = state.nextNo - 20
  if (cutoff > 0) {
    for (const no of state.cycleTimeByNo.keys()) {
      if (no < cutoff) state.cycleTimeByNo.delete(no)
    }
    for (const [key, no] of state.noByStartTime) {
      if (no < cutoff) state.noByStartTime.delete(key)
    }
  }

  return records
}