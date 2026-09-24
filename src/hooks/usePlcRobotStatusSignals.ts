// usePlcRobotStatusSignals.ts
//
// usePlcWebSocket から得た生データを、
// RB1/RB2の「軸ごとのトルク値・ピーク値・速度(%)」に変換するフック。
//
// 速度は deg/s で送られてくるため、
// speed(%) = speedCurrent / speedMax * 100
// に変換してからAxisFullStatとして返す。

import { useMemo } from 'react'

import type { DataPoint } from '../types'

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'

import {
  ROBOT_AXIS_ADDRESSES,
  ROBOT_SPEED_DISPLAY_MAX_DEG_PER_SEC,
  type RobotKey,
} from '../config/robotStatusAddresses'

export interface AxisFullStat {
  /** 720 deg/sを100%とした速度比 */
  speed: number
  torque: number
  peakTorque: number
}

export interface PlcRobotStatusSignals {
  rb1AxisStats: AxisFullStat[]
  rb2AxisStats: AxisFullStat[]
}

/** 720 deg/sを100%として速度を換算する。
 * 表示側（SpeedBar等）が整数前提のため、ここで四捨五入して整数化する。 */
function toSpeedPercent(current: number): number {
  return Math.round((current / ROBOT_SPEED_DISPLAY_MAX_DEG_PER_SEC) * 100)
}

export function usePlcRobotStatusSignals(
  data: DataPoint[],
): PlcRobotStatusSignals {
  return useMemo(() => {
    const latest = getLatestDataPoint(data)

    const buildAxisStats = (robot: RobotKey): AxisFullStat[] =>
      ROBOT_AXIS_ADDRESSES[robot].map((addr) => {
        const speedCurrent = readAddress(latest, addr.speedCurrent)
        return {
          speed: toSpeedPercent(speedCurrent),
          torque: readAddress(latest, addr.torque),
          peakTorque: readAddress(latest, addr.peakTorque),
        }
      })

    return {
      rb1AxisStats: buildAxisStats('RB1'),
      rb2AxisStats: buildAxisStats('RB2'),
    }
  }, [data])
}