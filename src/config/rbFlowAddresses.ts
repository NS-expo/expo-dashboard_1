// config/rbFlowAddresses.ts
//
// RB1・RB2それぞれの現在工程ステップをPLC(Dレジスタ)から取得するためのアドレス定義。
// jobFlowAddresses.ts と同じ考え方ですが、フロー内容（各ステップが何の工程か）は
// まだ全体で決まっていないため、アドレスのみ先行して定義しておきます。
//
// D15173は現状未使用（欠番）。用途が決まった場合はここに追加してください。

/** RB1の現在工程ステップ（D15172） */
export const RB1_FLOW_STEP_ADDRESS = 15172

/** RB2の現在工程ステップ（D15174） */
export const RB2_FLOW_STEP_ADDRESS = 15174

/** usePlcWebSocket の selectedAddresses にまとめて渡すための一覧 */
export const RB_FLOW_ADDRESSES = [RB1_FLOW_STEP_ADDRESS, RB2_FLOW_STEP_ADDRESS]

/**
 * ステップ番号 ⇔ 工程名の対応表（表示・デバッグ用）
 * フロー内容が未確定のため、現時点では空。内容が決まり次第ここに追記してください。
 * 例: { 1: '刃物取付', 2: '刃物取外', ... }
 */
export const RB1_FLOW_STEP_LABELS: Record<number, string> = {
    1:'勘合',
    2:'位置決め',
    3:'検査',
    4:'リングスプリング取付',
    5:'蓋取付',
    6:'リングスプリング取外',
}
export const RB2_FLOW_STEP_LABELS: Record<number, string> = {
    1:'ねじ締め',
    2:'ねじ緩め',
    3:'蓋取り外し',
    4:'上刃交換',
}