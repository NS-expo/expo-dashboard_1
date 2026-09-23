// hooks/usePlcConnectionStatus.ts
//
// PLC接続状況の判定。
//
// 判定基準：取付・取出それぞれのベストサイクルタイム
// （usePlcCycleSignals().tightenBestCycleTimeSec / loosenBestCycleTimeSec。
//  D15052/15054・D15056/15058、PLC側で保持している値）。
// ・どちらか一方でも値が入っている（0より大きい）→ 接続中とみなす（即座に反映）
// ・両方とも0 → すぐには非接続と判定せず、一定時間（DISCONNECT_DELAY_MS）その
//   状態が続いた場合にのみ非接続とみなす。起動直後やPLC応答待ちの一瞬だけ
//   0になったケースでアイコンがチラつかないようにするための猶予。
import { useEffect, useRef, useState } from 'react'

/** 両方0の状態がこの時間続いたら非接続と判定する（ms） */
const DISCONNECT_DELAY_MS = 180000

export function usePlcConnectionStatus(
  tightenBestCycleTimeSec: number | undefined,
  loosenBestCycleTimeSec: number | undefined,
): boolean {
  const hasValue = (tightenBestCycleTimeSec ?? 0) > 0 || (loosenBestCycleTimeSec ?? 0) > 0

  const [isConnected, setIsConnected] = useState(hasValue)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (hasValue) {
      // 値が入った時点で即座に「接続」とみなす
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
      setIsConnected(true)
      return
    }

    // 両方0：一定時間後に「非接続」と判定する（猶予中にtrueへ戻ればタイマーは破棄される）
    timerRef.current = window.setTimeout(() => {
      setIsConnected(false)
    }, DISCONNECT_DELAY_MS)

    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    }
  }, [hasValue])

  return isConnected
}
