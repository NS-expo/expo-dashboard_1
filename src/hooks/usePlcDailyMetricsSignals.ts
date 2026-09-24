// hooks/usePlcDailyMetricsSignals.ts
//
// 日別実績（棒グラフ：当日／1日前／2日前）用の異常回数・取付実行回数・取出実行回数を
// PLC(Dレジスタ)から取得するフック。usePlcOperationMetricsSignals.tsとは別に切り出している。
//
// 【旧方式との違い】
// 以前は「metrics」（日ごとに1件ずつコード側で蓄積する想定のprops）を棒グラフにそのまま渡していたが、
// 実際にはコード側で日別の値をラッチ・保持する仕組みが無く、ページを開き直すと表示が消えてしまう
// 不具合があった。今回、PLC側が当日／1日前／2日前の値をそれぞれ別アドレスにラッチして保持する
// ようになったため、コード側での蓄積は不要になった。単純に3件読み出して整形するだけでよい。
//
// アドレス定義は config/operationMetricsAddresses.ts の
// ANOMALY_COUNT_*／TIGHTEN_COUNT_*／LOOSEN_COUNT_*（*_TODAY_ADDRESS／*_YESTERDAY_ADDRESS／
// *_2DAYS_AGO_ADDRESS）を参照。

import { getLatestDataPoint, readAddress } from '../utils/usePlcSignalUtils'
import type { DataPoint } from '../types'
import type { DailyMetricPoint } from '../components/OperationResults/OperationResults'
import {
  ANOMALY_COUNT_TODAY_ADDRESS,
  ANOMALY_COUNT_YESTERDAY_ADDRESS,
  ANOMALY_COUNT_2DAYS_AGO_ADDRESS,
  TIGHTEN_COUNT_TODAY_ADDRESS,
  TIGHTEN_COUNT_YESTERDAY_ADDRESS,
  TIGHTEN_COUNT_2DAYS_AGO_ADDRESS,
  LOOSEN_COUNT_TODAY_ADDRESS,
  LOOSEN_COUNT_YESTERDAY_ADDRESS,
  LOOSEN_COUNT_2DAYS_AGO_ADDRESS,
} from '../config/operationMetricsAddresses'

/** 表示ラベル用：n日前の日付を "M/D" 形式で返す（例: 9/24）。 '当日'などの文言ではなく
 *  実際の日付を表示したいという要望のため、PC側の実時計から機械的に生成する。 */
function daysAgoLabel(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 日別実績（棒グラフ）用の3件（古い→新しい：2日前・1日前・当日）を返す。
 * OperationResultsのdailyMetricsプロパティへそのまま渡せる形。
 */
export function usePlcDailyMetricsSignals(data: DataPoint[]): DailyMetricPoint[] {
  const latest = getLatestDataPoint(data)

  return [
    {
      date: daysAgoLabel(2),
      anomalyCount: readAddress(latest, ANOMALY_COUNT_2DAYS_AGO_ADDRESS),
      tightenCount: readAddress(latest, TIGHTEN_COUNT_2DAYS_AGO_ADDRESS),
      loosenCount: readAddress(latest, LOOSEN_COUNT_2DAYS_AGO_ADDRESS),
    },
    {
      date: daysAgoLabel(1),
      anomalyCount: readAddress(latest, ANOMALY_COUNT_YESTERDAY_ADDRESS),
      tightenCount: readAddress(latest, TIGHTEN_COUNT_YESTERDAY_ADDRESS),
      loosenCount: readAddress(latest, LOOSEN_COUNT_YESTERDAY_ADDRESS),
    },
    {
      date: daysAgoLabel(0),
      anomalyCount: readAddress(latest, ANOMALY_COUNT_TODAY_ADDRESS),
      tightenCount: readAddress(latest, TIGHTEN_COUNT_TODAY_ADDRESS),
      loosenCount: readAddress(latest, LOOSEN_COUNT_TODAY_ADDRESS),
    },
  ]
}