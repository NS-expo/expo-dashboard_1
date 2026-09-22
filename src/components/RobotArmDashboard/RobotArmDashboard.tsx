import { useEffect, useRef, useState } from 'react'
import type { Theme } from '../../types'
import PanelFrame from '../common/PanelFrame'
import { useIsMobile } from '../../hooks/useMediaQuery'
import type {CameraFeed } from '../../types/common'
import './RobotArmDashboard.css'
import { useCameraDeviceStreams } from '../../hooks/useCameraDeviceStreams'
import { useGo2rtcStream } from '../../hooks/useGo2rtcStream'
import { getOverallFlowStatus } from '../OperationResults/JobFlowDiagram'

type Props = {
  theme: Theme
  isEditing: boolean
  onEditingChange: (value: boolean) => void
  plcStatusById?: Record<string, CameraStatus> 
  onStatusChange?: (status: CameraStatus) => void
  activeStep?: number
  ngSignal?: boolean
}

// 背景色（theme.bg）が明るい色かどうかを簡易判定
// テーマの明暗に応じて、キャンバス背景・異常時の色を切り替えるために使う
function isLightColor(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length !== 6) return true
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

// --- 台数の制約値 ---
const MIN_CAMERAS = 1
const MAX_CAMERAS = 8

// メイン画面で正常時にカメラを自動切替する間隔
const ROTATE_INTERVAL_MS = 6000

// カメラの状態は正常 / 異常の2値で管理する
// 変更後
export type CameraStatus = '運転' | '異常' | '待機' | '停止'

// 状態ごとの表示クラス（運転=緑 / 停止=白 / 待機=青 / 異常=赤）
const STATUS_CLASS: Record<CameraStatus, string> = {
  '運転': 'is-running',
  '停止': 'is-stopped',
  '待機': 'is-standby',
  '異常': 'is-abnormal',
}

// 異常時の枠色。ダーク系テーマ / ライト系テーマそれぞれの「赤」に寄せて出し分ける
const ABNORMAL_COLOR_DARK = '#ff4d4f'
const ABNORMAL_COLOR_LIGHT = '#c81e1e'

const createInitialCameras = (): CameraFeed[] => [
  {
    id: 'cam-1',
    label: 'RB1',
    location: '正面',
    pos: { x: 25, y: 50 },
    size: 800,
    status: '運転',
    completedSteps: 0,
    totalSteps: 5,
    axisStream: 'cam1',
  },
  {
    id: 'cam-2',
    label: 'RB2',
    location: '背面',
    pos: { x: 75, y: 50 },
    size: 800,
    status: '運転',
    completedSteps: 0,
    totalSteps: 5,
    axisStream: 'cam2',
  },
]

const nextCameraDefaults = (index: number): CameraFeed => ({
  id: `cam-${Date.now()}-${index}`,
  label: `カメラ${index}`,
  location: '',
  pos: {
    x: 50 + (Math.random() * 20 - 10),
    y: 50 + (Math.random() * 20 - 10),
  },
  size: 320,
  status: '運転',
  completedSteps: 0,
  totalSteps: 5,
})

