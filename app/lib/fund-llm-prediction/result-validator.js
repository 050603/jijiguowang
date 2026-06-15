import { isArray, isNil, isObject, isString } from 'lodash';

import { clamp, directionFromReturn, finiteNumber, generateFallbackPrediction, round } from './fallback-prediction';

const DIRECTIONS = ['bullish', 'slightly_bullish', 'neutral', 'slightly_bearish', 'bearish', 'uncertain'];
const DISCLAIMER = '仅基于当前可得数据计算，不构成投资建议';
const FORBIDDEN_WORDS = ['必涨', '必跌', '买入', '卖出', '满仓', '清仓'];

const sanitizeText = (text) => {
  const raw = isString(text) ? text : '';
  return FORBIDDEN_WORDS.reduce((acc, word) => acc.replaceAll(word, '确定性指令'), raw);
};

const normalizeTextArray = (value) => (isArray(value) ? value.map(sanitizeText).filter(Boolean) : []);

const normalizeProbability = (probability, expectedReturnPct, confidence) => {
  if (!isObject(probability)) {
    return generateFallbackPrediction({}).prediction.probability;
  }
  let up = clamp(finiteNumber(probability.up, 0.33), 0, 1);
  let flat = clamp(finiteNumber(probability.flat, 0.34), 0, 1);
  let down = clamp(finiteNumber(probability.down, 0.33), 0, 1);
  const total = up + flat + down;
  if (total <= 0)
    return generateFallbackPrediction({ valuation: { gszzl: expectedReturnPct }, dataQuality: { missing: [] } })
      .prediction.probability;
  up = round(up / total, 4);
  flat = round(flat / total, 4);
  down = round(Math.max(0, 1 - up - flat), 4);
  if (confidence <= 0.4) flat = Math.max(flat, 0.34);
  return { up, flat, down };
};

const fallbackWeightByCode = (compressedInput) => {
  const map = new Map();
  if (isArray(compressedInput?.holdings)) {
    compressedInput.holdings.forEach((item) => {
      if (item?.code) map.set(String(item.code), item);
    });
  }
  return map;
};

export function validateAndRepairPredictionResult(llmResult, compressedInput = {}) {
  try {
    if (!isObject(llmResult) || !isObject(llmResult.prediction)) return generateFallbackPrediction(compressedInput);
    const holdingMap = fallbackWeightByCode(compressedInput);
    const risks = normalizeTextArray(llmResult.risks);
    const reasons = normalizeTextArray(llmResult.reasons);
    const stockPredictions = (isArray(llmResult.stockPredictions) ? llmResult.stockPredictions : []).map((item) => {
      const code = item?.code != null ? String(item.code).trim() : '';
      const fallback = holdingMap.get(code) || {};
      const weightPct = round(isNil(item?.weightPct) ? fallback.weightPct : item.weightPct, 4);
      const predictedReturnPct = round(finiteNumber(item?.predictedReturnPct, 0), 4);
      const weightedContributionPct = round((finiteNumber(weightPct, 0) / 100) * predictedReturnPct, 4);
      return {
        code,
        name: item?.name || fallback.name || '',
        weightPct,
        changePct: isNil(item?.changePct)
          ? isNil(fallback.changePct)
            ? null
            : round(fallback.changePct, 4)
          : round(item.changePct, 4),
        direction:
          isString(item?.direction) && item.direction
            ? sanitizeText(item.direction)
            : directionFromReturn(predictedReturnPct, 0.6),
        predictedReturnPct,
        weightedContributionPct,
        confidence: round(clamp(finiteNumber(item?.confidence, 0.4), 0, 1), 4),
        reasons: normalizeTextArray(item?.reasons),
        risks: normalizeTextArray(item?.risks)
      };
    });

    const localHoldingContribution = round(
      stockPredictions.reduce(
        (sum, item) => sum + (finiteNumber(item.weightPct, 0) / 100) * finiteNumber(item.predictedReturnPct, 0),
        0
      ),
      4
    );
    const componentsInput = isObject(llmResult.components) ? llmResult.components : {};
    const components = {
      valuationContribution: round(finiteNumber(componentsInput.valuationContribution, 0), 4),
      holdingContribution: round(finiteNumber(componentsInput.holdingContribution, 0), 4),
      hiddenPositionContribution: round(finiteNumber(componentsInput.hiddenPositionContribution, 0), 4),
      technicalContribution: round(finiteNumber(componentsInput.technicalContribution, 0), 4),
      marketContribution: round(finiteNumber(componentsInput.marketContribution, 0), 4),
      residualCorrection: round(finiteNumber(componentsInput.residualCorrection, 0), 4)
    };
    if (Math.abs(components.holdingContribution - localHoldingContribution) > 0.15) {
      components.holdingContribution = localHoldingContribution;
      risks.push('LLM 持仓贡献已被本地校正');
    }

    const expectedReturnPct = round(
      finiteNumber(
        llmResult.prediction.expectedReturnPct,
        Object.values(components).reduce((sum, v) => sum + finiteNumber(v, 0), 0)
      ),
      4
    );
    let direction = llmResult.prediction.direction;
    if (!DIRECTIONS.includes(direction)) direction = directionFromReturn(expectedReturnPct, 0.6);
    let score = round(clamp(finiteNumber(llmResult.prediction.score, 50), 0, 100), 2);
    let confidence = round(clamp(finiteNumber(llmResult.prediction.confidence, 0.35), 0, 1), 4);
    const missingCount = isArray(compressedInput?.dataQuality?.missing)
      ? compressedInput.dataQuality.missing.length
      : 0;
    if (missingCount >= 4) {
      confidence = Math.min(confidence, 0.45);
      if (!['uncertain', 'neutral'].includes(direction)) direction = 'uncertain';
    }
    let expectedRangePct = llmResult.prediction.expectedRangePct;
    if (!isArray(expectedRangePct) || expectedRangePct.length !== 2) {
      expectedRangePct = [expectedReturnPct - 0.5, expectedReturnPct + 0.5];
    }
    let lower = finiteNumber(expectedRangePct[0], expectedReturnPct - 0.5);
    let upper = finiteNumber(expectedRangePct[1], expectedReturnPct + 0.5);
    if (lower > upper) [lower, upper] = [upper, lower];
    score = Number.isFinite(score) ? score : 50;
    const summaryBase = sanitizeText(llmResult.summary || '已完成基金短期预测计算。');
    const summary = summaryBase.includes(DISCLAIMER)
      ? summaryBase
      : `${summaryBase}${summaryBase.endsWith('。') ? '' : '。'}${DISCLAIMER}。`;
    return {
      prediction: {
        direction,
        expectedReturnPct,
        expectedRangePct: [round(lower, 4), round(upper, 4)],
        score,
        confidence,
        probability: normalizeProbability(llmResult.prediction.probability, expectedReturnPct, confidence)
      },
      components,
      stockPredictions,
      reasons,
      risks,
      summary
    };
  } catch {
    return generateFallbackPrediction(compressedInput);
  }
}
