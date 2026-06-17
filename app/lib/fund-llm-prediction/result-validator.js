import { isArray, isNil, isObject, isString } from 'lodash';

import { clamp, directionFromReturn, finiteNumber, generateFallbackPrediction, round } from './fallback-prediction';
import { buildNextTradingDayModel } from './next-day-model';

const DIRECTIONS = ['bullish', 'slightly_bullish', 'neutral', 'slightly_bearish', 'bearish', 'uncertain'];
const ACTIONS = ['increase', 'reduce', 'hold', 'watch', 'switch', 'uncertain'];
const STRENGTHS = ['low', 'medium', 'high'];
const DISCLAIMER = '仅基于当前可得数据计算，不构成投资建议';
const FORBIDDEN_WORDS = ['必涨', '必跌', '稳赚', '确定买入', '确定卖出', '买入', '卖出', '满仓', '清仓'];

const sanitizeText = (text) =>
  FORBIDDEN_WORDS.reduce((acc, word) => acc.replaceAll(word, '辅助参考'), isString(text) ? text : '');
const normalizeTextArray = (value) => (isArray(value) ? value.map(sanitizeText).filter(Boolean) : []);

const normalizeProbability = (probability) => {
  if (!isObject(probability)) return { up: 0.33, flat: 0.34, down: 0.33 };
  let up = clamp(finiteNumber(probability.up, 0.33), 0, 1);
  let flat = clamp(finiteNumber(probability.flat, 0.34), 0, 1);
  let down = clamp(finiteNumber(probability.down, 0.33), 0, 1);
  const total = up + flat + down;
  if (total <= 0) return { up: 0.33, flat: 0.34, down: 0.33 };
  up = round(up / total, 4);
  flat = round(flat / total, 4);
  down = round(Math.max(0, 1 - up - flat), 4);
  return { up, flat, down };
};

const normalizeRange = (range, expected) => {
  let next = range;
  if (!isArray(next) || next.length !== 2) next = [expected - 0.5, expected + 0.5];
  let lower = finiteNumber(next[0], expected - 0.5);
  let upper = finiteNumber(next[1], expected + 0.5);
  if (lower > upper) [lower, upper] = [upper, lower];
  return [round(lower, 4), round(upper, 4)];
};

const normalizeHorizon = (raw, fallback, missingCount, horizonDays) => {
  const expectedReturnPct = round(finiteNumber(raw?.expectedReturnPct, fallback?.expectedReturnPct || 0), 4);
  let confidence = round(clamp(finiteNumber(raw?.confidence, fallback?.confidence || 0.35), 0, 1), 4);
  let direction = raw?.direction;
  if (!DIRECTIONS.includes(direction)) direction = directionFromReturn(expectedReturnPct, confidence);
  if (missingCount >= 4) {
    confidence = Math.min(confidence, 0.45);
    if (!['uncertain', 'neutral'].includes(direction)) direction = 'uncertain';
  }
  return {
    ...(horizonDays ? { horizonDays: finiteNumber(raw?.horizonDays, horizonDays) } : {}),
    direction,
    expectedReturnPct,
    expectedRangePct: normalizeRange(raw?.expectedRangePct, expectedReturnPct),
    score: round(clamp(finiteNumber(raw?.score, 50), 0, 100), 2),
    confidence,
    probability: normalizeProbability(raw?.probability),
    reasons: normalizeTextArray(raw?.reasons),
    risks: normalizeTextArray(raw?.risks),
    invalidIf: normalizeTextArray(raw?.invalidIf).length
      ? normalizeTextArray(raw?.invalidIf)
      : ['输入数据过期或重仓披露偏离实际']
  };
};

