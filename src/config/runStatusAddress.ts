// config/runStatusAddress.ts
//
// RB1・RB2それぞれの稼働状況をPLC(Dレジスタ)から取得するためのアドレス定義。
// jobFlowAddresses.ts と同じ考え方です。
//
// 値と状態の対応（RB1・RB2共通）：
// 0：停止（未稼働／未設定）
// 1：停止
// 2：待機
// 3：運転
// 4：異常
//
// RUN_STATUS_RB2_ADDRESS（15134）が現状PLCから取得できている稼働状況アドレス。
// RUN_STATUS_RB1_ADDRESS はまだアドレスが確定していないため undefined としている。
// 確定次第、値を設定して RUN_STATUS_ADDRESSES に含める（下記参照）。

import type { CameraStatus } from '../components/RobotArmDashboard/RobotArmDashboard' // ← 実際のパスに合わせて調整してください

/** RB1 稼働状況 */
export const RUN_STATUS_RB1_ADDRESS = 15134

/** RB2 稼働状況 */
export const RUN_STATUS_RB2_ADDRESS = 15136

/** usePlcWebSocket の selectedAddresses にまとめて渡すための一覧（未確定のアドレスは除外） */
export const RUN_STATUS_ADDRESSES = [RUN_STATUS_RB1_ADDRESS, RUN_STATUS_RB2_ADDRESS].filter(
  (addr): addr is number => addr !== undefined,
)

/** PLCの値 ⇔ CameraStatus（アプリ内の状態表現）の対応表 */
export const RUN_STATUS_VALUE_MAP: Record<number, CameraStatus> = {
  0: '停止',
  1: '停止',
  2: '待機',
  3: '運転',
  4: '異常',
}
