// usePlcWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react'
import type { DataPoint } from '../types'
import {
  isPlcData,
  formatPlcTime,
  addressToDataKey,
  getDoubleWordValue,
  PLC_DOUBLE_WORD_COUNT,
  PLC_RAW_WORD_COUNT,
} from '../plc'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

const MAX_BUFFER = 50
export const MAX_BROWSER_COUNT = 20

type Options = {
  enabled: boolean
  isPlaying: boolean
  intervalSec: number
  selectedAddresses: number[]
}

function buildWsUrl(): string | null {
  const base = import.meta.env.VITE_WS_BASE_URL as string | undefined
  const token = import.meta.env.VITE_WS_TOKEN as string | undefined
  if (!base?.trim() || !token?.trim()) return null
  const normalized = base.replace(/\/$/, '')
  const path = normalized.endsWith('/browser') ? normalized : `${normalized}/browser`
  return `${path}?token=${encodeURIComponent(token)}`
}

export function usePlcWebSocket({
  enabled,
  isPlaying,
  intervalSec,
  selectedAddresses,
}: Options) {
  const [status, setStatus] = useState<WsStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [data, setData] = useState<DataPoint[]>([])
  const [browserCount, setBrowserCount] = useState<number | null>(null)
  const [browserLimitReached, setBrowserLimitReached] = useState(false)
  const lastAppendRef = useRef(0)
  const hasReceivedInitialBrowserCountRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const addressesRef = useRef(selectedAddresses)
  const isPlayingRef = useRef(isPlaying)
  const intervalSecRef = useRef(intervalSec)

  useEffect(() => {
    addressesRef.current = selectedAddresses
  }, [selectedAddresses])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    intervalSecRef.current = intervalSec
  }, [intervalSec])

  const appendPoint = useCallback((values: number[], ts: number, addresses: number[]) => {
    const time = formatPlcTime(ts)
    const point: DataPoint = { time, _ts: ts }
    for (const addr of addresses) {
      const dwValue = getDoubleWordValue(values, addr)
      if (dwValue !== null) {
        point[addressToDataKey(addr)] = dwValue
      }
    }
    setData((prev) => {
      const updated = [...prev, point]
      return updated.length > MAX_BUFFER ? updated.slice(-MAX_BUFFER) : updated
    })
  }, [])

  // enabledがfalseになった（アイドル切断・閲覧数上限などで接続を止めた）瞬間に、
  // 画面に残っていた古いPLCデータやbrowserCountを持ち越さないようにクリアする。
  // 上位（App.tsx）側でページ内容自体を非表示にしているため必須ではないが、
  // 「切断＝内部状態も空になる」ことを保証しておくための保険。
  useEffect(() => {
    if (!enabled) {
      setData([])
      setBrowserCount(null)
      setStatus('idle')
      setErrorMessage(null)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const url = buildWsUrl()
    if (!url) {
      setStatus('error')
      setErrorMessage('VITE_WS_BASE_URL と VITE_WS_TOKEN を .env に設定してください')
      return
    }

    setStatus('connecting')
    setErrorMessage(null)
    hasReceivedInitialBrowserCountRef.current = false

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus('open')
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => {
      setStatus('error')
      setErrorMessage('WebSocket 接続エラー')
    }

    ws.onmessage = (event) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data as string)
      } catch {
        return
      }

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { type?: string }).type === 'browserCount'
      ) {
        const count = (parsed as { count?: number }).count
        if (typeof count === 'number') {
          setBrowserCount(count)
          if (!hasReceivedInitialBrowserCountRef.current) {
            hasReceivedInitialBrowserCountRef.current = true
            setBrowserLimitReached(count >= MAX_BROWSER_COUNT)
          }
        }
        return
      }

      if (!isPlcData(parsed)) return
      if (!isPlayingRef.current) return

      const now = Date.now()
      const intervalMs = Math.max(intervalSec * 1000, 50)
      if (now - lastAppendRef.current < intervalMs) return
      lastAppendRef.current = now

      const len = parsed.values.length
      if (len !== PLC_DOUBLE_WORD_COUNT && len < PLC_RAW_WORD_COUNT) {
        console.warn(
          `PLC values length: ${len} (expected ${PLC_DOUBLE_WORD_COUNT} precombined or ${PLC_RAW_WORD_COUNT} raw words)`,
        )
      }

      appendPoint(parsed.values, parsed.ts, addressesRef.current)
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [enabled, appendPoint])

  // ★PLCへの書き込み関数（形式が判明したらここだけ直す）
  const sendWrite = useCallback((address: number, value: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('PLC書き込み失敗: WebSocket未接続', { address, value })
      return false
    }
    // ★仮の形式。サーバー側の実際の仕様が分かり次第、ここを修正する
    const message = JSON.stringify({
      type: 'write',
      address,
      value,
    })
    ws.send(message)
    return true
  }, [])

  return { status, errorMessage, data, browserCount, browserLimitReached, sendWrite } // ★sendWriteを追加
}