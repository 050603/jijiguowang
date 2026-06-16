import { isArray } from 'lodash';

import { storageStore } from '@/app/stores';

const STORAGE_KEY = 'fundPredictionHistory';
const MAX_RECORDS = 300;

export function recordPredictionHistory(result) {
  try {
    if (!result?.fund?.code || !result?.horizons) return;
    const current = storageStore.getItem(STORAGE_KEY, []);
    const rows = isArray(current) ? current : [];
    const record = {
      fundCode: result.fund.code,
      fundName: result.fund.name || '',
      predictedAt: result.collectedAt || new Date().toISOString(),
      nextTradingDay: result.horizons.nextTradingDay,
      shortTerm: result.horizons.shortTerm,
      source: result.source || 'fallback',
      gztime: result.input?.valuation?.gztime || null,
      holdingsReportDate:
        result.dataQuality?.holdingsReportDate || result.input?.dataQuality?.holdingsReportDate || null,
      evaluation: { nextTradingDay: 'pending', shortTerm: 'pending' }
    };
    storageStore.setItem(STORAGE_KEY, JSON.stringify([record, ...rows].slice(0, MAX_RECORDS)));
  } catch {
    // ignore history failures
  }
}

export function getPredictionHistory() {
  const rows = storageStore.getItem(STORAGE_KEY, []);
  return isArray(rows) ? rows : [];
}
