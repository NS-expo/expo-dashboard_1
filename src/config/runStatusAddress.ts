// config/runStatusAddress.ts
//
// 全体の稼働状況をPLC(Dレジスタ)から取得するためのアドレス定義。
// jobFlowAddresses.ts と同じ考え方です。
//
// D15018の値と状態の対応：
// 0：停止（未稼働／未設定）
// 1：停止
// 2：待機
// 3：運転
// 4：異常

import type { CameraStatus } from '../components/RobotArmDashboard/RobotArmDashboard'// ← 実際のパスに合わせて調整してください

/** 稼働状況（D15018） */
export const RUN_STATUS_ADDRESS = 15134

/** usePlcWebSocket の selectedAddresses にまとめて渡すための一覧 */
export const RUN_STATUS_ADDRESSES = [RUN_STATUS_ADDRESS]

/** PLCの値 ⇔ CameraStatus（アプリ内の状態表現）の対応表 */
export const RUN_STATUS_VALUE_MAP: Record<number, CameraStatus> = {
  0: '停止',
  1: '停止',
  2: '待機',
  3: '運転',
  4: '異常',
}