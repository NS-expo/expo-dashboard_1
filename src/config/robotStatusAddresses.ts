// robotStatusAddresses.ts
//
// RB1・RB2それぞれの軸ごとの
// トルク値・トルクピーク値・速度FB値・速度FB最大値
// をPLC(Dレジスタ)から取得するためのアドレス定義。
//
// トルク・速度いずれもサーバー側で32bit結合済みの値として
// 送信されるため、クライアント側では1ワードとしてそのまま読み取る。
//
// 速度は deg/s で来るため、
// speed(%) = speedCurrent / speedMax * 100
// として画面表示用の%に変換する（usePlcRobotStatusSignals.ts側で実施）。

export type RobotKey = 'RB1' | 'RB2'

/** 速度表示の基準値。720 deg/sを100%として換算する。 */
export const ROBOT_SPEED_DISPLAY_MAX_DEG_PER_SEC = 720

export interface AxisAddressSet {
  /** トルク値（現在値） */
  torque: number
  /** トルクのピーク値 */
  peakTorque: number
  /** 速度FB値（現在値、deg/s） */
  speedCurrent: number
  /** 速度FB最大値（deg/s、%変換の分母として使用） */
  speedMax: number
}

/**
 * RB1・RB2の各軸
 *
 * 軸の並び：
 * 0 = S
 * 1 = L
 * 2 = U
 * 3 = R
 * 4 = B
 * 5 = T
 *
 * 注意：RB2の速度アドレスのみ、資料上はB軸とR軸の並びが
 * 入れ替わっている（D15066=B軸、D15068=R軸）。
 * 軸の意味を揃えるため、ここではR軸=D15068、B軸=D15066として定義している。
 */
export const ROBOT_AXIS_ADDRESSES: Record<RobotKey, AxisAddressSet[]> = {
  RB1: [
    { torque: 15100, peakTorque: 15120, speedCurrent: 15020, speedMax: 15040 }, // S軸
    { torque: 15102, peakTorque: 15122, speedCurrent: 15022, speedMax: 15042 }, // L軸
    { torque: 15104, peakTorque: 15124, speedCurrent: 15024, speedMax: 15044 }, // U軸
    { torque: 15106, peakTorque: 15126, speedCurrent: 15026, speedMax: 15046 }, // R軸
    { torque: 15108, peakTorque: 15128, speedCurrent: 15028, speedMax: 15048 }, // B軸
    { torque: 15110, peakTorque: 15130, speedCurrent: 15030, speedMax: 15050 }, // T軸
  ],

  RB2: [
   { torque: 15140, peakTorque: 15160, speedCurrent: 15060, speedMax: 15080 }, // S軸
   { torque: 15142, peakTorque: 15162, speedCurrent: 15062, speedMax: 15082 }, // L軸
   { torque: 15144, peakTorque: 15164, speedCurrent: 15064, speedMax: 15084 }, // U軸
   { torque: 15146, peakTorque: 15166, speedCurrent: 15066, speedMax: 15086 }, // B軸
   { torque: 15148, peakTorque: 15168, speedCurrent: 15068, speedMax: 15088 }, // R軸
   { torque: 15150, peakTorque: 15170, speedCurrent: 15070, speedMax: 15090 }, // T軸
 ],
}

/**
 * usePlcWebSocket の selectedAddresses に
 * まとめて渡すための一覧。
 */
export const ALL_ROBOT_STATUS_ADDRESSES: number[] = [
  ...ROBOT_AXIS_ADDRESSES.RB1.flatMap((axis) => [
    axis.torque,
    axis.peakTorque,
    axis.speedCurrent,
    axis.speedMax,
  ]),
  ...ROBOT_AXIS_ADDRESSES.RB2.flatMap((axis) => [
    axis.torque,
    axis.peakTorque,
    axis.speedCurrent,
    axis.speedMax,
  ]),
]