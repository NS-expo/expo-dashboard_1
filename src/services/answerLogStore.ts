// services/answerLogStore.ts
//
// 回答ログの保存・取得をAPI経由で行う層。
// 作成者ページとモニタ埋め込みグラフは、同じストアから回答ログを取得する。

import type { QuizAnswerLog } from '../types' 

 

export interface AnswerLogStore { 

  append(log: QuizAnswerLog): Promise<void> 

  getAll(): Promise<QuizAnswerLog[]> 

  clear(): Promise<void> 

} 

 

const SESSION_KEY = 'nameplateQuiz.sessionId.v1' 

 

function quizApiBase(): string { 

  const base = import.meta.env.VITE_QUIZ_API_BASE as string | undefined 

  if (!base?.trim()) { 

    throw new Error('VITE_QUIZ_API_BASE が未設定です') 

  } 

  return base.replace(/\/$/, '') 

} 

 

function readSessionId(): string | undefined { 

  try { 

    return sessionStorage.getItem(SESSION_KEY) || undefined 

  } catch { 

    return undefined 

  } 

} 

 

function writeSessionId(id: string) { 

  try { 

    sessionStorage.setItem(SESSION_KEY, id) 

  } catch { 

    // noop 

  } 

} 

function dateFromTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const timestamp = value > 1e12 ? value : value * 1000
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return undefined
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeAnswerLog(value: unknown): QuizAnswerLog | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.questionId !== 'string' ||
    typeof raw.choiceIndex !== 'number' ||
    typeof raw.correct !== 'boolean' ||
    typeof raw.timestamp !== 'number'
  ) return null

  const date =
    typeof raw.date === 'string' && raw.date.length >= 10
      ? raw.date.slice(0, 10)
      : dateFromTimestamp(raw.timestamp)
  if (!date) return null

  return {
    questionId: raw.questionId,
    date,
    choiceIndex: raw.choiceIndex,
    correct: raw.correct,
    timestamp: raw.timestamp,
  }
}

 

export const apiAnswerLogStore: AnswerLogStore = { 

  async append(log) { 

    const res = await fetch(`${quizApiBase()}/quiz/answers`, { 

      method: 'POST', 

      headers: { 'Content-Type': 'application/json' }, 

      body: JSON.stringify({ 

        sessionId: readSessionId(), 

        questionId: log.questionId,
        date: log.date,

        choiceIndex: log.choiceIndex, 

        correct: log.correct, 

        timestamp: log.timestamp, 

      }), 

    }) 

    if (!res.ok) throw new Error(`quiz append failed: ${res.status}`) 

    const data = (await res.json()) as { sessionId?: string } 

    if (data.sessionId) writeSessionId(data.sessionId) 

  }, 

 

  async getAll() { 

    const res = await fetch(`${quizApiBase()}/quiz/answers`) 

    if (!res.ok) return [] 

    const payload = (await res.json()) as unknown
    const rawLogs = Array.isArray(payload)
      ? payload
      : typeof payload === 'object' && payload !== null && Array.isArray((payload as { answers?: unknown }).answers)
        ? (payload as { answers: unknown[] }).answers
        : []
    return rawLogs.map(normalizeAnswerLog).filter((log): log is QuizAnswerLog => log !== null)

  }, 

 

  async clear() { 

    await fetch(`${quizApiBase()}/quiz/answers`, { method: 'DELETE' }) 

  }, 

} 

 

export function getAnswerLogStore(): AnswerLogStore { 

  return apiAnswerLogStore 

} 
