import {
  fetchFundData,
  fetchFundHistory,
  fetchFundHoldings,
  fetchFundPeriodReturns,
  fetchFundValuationTrend,
  fetchMarketIndices,
  fetchHotSectorsFromEastmoney
} from '@/app/api/fund';
import { getQueryClient } from '@/app/lib/get-query-client';
import * as qk from '@/app/lib/query-keys';

import { compressFundPredictionInput } from './feature-compressor';
import { generateFallbackPrediction } from './fallback-prediction';
import { invokeFundPredictionLLM } from './llm-prediction-client';
import { buildFundPredictionPrompt } from './prediction-prompt';
import { validateAndRepairPredictionResult } from './result-validator';
import { recordPredictionHistory, getPredictionHistory } from './prediction-history';

const settleValue = (results, index, fallback) =>
  results[index]?.status === 'fulfilled' ? results[index].value : fallback;

const getPredictionStaleTime = () => 5 * 60 * 1000;

const wrapResult = (input, prediction, source) => ({
  fund: input?.fund || { code: '', name: '' },
  collectedAt: input?.collectedAt || new Date().toISOString(),
  input,
  horizons: prediction.horizons,
  prediction: prediction.horizons?.nextTradingDay,
  components: prediction.components,
  stockFeatures: prediction.stockFeatures || input?.stockFeatures || [],
  stockPredictions: prediction.stockPredictions,
  rebalanceAdvice: prediction.rebalanceAdvice,
  summary: prediction.summary,
  dataQuality: prediction.dataQuality || input?.dataQuality || { missing: [], warnings: [] },
  source
});

async function collectRawData(code) {
  const results = await Promise.allSettled([
    fetchFundData(code),
    fetchFundHoldings(code),
    fetchFundPeriodReturns(code),
    fetchFundHistory(code, '3m'),
    fetchMarketIndices(),
    fetchFundValuationTrend(code, '3m'),
    fetchHotSectorsFromEastmoney()
  ]);
  return {
    code,
    fundData: settleValue(results, 0, { code }),
    holdingsData: settleValue(results, 1, {
      holdings: [],
      holdingsReportDate: null,
      holdingsIsLastQuarter: false,
      assetAllocation: []
    }),
    periodReturns: settleValue(results, 2, {
      week: null,
      month: null,
      month3: null,
      month6: null,
      year1: null,
      consecutiveTrend: null
    }),
    history: settleValue(results, 3, []),
    marketIndices: settleValue(results, 4, []),
    valuationTrend: settleValue(results, 5, []),
    hotSectors: settleValue(results, 6, [])
  };
}

async function computePrediction(input, options) {
  if (options.useLLM !== false) {
    const llmResult = await invokeFundPredictionLLM(input, { timeoutMs: options.timeoutMs });
    if (llmResult) {
      const validated = validateAndRepairPredictionResult(llmResult, input);
      return wrapResult(input, validated, 'llm');
    }
  }
  return wrapResult(input, generateFallbackPrediction(input), 'fallback');
}

export async function predictFundWithLLM(code, options = {}) {
  const normalizedCode = code != null ? String(code).trim() : '';
  const useLLM = options.useLLM !== false;
  try {
    const rawData = await collectRawData(normalizedCode);
    const input = compressFundPredictionInput(rawData);
    const qc = getQueryClient();
    const key = qk.fundLlmPrediction(
      input?.fund?.code || normalizedCode,
      input?.valuation?.gztime,
      input?.dataQuality?.holdingsReportDate,
      useLLM,
      'dual',
      input?.technical?.ma5,
      input?.technical?.ma20
    );
    const result = await qc.fetchQuery({
      queryKey: key,
      queryFn: () => computePrediction(input, { ...options, useLLM }),
      staleTime: getPredictionStaleTime(),
      gcTime: 30 * 60 * 1000,
      retry: false
    });
    recordPredictionHistory(result);
    return result;
  } catch {
    const fallbackInput = compressFundPredictionInput({
      code: normalizedCode,
      fundData: { code: normalizedCode },
      holdingsData: { holdings: [] },
      history: [],
      marketIndices: []
    });
    return wrapResult(fallbackInput, generateFallbackPrediction(fallbackInput), 'fallback');
  }
}

export {
  buildFundPredictionPrompt,
  compressFundPredictionInput,
  generateFallbackPrediction,
  invokeFundPredictionLLM,
  validateAndRepairPredictionResult,
  recordPredictionHistory,
  getPredictionHistory
};
