// services/answerLogStore.ts
//
// 回答ログの「保存の実体」を隠すための層。
// 今は localStorage 実装（localAnswerLogStore）だけを使っているが、
// スマホとモニタは別デバイス/別ブラウザなので、localStorage である限り
// 端末をまたいだ共有は原理的にできない。
//
// 後日DBを用意するときは、この AnswerLogStore インターフェースを実装した
// 別のストア（例: apiAnswerLogStore、下にサンプルを書いてある）を作り、
// getAnswerLogStore() の中身をそちらに差し替えるだけでよい。
// useQuizAnswerLog より上のコード（コンポーネント側）は一切変更不要。

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

 

export const apiAnswerLogStore: AnswerLogStore = { 

  async append(log) { 

    const res = await fetch(`${quizApiBase()}/quiz/answers`, { 

      method: 'POST', 

      headers: { 'Content-Type': 'application/json' }, 

      body: JSON.stringify({ 

        sessionId: readSessionId(), 

        questionId: log.questionId, 

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

    return res.json() 

  }, 

 

  async clear() { 

    await fetch(`${quizApiBase()}/quiz/answers`, { method: 'DELETE' }) 

  }, 

} 

 

export function getAnswerLogStore(): AnswerLogStore { 

  return apiAnswerLogStore 

} 
