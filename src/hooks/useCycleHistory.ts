// useCycleHistory.ts
//
// 「ダッシュボード改修仕様書」の下記項目に対応する純粋関数：
//   ・⑤サイクルタイムを最下部ティッカー表示 → サイクルタイム機能追加（ベストサイクルタイム）
//   ・サイクル履歴追加（新規パネル）
//
// 【No.割り当てについて】
// 開始・終了時刻は分単位までしか取得できない仕様のため、時刻の大小をソート・同一サイクル
// 判定のキーに使うと、同じ分に複数サイクルが発生した場合に順序を誤る（cycleAddresses.ts
// 側の説明の通り、記憶1〜5は物理的に固定されたスロットへ 1→2→3→4→5→1… の順で巡回書き込み
// される）。そのため、時刻の大小比較ではなく「どのスロットの内容が前回から変化したか」を
// 検知し、直前に書き込まれたスロットからの巡回順でNo.を確定する方式にしている。

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
 *  useRef(createCycleHistoryState())として保持し、buildCycleHistoryへ毎回渡す。 */
export interface CycleHistoryState {
  /** 物理スロット(1-5) → 直前に見た内容のシグネチャ（変化検知用） */
  signatureBySlot: Map<number, string>
  /** No. → そのサイクルタイム（秒）。前回差分の算出に使う */
  cycleTimeByNo: Map<number, number>
  /** No. → 整形済み履歴。PLCの5スロットが上書きされても履歴を保持する */
  recordByNo: Map<number, CycleRecord>
  /** 直前に新規データが書き込まれたと判定した物理スロット（巡回の起点） */
  lastWrittenSlot: number | null
  /** 次に新規レコードへ割り振るNo. */
  nextNo: number
  /** 初回ポーリングかどうか（巡回の起点が未確定の間だけtrue） */
  initialized: boolean
}

export function createCycleHistoryState(): CycleHistoryState {
  return {
    signatureBySlot: new Map(),
    cycleTimeByNo: new Map(),
    recordByNo: new Map(),
    lastWrittenSlot: null,
    nextNo: 1,
    initialized: false,
  }
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

/** 順序判定専用のシグネチャ。「同じスロットに同じ内容が2回連続で来ることはPLCの巡回書き込み
 *  上あり得ない」という前提のもと、内容の変化＝新規書き込みの検知にのみ使う（分単位の時刻を
 *  含んでいても、変化検知の用途では精度不足にならない）。 */
function slotSignature(s: CycleHistorySlotValues): string {
  return [
    s.startYear, s.startMonth, s.startDay, s.startHour, s.startMinute,
    s.endYear, s.endMonth, s.endDay, s.endHour, s.endMinute,
    s.cycleTimeMin, s.cycleTimeSec,
  ].join('_')
}

function assignNo(
  slotValues: CycleHistorySlotValues,
  startDate: Date,
  endDate: Date,
  state: CycleHistoryState
) {
  const no = state.nextNo
  state.nextNo += 1

  const cycleTimeSec = slotValues.cycleTimeMin * 60 + slotValues.cycleTimeSec
  const prevCycleTimeSec = state.cycleTimeByNo.get(no - 1)
  const diffFromPrevSec = prevCycleTimeSec !== undefined ? cycleTimeSec - prevCycleTimeSec : null

  state.cycleTimeByNo.set(no, cycleTimeSec)
  state.recordByNo.set(no, {
    no,
    startTime: formatClock(startDate),
    endTime: formatClock(endDate),
    cycleTimeSec,
    diffFromPrevSec,
  })
  state.signatureBySlot.set(slotValues.slot, slotSignature(slotValues))
  state.lastWrittenSlot = slotValues.slot
}

/** PLCから受け取った直近5件（物理スロット1〜5、巡回書き込み）を、発生順（古い→新しい）で整形する。
 *  No.は一度割り振ったら固定、前回差分は「No.-1」のサイクルタイムとの差。 */
export function buildCycleHistory(
  slots: CycleHistorySlotValues[],
  state: CycleHistoryState
): CycleRecord[] {
  const valid = slots
    .map((s) => ({
      slot: s,
      startDate: toDate(s.startYear, s.startMonth, s.startDay, s.startHour, s.startMinute),
      endDate: toDate(s.endYear, s.endMonth, s.endDay, s.endHour, s.endMinute),
    }))
    .filter((x): x is { slot: CycleHistorySlotValues; startDate: Date; endDate: Date } => !!x.startDate && !!x.endDate)

  if (!state.initialized) {
    // 初回のみ：巡回の起点がまだ分からないため、開始時刻→スロット番号の順で仮に並べる。
    // 以降はスロットの巡回順で追跡するので、ここでのズレは初回限りの影響に留まる。
    valid
      .slice()
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.slot.slot - b.slot.slot)
      .forEach(({ slot, startDate, endDate }) => assignNo(slot, startDate, endDate, state))
    state.initialized = true
  } else {
    // 2回目以降：分単位の時刻は同一分に複数サイクルが収まると同着になり得るため順序判定には使わない。
    // PLCはスロットを1→2→3→4→5→1…と固定順で巡回書き込みするので、
    // 「内容が変わった＝新規書き込みされた」スロットだけを、前回の書き込み位置からの巡回順で確定させる。
    const changed = valid.filter(
      ({ slot }) => state.signatureBySlot.get(slot.slot) !== slotSignature(slot)
    )
    const bySlotNo = new Map(changed.map((c) => [c.slot.slot, c]))

    let cursor = state.lastWrittenSlot
    let guard = 0
    while (bySlotNo.size > 0 && guard < 5) {
      cursor = cursor === null ? Math.min(...bySlotNo.keys()) : (cursor % 5) + 1
      const hit = bySlotNo.get(cursor)
      if (hit) {
        assignNo(hit.slot, hit.startDate, hit.endDate, state)
        bySlotNo.delete(cursor)
      }
      guard += 1
    }
    // 想定外に巡回順で消化しきれなかった分のフォールバック（通常は発生しない）
    Array.from(bySlotNo.values())
      .sort((a, b) => a.slot.slot - b.slot.slot)
      .forEach(({ slot, startDate, endDate }) => assignNo(slot, startDate, endDate, state))
  }

  // 古いNo.のエントリはもう参照されないので、メモリが無限に増えないよう間引く
  const cutoff = state.nextNo - 20
  if (cutoff > 0) {
    for (const no of state.cycleTimeByNo.keys()) {
      if (no < cutoff) state.cycleTimeByNo.delete(no)
    }
    for (const no of state.recordByNo.keys()) {
      if (no < cutoff) state.recordByNo.delete(no)
    }
  }

  return Array.from(state.recordByNo.values()).sort((a, b) => a.no - b.no)
}