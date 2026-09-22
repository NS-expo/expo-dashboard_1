// =============================================
// PLC レジスタ定義（D15000 ～ 200ワード＝200ダブルワード）
// =============================================

export const PLC_BASE_ADDRESS = 15000 // 先頭デバイス番号 D15000
export const PLC_RAW_WORD_COUNT = 300 // 受信ワード数（D15000～D15199）
export const PLC_DOUBLE_WORD_COUNT = 150 // ダブルワード数（2ワードで1数値）
export const PLC_DOUBLE_WORD_STEP = 2 // 1ダブルワードあたりのワード数

/** グラフ用の線色（ダブルワードごとに割り当て） */
export const PLC_STROKE_COLORS = [
  '#0af3e0', '#43d0f3', '#f472b6', '#fb923c',
  '#34d399', '#60a5fa', '#f87171', '#a78bfa',
  '#fbbf24', '#22d3ee', '#e879f9', '#4ade80',
]

/** ダブルワードの先頭アドレスか（偶数オフセットの D のみ選択可） */
export function isDoubleWordStartAddress(address: number): boolean {
  const offset = address - PLC_BASE_ADDRESS
  return (
    offset >= 0 &&
    offset < PLC_RAW_WORD_COUNT &&
    offset % PLC_DOUBLE_WORD_STEP === 0
  )
}

/** ダブルワード先頭 D → values 配列の先頭ワードインデックス */
export function addressToWordIndex(address: number): number {
  return address - PLC_BASE_ADDRESS
}

/** ダブルワード番号（0～99）→ 先頭 Dアドレス */
export function doubleWordIndexToAddress(dwIndex: number): number {
  return PLC_BASE_ADDRESS + dwIndex * PLC_DOUBLE_WORD_STEP
}

/** グラフ dataKey 用（例: "D15000"） */
export function addressToDataKey(address: number): string {
  return `D${address}`
}

/** 表示ラベル（例: "D15000-D15001"） */
export function formatRegisterLabel(address: number): string {
  if (!isDoubleWordStartAddress(address)) return `D${address}`
  return `D${address}-D${address + 1}`
}

/** 選択可能なダブルワード先頭アドレス一覧（D15000, D15002, … D15198） */
export function getAllRegisterAddresses(): number[] {
  return Array.from({ length: PLC_DOUBLE_WORD_COUNT }, (_, i) =>
    doubleWordIndexToAddress(i),
  )
}

export function getStrokeColor(address: number): string {
  const dwIndex = addressToWordIndex(address) / PLC_DOUBLE_WORD_STEP
  return PLC_STROKE_COLORS[dwIndex % PLC_STROKE_COLORS.length]
}

// =============================================
// WebSocket から受信する PLC データ
// =============================================

export interface PlcData {
  ts: number
  /**
   * plc-pc: 200件（32bit結合済み。values[0]=D15000-D15001）
   * または 400件（生ワード。values[0]=D15000, values[1]=D15001）
   */
  values: number[]
}

export function isPlcData(data: unknown): data is PlcData {
  if (typeof data !== 'object' || data === null) return false
  const o = data as Record<string, unknown>
  return (
    typeof o.ts === 'number' &&
    Array.isArray(o.values) &&
    o.values.every((v) => typeof v === 'number')
  )
}

/** ts をグラフ横軸用の時刻文字列に変換（UNIX秒/ミリ秒以外は受信時刻） */
export function formatPlcTime(ts: number): string {
  const opts = { hour12: false } as const
  if (ts > 1e12) {
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString('ja-JP', opts)
  }
  if (ts > 1e9) {
    const d = new Date(ts * 1000)
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString('ja-JP', opts)
  }
  return new Date().toLocaleTimeString('ja-JP', opts)
}

// =============================================
// 符号付き数値の変換（16bit / 32bit）
// =============================================

/**
 * 1ワードを符号付き16bitに正規化
 * - JSONで -100 / -1 のように送られてくる場合
 * - 65535 / 65534 のように unsigned 16bit 表現で送られる場合
 * のどちらでも同じ結果になる
 */
export function toSignedWord16(raw: number): number {
  if (!Number.isFinite(raw)) return 0
  const unsigned = Math.trunc(raw) & 0xffff
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned
}

/**
 * 2ワードを符号付き32bit（ダブルワード）に結合
 * 三菱PLC想定: 下位=D(n), 上位=D(n+1), リトルエンディアン
 */
export function combineWordsToSignedInt32(lowWord: number, highWord: number): number {
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  view.setInt16(0, toSignedWord16(lowWord), true)
  view.setInt16(2, toSignedWord16(highWord), true)
  return view.getInt32(0, true)
}

/** plc-pc 形式か（150件の32bit結合済み配列） */
export function isPrecombinedPlcValues(values: number[]): boolean {
  return values.length === PLC_DOUBLE_WORD_COUNT
}

/**
 * ダブルワード値を取得（符号付き32bit）
 * - values.length === 150 → plc-pc 送信形式（結合済み）
 * - values.length >= 300 → 生ワード2つを結合
 */
export function getDoubleWordValue(values: number[], startAddress: number): number | null {
  if (!isDoubleWordStartAddress(startAddress)) return null
  const dwIndex = addressToWordIndex(startAddress) / PLC_DOUBLE_WORD_STEP

  if (isPrecombinedPlcValues(values)) {
    const v = values[dwIndex]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  const i = addressToWordIndex(startAddress)
  if (i + 1 >= values.length) return null
  return combineWordsToSignedInt32(values[i], values[i + 1])
}