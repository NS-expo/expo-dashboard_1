import { useEffect, useRef, useState } from 'react'

const GO2RTC_BASE = 'http://localhost:1984'
// 接続が切れた際、何ミリ秒後に再接続を試みるか（展示環境で無人稼働させるため必須）
const RECONNECT_DELAY_MS = 3000

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (pc.iceGatheringState !== 'complete') return
      pc.removeEventListener('icegatheringstatechange', handleStateChange)
      resolve()
    }

    pc.addEventListener('icegatheringstatechange', handleStateChange)
  })
}

export function useGo2rtcStream(streamName: string | undefined) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const retryTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!streamName) {
      setStream(null)
      return
    }
    let cancelled = false

    const clearRetryTimer = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      clearRetryTimer()
      retryTimerRef.current = window.setTimeout(() => {
        if (!cancelled) connect()
      }, RECONNECT_DELAY_MS)
    }

    const connect = async () => {
      // 前の接続が残っていれば片付ける
      pcRef.current?.close()

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.ontrack = (ev) => {
        if (cancelled) return
        // デバッグ用：映像トラックを受信できたかがここでわかる
        console.log(`[go2rtc:${streamName}] ontrack`, ev.streams[0] ?? ev.track)
        setStream(ev.streams[0] ?? new MediaStream([ev.track]))
        setError(null)
      }

      pc.onconnectionstatechange = () => {
        console.log(`[go2rtc:${streamName}] connectionState =`, pc.connectionState)
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          if (cancelled) return
          setError('接続が切断されました。再接続しています…')
          setStream(null)
          scheduleReconnect()
        }
      }

      // Safari等 connectionState が実装されていない/不安定なブラウザ向けの保険
      pc.oniceconnectionstatechange = () => {
        console.log(`[go2rtc:${streamName}] iceConnectionState =`, pc.iceConnectionState)
      }

      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await waitForIceGatheringComplete(pc)

        const url = `${GO2RTC_BASE}/api/webrtc?src=${streamName}`
        console.log(`[go2rtc:${streamName}] POST`, url)

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp,
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`[go2rtc:${streamName}] HTTP ${res.status}`, body)
          if (!cancelled) {
            setError(`go2rtc接続失敗 (${res.status})`)
            scheduleReconnect()
          }
          return
        }
        const answerSdp = await res.text()
        if (cancelled) return
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
        setError(null)
      } catch (err) {
        // ここで握りつぶさずログに出す（原因究明のため必須）
        console.error(`[go2rtc:${streamName}] connect failed`, err)
        if (!cancelled) {
          setError('WebRTC接続エラー。再接続しています…')
          scheduleReconnect()
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      clearRetryTimer()
      pcRef.current?.close()
      pcRef.current = null
      setStream(null)
    }
  }, [streamName])

  return { stream, error }
}