export function validateAndRepairPredictionResult(llmResult, compressedInput = {}) {
  try {
    if (!isObject(llmResult) || !isObject(llmResult.horizons)) return generateFallbackPrediction(compressedInput);
    const fallback = generateFallbackPrediction(compressedInput);
    const missingCount = isArray(compressedInput?.dataQuality?.missing)
      ? compressedInput.dataQuality.missing.length
      : 0;
    const holdingMap = new Map(
      (compressedInput.stockFeatures || compressedInput.holdings || []).map((item) => [String(item.code), item])
    );
    const stockPredictions = (isArray(llmResult.stockPredictions) ? llmResult.stockPredictions : []).map((item) => {
      const code = item?.code != null ? String(item.code).trim() : '';
      const fallbackStock = holdingMap.get(code) || {};
      const weightPct = round(isNil(item?.weightPct) ? fallbackStock.weightPct : item.weightPct, 4);
      const predictedReturnPct = round(finiteNumber(item?.predictedReturnPct, 0), 4);
      return {
        code,
        name: item?.name || fallbackStock.name || '',
        weightPct,
        predictedReturnPct,
        weightedContributionPct: round((finiteNumber(weightPct, 0) / 100) * predictedReturnPct, 4),
        confidence: round(clamp(finiteNumber(item?.confidence, 0.35), 0, 1), 4),
        direction: DIRECTIONS.includes(item?.direction) ? item.direction : directionFromReturn(predictedReturnPct, 0.5),
        usedFeatures: isArray(item?.usedFeatures) ? item.usedFeatures : [],
        missingFeatures: isArray(item?.missingFeatures)
          ? item.missingFeatures
          : fallbackStock?.dataQuality?.missing || [],
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
    const rawComponents = isObject(llmResult.components) ? llmResult.components : {};
    const components = {
      valuation: round(rawComponents.valuation ?? rawComponents.valuationContribution, 4),
      holdingContribution: round(rawComponents.holdingContribution, 4),
      hiddenPosition: round(rawComponents.hiddenPosition ?? rawComponents.hiddenPositionContribution, 4),
      technical: round(rawComponents.technical ?? rawComponents.technicalContribution, 4),
      market: round(rawComponents.market ?? rawComponents.marketContribution, 4),
      nextDayModel: isObject(rawComponents.nextDayModel)
        ? rawComponents.nextDayModel
        : fallback.components?.nextDayModel || {},
      residual: round(rawComponents.residual ?? rawComponents.residualCorrection, 4)
    };
    const warnings = [...(compressedInput?.dataQuality?.warnings || [])];
    if (Math.abs(finiteNumber(components.holdingContribution, 0) - localHoldingContribution) > 0.15) {
      components.holdingContribution = localHoldingContribution;
      warnings.push('LLM 持仓贡献已被本地校正');
    }
    const nextTradingDay = normalizeHorizon(
      llmResult.horizons.nextTradingDay,
      fallback.horizons.nextTradingDay,
      missingCount,
      null
    );
    const localNextModel = buildNextTradingDayModel(
      { ...compressedInput, components: { holdingContribution: localHoldingContribution } },
      stockPredictions
    );
    const valuationPct = finiteNumber(compressedInput?.valuation?.gszzl, 0);
    const llmExpected = nextTradingDay.expectedReturnPct;
    const localExpected = localNextModel.expectedReturnPct;
    const valuationAnchored = Math.abs(llmExpected - valuationPct) < 0.08 && Math.abs(valuationPct) >= 0.35;
    if (valuationAnchored || Math.abs(llmExpected - localExpected) > 0.8) {
      const repairedExpected = round(localExpected * 0.7 + llmExpected * 0.3, 4);
      nextTradingDay.expectedReturnPct = repairedExpected;
      nextTradingDay.direction = directionFromReturn(
        repairedExpected,
        Math.min(nextTradingDay.confidence, localNextModel.confidence)
      );
      nextTradingDay.expectedRangePct = normalizeRange(nextTradingDay.expectedRangePct, repairedExpected);
      nextTradingDay.confidence = round(Math.min(nextTradingDay.confidence, localNextModel.confidence, 0.58), 4);
      nextTradingDay.reasons = [
        '本地校验检测到次日预测过度贴近当天涨跌或偏离轻量技术模型，已按技术集成模型降权修正',
        ...localNextModel.reasons,
        ...nextTradingDay.reasons
      ];
      nextTradingDay.risks = [...nextTradingDay.risks, '次日结果已降低当天估值信号权重，仍不保证方向准确'];
      components.nextDayModel = localNextModel.components;
      warnings.push('次日预测已按轻量技术模型修正，避免过度跟随当天涨跌');
    }
    const shortTerm = normalizeHorizon(llmResult.horizons.shortTerm, fallback.horizons.shortTerm, missingCount, 5);
    const avgConfidence = (nextTradingDay.confidence + shortTerm.confidence) / 2;
    const rawAdvice = isObject(llmResult.rebalanceAdvice) ? llmResult.rebalanceAdvice : {};
    let action = ACTIONS.includes(rawAdvice.action) ? rawAdvice.action : 'watch';
    let strength = STRENGTHS.includes(rawAdvice.strength) ? rawAdvice.strength : 'low';
    if (avgConfidence < 0.45 || missingCount >= 4)
      action = ['increase', 'reduce', 'switch'].includes(action) ? 'watch' : action;
    if (missingCount >= 3 || compressedInput?.dataQuality?.holdingsIsLastQuarter)
      strength = strength === 'high' ? 'medium' : strength;
    if (nextTradingDay.direction !== shortTerm.direction && strength === 'high') strength = 'medium';
    const summaryBase = sanitizeText(llmResult.summary || fallback.summary || '已完成双周期走势参考。');
    const summary = summaryBase.includes(DISCLAIMER)
      ? summaryBase
      : `${summaryBase}${summaryBase.endsWith('。') ? '' : '。'}${DISCLAIMER}。`;
    return {
      horizons: { nextTradingDay, shortTerm },
      components,
      stockFeatures: compressedInput.stockFeatures || [],
      stockPredictions,
      rebalanceAdvice: {
        action,
        strength,
        suggestedAmountText: sanitizeText(rawAdvice.suggestedAmountText || '仅作调仓辅助参考，需人工确认'),
        maxSuggestedAmount: Math.max(0, finiteNumber(rawAdvice.maxSuggestedAmount, 0)),
        reason: sanitizeText(rawAdvice.reason || '本地校验后生成的辅助建议'),
        riskControls: normalizeTextArray(rawAdvice.riskControls),
        mustConfirm: true
      },
      dataQuality: { ...(compressedInput.dataQuality || {}), warnings },
      summary
    };
  } catch {
    return generateFallbackPrediction(compressedInput);
  }
}