export default function RobotArmDashboard({
  theme,
  isEditing,
  onEditingChange,
  plcStatusById,
  onStatusChange,
  activeStep,
  ngSignal,
}: Props) {
  const isMobile = useIsMobile()

  const [cameras, setCameras] = useState<CameraFeed[]>(createInitialCameras())
  const [countInput, setCountInput] = useState(String(cameras.length))

  const deviceIdsById = Object.fromEntries(cameras.map(c => [c.id, c.deviceId]))
  const { streamsByDeviceId, devices, error: cameraError, requestPermission } =
    useCameraDeviceStreams(deviceIdsById)

  
  // 運転中／停止中の表示（実際のPLC稼働信号に繋ぐまでの仮のテスト表示）
  const [isRunning, setIsRunning] = useState(true)

  // --- モバイル：現在表示中のカメラ（タブ切替・横スクロール切替と連動） ---
  const [activeCameraIndex, setActiveCameraIndex] = useState(0)
  // モバイルで「直前に自動切替した異常カメラID」を覚えておき、同じ異常が続く間は再度奪わない
  const prevAutoAbnormalId = useRef<string | null>(null)

  // --- デスクトップ：メイン画面で正常時に自動巡回表示するカメラのインデックス ---
  const [monitorIndex, setMonitorIndex] = useState(0)

  // カメラが削除されるなどして台数が減った場合、表示中インデックスがはみ出さないよう補正
  useEffect(() => {
    setActiveCameraIndex(prev => Math.min(prev, Math.max(0, cameras.length - 1)))
    setMonitorIndex(prev => Math.min(prev, Math.max(0, cameras.length - 1)))
  }, [cameras.length])

  // カメラ台数が外部要因（±ボタン等）で変わったら入力欄の表示も同期する
  useEffect(() => {
    setCountInput(String(cameras.length))
  }, [cameras.length])

    // カメラ台数が外部要因（±ボタン等）で変わったら入力欄の表示も同期する
  useEffect(() => {
    setCountInput(String(cameras.length))
  }, [cameras.length])

  // ↓ ここから追加：PLCから状態が届いたら反映
  useEffect(() => {
  if (!plcStatusById) return
  setCameras(prev =>
    prev.map(cam => {
      const next = plcStatusById[cam.id]
      return next && next !== cam.status ? { ...cam, status: next } : cam
    })
  )
 }, [plcStatusById])
   // --- 他ページのヘッダー●表示用：カメラ全体の状態を1つに集約して親(App)へ通知 ---
  // 優先度：異常 > 運転 > 待機 > 停止（全台停止のときだけ「停止」）
  // 優先度を変えたい場合はこの判定順を入れ替えるだけでOK
  const overallStatus: CameraStatus = cameras.some(c => c.status === '異常')
    ? '異常'
    : cameras.some(c => c.status === '運転')
    ? '運転'
    : cameras.some(c => c.status === '待機')
    ? '待機'
    : '停止'

  useEffect(() => {
    onStatusChange?.(overallStatus)
  }, [overallStatus, onStatusChange])
  const canvasBg = isLightColor(theme.bg) ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.14)'
  const abnormalColor = isLightColor(theme.bg) ? ABNORMAL_COLOR_LIGHT : ABNORMAL_COLOR_DARK
  const overallFlowStatus = getOverallFlowStatus(activeStep, ngSignal)
  // RB1/RB2統合ステータスカード（ガラス風）用の色。テーマの明暗で出し分ける
  const glassBg = isLightColor(theme.bg) ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)'
  const glassBorder = isLightColor(theme.bg) ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.18)'

  const abnormalCameras = cameras.filter(cam => cam.status === '異常')
  const singleAbnormalCamera = abnormalCameras.length === 1 ? abnormalCameras[0] : null
  const isSplitView = abnormalCameras.length >= 2

  // --- メイン画面の自動巡回：異常カメラが無いときだけ、一定間隔でカメラを切り替える ---
  useEffect(() => {
    if (cameras.length <= 1) return
    if (abnormalCameras.length !== 0) return
    const timer = window.setInterval(() => {
      setMonitorIndex(prev => (prev + 1) % cameras.length)
    }, ROTATE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [cameras.length, abnormalCameras.length])

  const displayCamera =
    singleAbnormalCamera ?? cameras[Math.min(monitorIndex, cameras.length - 1)] ?? cameras[0]

 

  // カメラ台数が外部要因（±ボタン等）で変わったら入力欄の表示も同期する
  const clientCount = cameras.length

  const clampedActiveIndex = Math.min(activeCameraIndex, Math.max(0, clientCount - 1))

  // --- モバイル：ステータスボックスに表示する「現在タブのカメラ」 ---
  const activeCamera = cameras[clampedActiveIndex] ?? cameras[0]

  // --- モバイル：タブクリック → 表示カメラを切り替え ---
  const scrollToCameraIndex = (index: number) => {
    setActiveCameraIndex(index)
  }

  // --- モバイル：異常が発生したカメラを自動優先表示する（時間による自動切替は行わない） ---
  useEffect(() => {
    if (!isMobile) return
    const abnormalIndex = cameras.findIndex(cam => cam.status === '異常')
    const abnormalId = abnormalIndex === -1 ? null : cameras[abnormalIndex].id
    if (abnormalId && abnormalId !== prevAutoAbnormalId.current) {
      scrollToCameraIndex(abnormalIndex)
    }
    prevAutoAbnormalId.current = abnormalId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, cameras])

  // --- 台数操作 ---
  const addCamera = () => {
    setCameras(prev => {
      if (prev.length >= MAX_CAMERAS) return prev
      return [...prev, nextCameraDefaults(prev.length + 1)]
    })
  }

  const removeCamera = () => {
    setCameras(prev => (prev.length > MIN_CAMERAS ? prev.slice(0, -1) : prev))
  }

  const applyCameraCount = (raw: string) => {
    const parsed = parseInt(raw, 10)
    const n = Number.isNaN(parsed)
      ? cameras.length
      : Math.min(MAX_CAMERAS, Math.max(MIN_CAMERAS, parsed))

    setCameras(prev => {
      if (n === prev.length) return prev
      if (n > prev.length) {
        const additions = Array.from({ length: n - prev.length }, (_, i) =>
          nextCameraDefaults(prev.length + i + 1)
        )
        return [...prev, ...additions]
      }
      return prev.slice(0, n)
    })
  }

  const handleCountInputChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setCountInput(value)
    }
  }

  const commitCountInput = () => {
    applyCameraCount(countInput)
  }

  // --- 個別カメラの編集 ---
  const updateCamera = (id: string, patch: Partial<CameraFeed>) => {
    setCameras(prev => prev.map(cam => (cam.id === id ? { ...cam, ...patch } : cam)))
  }


  const deleteCamera = (id: string) => {
    setCameras(prev => (prev.length > MIN_CAMERAS ? prev.filter(cam => cam.id !== id) : prev))
  }

  // ↓ ここから追加：未定義だった toggleStatus を実装（テスト用・4値サイクル）
  const STATUS_CYCLE: CameraStatus[] = ['運転', '待機', '停止', '異常']

  const toggleStatus = (id: string) => {
  setCameras(prev =>
    prev.map(cam => {
      if (cam.id !== id) return cam
      const current = cam.status ?? '運転'
      const idx = STATUS_CYCLE.indexOf(current)
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] as CameraStatus
      return { ...cam, status: next }
    })
  )
}

  // --- 工程（PLCから工程完了/開始のたびに信号が来るイメージのテスト操作） ---
  const adjustCompletedSteps = (id: string, delta: number) => {
    setCameras(prev =>
      prev.map(cam => {
        if (cam.id !== id) return cam
        const total = cam.totalSteps ?? 0
        const next = Math.min(total, Math.max(0, (cam.completedSteps ?? 0) + delta))
        return { ...cam, completedSteps: next }
      })
    )
  }

  const applyTotalSteps = (id: string, raw: string) => {
    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed) || parsed < 0) return
    setCameras(prev =>
      prev.map(cam =>
        cam.id === id
          ? { ...cam, totalSteps: parsed, completedSteps: Math.min(cam.completedSteps ?? 0, parsed) }
          : cam
      )
    )
  }
  


 // --- カメラ枠の中身（画像 / プレースホルダー / オーバーレイ）はデスクトップ・モバイル・分割表示で共通 ---
 const renderCameraContent = (cam: CameraFeed) => {
   const stream = cam.deviceId ? streamsByDeviceId[cam.deviceId] : undefined
   return (
     <>

       {cam.axisStream ? (
         <AxisCameraVideo streamName={cam.axisStream} />
       ) : stream ? (
         <CameraVideo stream={stream} />
       ) : cam.imageUrl ? (
         <img src={cam.imageUrl} alt={cam.label} draggable={false} />
       ) : (
         <div className="robot-dashboard__camera-placeholder">NO SIGNAL</div>
       )}
       <div className="robot-dashboard__camera-scanline" />
     </>
   )
 }
  return (
    <PanelFrame className="robot-dashboard">
      <div
        className={`robot-dashboard__body${isEditing ? ' is-editing' : ''}`}
        style={{
          '--canvas-bg': canvasBg,
          '--abnormal-color': abnormalColor,
          '--glass-bg': glassBg,
          '--glass-border': glassBorder,
        } as React.CSSProperties}
      >
        {isMobile ? (
          /* --- モバイル版：1台だけ表示し、上部タブ or 横スクロールで切替 --- */
          <div className="robot-dashboard__mobile-wrap">
            {cameras.length > 1 && (
              <div className="robot-dashboard__mobile-tabs">
                {cameras.map((cam, i) => (
                  <button
                    key={cam.id}
                    type="button"
                    className={`robot-dashboard__mobile-tab${i === clampedActiveIndex ? ' is-active' : ''}`}
                    style={
                      i === clampedActiveIndex
                        ? { borderColor: theme.accent, color: theme.accent }
                        : undefined
                    }
                    onClick={() => scrollToCameraIndex(i)}
                  >
                    {i + 1}
                    {cam.status === '異常' && (
                      <span className="robot-dashboard__mobile-tab-alert" aria-label="異常あり">
                        !
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {activeCamera && (
              <div
                className="robot-dashboard__mobile-status"
                style={{ background: theme.headerBg, borderColor: theme.border }}
              >
                <span
                  className="robot-dashboard__mobile-status-run"
                  style={{
                    borderColor: theme.border,
                    color: isRunning ? theme.accent : theme.subtext,
                  }}
                >
                  <span className="robot-dashboard__status-dot" />
                  {isRunning ? '運転中' : '停止中'}
                </span>

                <div className="robot-dashboard__mobile-status-info">
                  <span className="robot-dashboard__mobile-status-info-item">
                    <span className="robot-dashboard__mobile-status-info-label">状態</span>
                       <span className={STATUS_CLASS[activeCamera.status ?? '運転']}>
                        {activeCamera.status ?? '運転'}
                     </span>
                  </span>
                  <span className="robot-dashboard__mobile-status-info-item">
                    <span className="robot-dashboard__mobile-status-info-label">工程内容</span>
                    <span>{activeCamera.processContent || '-'}</span>
                  </span>
                  <span className="robot-dashboard__mobile-status-info-item">
                    <span className="robot-dashboard__mobile-status-info-label">進捗</span>
                    <span>{activeCamera.completedSteps ?? 0} / {activeCamera.totalSteps ?? 0}</span>
                  </span>
                </div>
              </div>
            )}

            <div className="robot-dashboard__mobile-scroller">
              {activeCamera && [activeCamera].map(cam => {
                const isAbnormal = cam.status === '異常'
                return (
                  <div key={cam.id} className="robot-dashboard__mobile-page">
                    <div
                      className={`robot-dashboard__mobile-frame${isAbnormal ? ' is-abnormal' : ' is-normal'}`}
                      style={{ borderColor: isAbnormal ? undefined : theme.border }}
                    >
                      {renderCameraContent(cam)}
                    </div>
                   </div>
                 )
               })}
            </div>
          </div>
        ) : (
          /* --- デスクトップ版：メインカメラモニター + 右端の縦長ステータスカード --- */
          <div className="robot-dashboard__monitor">
            <div className="robot-dashboard__monitor-stage" style={{ background: canvasBg }}>
              {isSplitView ? (
                <div className="robot-dashboard__split-grid">
                  {abnormalCameras.map(cam => (
                    <div key={cam.id} className="robot-dashboard__camera-frame is-abnormal">
                      {renderCameraContent(cam)}
                    </div>
                   ))}
                </div>
              ) : (
                <>
                  {displayCamera && (
                     <div
                       className={`robot-dashboard__camera-frame robot-dashboard__camera-frame--main${
                         singleAbnormalCamera ? ' is-abnormal' : ' is-normal'
                       }`}
                       style={{ borderColor: singleAbnormalCamera ? undefined : theme.border }}
                     >
                       {renderCameraContent(displayCamera)}
                     </div>
                   )}
                </>
              )}
                <span className="robot-dashboard__recording-indicator" aria-label="録画中">
                  ●REC
                </span>
            </div>

            {/* 右端：縦長のステータスカード列 */}
            <div className="robot-dashboard__status-col" style={{ background: canvasBg }}>
              {/* RB1・RB2以外（3台目以降）は従来どおり個別カードで表示 */}
              {cameras.slice(2).map(cam => {
                
                return (
                  <div
                    key={cam.id}
                    className="robot-dashboard__info-card"
                    style={{ background: theme.headerBg, borderColor: theme.border }}
                  >
                    <div className="robot-dashboard__info-card-header">{cam.label}</div>
                    <div className="robot-dashboard__info-row">
                      <span className="robot-dashboard__info-row-label">状態</span>
                      <span className={STATUS_CLASS[cam.status ?? '運転']}>{cam.status ?? '運転'}</span>
                    </div>
                    <div className="robot-dashboard__info-row">
                      <span className="robot-dashboard__info-row-label">工程内容</span>
                      <span>{cam.processContent || '-'}</span>
                    </div>
                    <div className="robot-dashboard__info-row">
                      <span className="robot-dashboard__info-row-label">進捗</span>
                      <span>{cam.completedSteps ?? 0} / {cam.totalSteps ?? 0}</span>
                    </div>
                  </div>
                )
              })}

              {/* RB1・RB2をまとめた1枚のガラス風ステータスカード（縦長） */}
              {(cameras[0] || cameras[1]) && (
                <div className="robot-dashboard__rb-status-card">
                  {[cameras[0], cameras[1]]
                    .filter((cam): cam is CameraFeed => Boolean(cam))
                    .map((cam, i) => {
                      
                      return (
                        <div className="robot-dashboard__rb-status-block" key={cam.id}>
                          {i === 0 && (
                            <div className="robot-dashboard__overall-flow">
                              <span className="robot-dashboard__overall-flow-label">現在工程</span>
                              <strong>{overallFlowStatus.currentLabel ?? '--'}</strong>
                              <span>進捗 {overallFlowStatus.current || '--'} / {overallFlowStatus.total}工程</span>
                            </div>
                          )}
                          <div className="robot-dashboard__info-card-header">
                            {i === 0 ? 'RB1' : 'RB2'}
                          </div>
                          <div className="robot-dashboard__info-row">
                            <span className="robot-dashboard__info-row-label">状態</span>
                            <span className={STATUS_CLASS[cam.status ?? '運転']}>{cam.status ?? '運転'}</span>
                          </div>
                          <div className="robot-dashboard__info-row">
                            <span className="robot-dashboard__info-row-label">工程内容</span>
                            <span>{cam.processContent || '-'}</span>
                          </div>
                          <div className="robot-dashboard__info-row">
                            <span className="robot-dashboard__info-row-label">進捗</span>
                            <span>{cam.completedSteps ?? 0} / {cam.totalSteps ?? 0}</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
           </div>
          )}

        {/* 右側編集パネル */}
        {isEditing && (
          <div
            className="robot-dashboard__edit-panel"
            style={{ background: theme.headerBg, borderColor: theme.border }}
          >
            <div className="robot-dashboard__edit-panel-scroll">
              {/* 編集モードトグル（設定パネルと同期） */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontSize: '14px', color: theme.text }}>編集モード</span>

                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                  <input
                    type="checkbox"
                    id="editMode"
                    name="editMode"
                    checked={isEditing}
                    onChange={(e) => onEditingChange(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: isEditing ? theme.accent : '#ccc',
                      borderRadius: '24px',
                      transition: '0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        height: '18px',
                        width: '18px',
                        left: isEditing ? '23px' : '3px',
                        bottom: '3px',
                        backgroundColor: '#fff',
                        borderRadius: '50%',
                        transition: '0.2s',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      }}
                    />
                  </span>
                </label>

                <span style={{ fontSize: '13px', color: theme.text }}>
                  {isEditing ? 'ON' : 'OFF'}
                </span>
              </div>

              <section className="robot-dashboard__panel-section">
                <h3>稼働ステータス（テスト表示）</h3>
                <button
                  type="button"
                  className={`robot-dashboard__status-toggle${isRunning ? ' is-normal' : ''}`}
                  onClick={() => setIsRunning(v => !v)}
                >
                  <span className="robot-dashboard__status-dot" />
                  {isRunning ? '運転中' : '停止中'}
                </button>
                <p className="robot-dashboard__panel-hint">
                  実際のPLC稼働信号に繋ぐまでの仮のテスト用トグルです。
                </p>
              </section>

              <section className="robot-dashboard__panel-section">
              <h3>カメラ映像</h3>
              <button type="button" onClick={requestPermission}>
                 カメラへのアクセスを許可
              </button>
             {cameraError && <p className="robot-dashboard__panel-hint">{cameraError}</p>}
             </section>

             <section className="robot-dashboard__panel-section">
             <h3>カメラ台数</h3>
                <div className="robot-dashboard__toolbar-row">
                  <button type="button" onClick={removeCamera} disabled={cameras.length <= MIN_CAMERAS}>
                    −
                  </button>
                  <input
                    type="text"
                    id={`camera-count`}
                    name="cameraCount"
                    inputMode="numeric"
                    className="robot-dashboard__count-input"
                    value={countInput}
                    onChange={e => handleCountInputChange(e.target.value)}
                    onBlur={commitCountInput}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur()
                      }
                    }}
                  />
                  <button type="button" onClick={addCamera} disabled={cameras.length >= MAX_CAMERAS}>
                    ＋
                  </button>
                </div>
                <p className="robot-dashboard__panel-hint">
                  台数を直接入力しても変更できます（最大 {MAX_CAMERAS} 台）。
                  異常が2台以上になると自動で分割表示に切り替わります。
                </p>
              </section>

              <section className="robot-dashboard__panel-section">
                <h3>カメラ個別設定</h3>
                <div className="robot-dashboard__camera-list">
                  {cameras.map((cam, i) => (
                    <div className="robot-dashboard__camera-list-item" key={cam.id}>
                      <div className="robot-dashboard__camera-list-header">
                        <span>#{i + 1}</span>
                        <button
                          type="button"
                          className="robot-dashboard__camera-remove"
                          onClick={() => deleteCamera(cam.id)}
                          disabled={cameras.length <= MIN_CAMERAS}
                          aria-label="このカメラを削除"
                        >
                          ×
                        </button>
                      </div>
                      <label className="robot-dashboard__field">
                        <span>名称</span>
                        <input
                          type="text"
                          id={`camera-label-${cam.id}`}
                          name={`cameraLabel-${cam.id}`}
                          value={cam.label}
                          onChange={e => updateCamera(cam.id, { label: e.target.value })}
                        />
                      </label>
                      <label className="robot-dashboard__field">
                      <span>映像ソース</span>
                       <select
                         id={`camera-device-${cam.id}`}
                         name={`cameraDevice-${cam.id}`}
                         value={cam.deviceId ?? ''}
                         onChange={e => updateCamera(cam.id, { deviceId: e.target.value || undefined })}
                        >
                      <option value="">未割り当て（プレースホルダー）</option>
                      {devices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                       ))}
                     </select>
                    </label>
                    <label className="robot-dashboard__field">
                      <span>AXISカメラ（go2rtcストリーム名）</span>
                       <input
                         type="text"
                         id={`camera-axis-${cam.id}`}
                         name={`cameraAxis-${cam.id}`}
                         placeholder="例: cam1"
                         value={cam.axisStream ?? ''}
                         onChange={e => updateCamera(cam.id, { axisStream: e.target.value || undefined })}
                       />
                     </label>


                      <button
                         type="button"
                         className={`robot-dashboard__status-toggle ${STATUS_CLASS[cam.status ?? '運転']}`}
                         onClick={() => toggleStatus(cam.id)}
                        >
                        <span className="robot-dashboard__status-dot" />
                        {cam.status}
                      </button>

                      <div className="robot-dashboard__field">
                        <span>工程</span>
                        <div className="robot-dashboard__toolbar-row">
                          <button
                            type="button"
                            onClick={() => adjustCompletedSteps(cam.id, -1)}
                            disabled={(cam.completedSteps ?? 0) <= 0}
                          >
                            −
                          </button>
                          <span className="robot-dashboard__step-readout">
                            {cam.completedSteps ?? 0} / {cam.totalSteps ?? 0}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustCompletedSteps(cam.id, 1)}
                            disabled={(cam.completedSteps ?? 0) >= (cam.totalSteps ?? 0)}
                          >
                            ＋
                          </button>
                        </div>
                        <label className="robot-dashboard__field" style={{ marginTop: '4px' }}>
                          <span>全工程数</span>
                          <input
                            key={cam.totalSteps}
                            type="text"
                            id={`camera-totalSteps-${cam.id}`}
                            name={`cameraTotalSteps-${cam.id}`}
                            inputMode="numeric"
                            defaultValue={cam.totalSteps ?? 0}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            onBlur={e => applyTotalSteps(cam.id, e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <p className="robot-dashboard__panel-hint">
                {isMobile
                  ? '異常が発生したカメラのタブへ自動で切り替わります。時間経過による自動切替はありません'
                  : '正常時は一定時間ごとにカメラが自動で切り替わります。異常発生時は自動でそのカメラに切り替わります'}
              </p>
            </div>
          </div>
        )}
      </div>
    </PanelFrame>
  )
}
function CameraVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])
  return <video ref={videoRef} autoPlay playsInline muted />
}

function AxisCameraVideo({ streamName }: { streamName: string }) {
  const { stream, error } = useGo2rtcStream(streamName)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  if (error) {
    return <div className="robot-dashboard__camera-placeholder">接続エラー</div>
  }
  return <video ref={videoRef} autoPlay playsInline muted />
}