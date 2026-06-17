import { isArray, isNil, isNumber } from 'lodash';

import { buildNextTradingDayModel } from './next-day-model';

const DIRECTIONS = {
  strongUp: 'bullish',
  up: 'slightly_bullish',
  neutral: 'neutral',
  down: 'slightly_bearish',
  strongDown: 'bearish',
  uncertain: 'uncertain'
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
export const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
};
export const directionFromReturn = (value, confidence = 0.5) => {
  if (confidence <= 0.4) return DIRECTIONS.uncertain;
  if (value >= 1.5) return DIRECTIONS.strongUp;
  if (value >= 0.25) return DIRECTIONS.up;
  if (value <= -1.5) return DIRECTIONS.strongDown;
  if (value <= -0.25) return DIRECTIONS.down;
  return DIRECTIONS.neutral;
};

const probabilitiesFromExpected = (expectedReturnPct, confidence) => {
  const tilt = clamp(expectedReturnPct / 4, -0.25, 0.25) * confidence;
  const up = clamp(0.34 + tilt, 0.05, 0.9);
  const down = clamp(0.33 - tilt, 0.05, 0.9);
  const flat = Math.max(0, 1 - up - down);
  return { up: round(up, 4), flat: round(flat, 4), down: round(down, 4) };
};

const marketContribution = (market) => {
  const values = Object.values(market || {})
    .map((item) => (item ? Number(item.changePct) : null))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return { value: 0, valid: false };
  const up = values.filter((v) => v > 0).length;
  const down = values.filter((v) => v < 0).length;
  return { value: up > down ? 0.08 : down > up ? -0.08 : 0, valid: true };
};

const technicalContribution = (technical) => {
  const currentNav = Number(technical?.currentNav);
  const ma5 = Number(technical?.ma5);
  const ma20 = Number(technical?.ma20);
  if (![currentNav, ma5, ma20].every((v) => Number.isFinite(v))) return { value: 0, valid: false };
  if (currentNav > ma5 && ma5 > ma20) return { value: 0.35, valid: true };
  if (currentNav < ma5 && ma5 < ma20) return { value: -0.35, valid: true };
  return { value: 0, valid: true };
};

const scoreStock = (feature, horizon = 'nextTradingDay') => {
  const missing = feature?.dataQuality?.missing || [];
  let predicted = finiteNumber(feature?.todayChangePct, 0) * (horizon === 'nextTradingDay' ? 0.55 : 0.25);
  const reasons = [];
  const risks = [];
  let confidence = isNil(feature?.todayChangePct) ? 0.2 : 0.42;
  if (!isNil(feature?.sectorChangePct)) {
    predicted += finiteNumber(feature.sectorChangePct, 0) * 0.18;
    confidence += 0.08;
    reasons.push('纳入关联板块涨跌信号');
  }
  if (!isNil(feature?.sectorNetInflow)) {
    predicted += clamp(finiteNumber(feature.sectorNetInflow, 0) / 100000000, -0.15, 0.15);
    confidence += 0.05;
    reasons.push('纳入板块资金流向信号');
  }
  const trend = feature?.priceTrend || {};
  if (!isNil(trend.momentum5d)) predicted += finiteNumber(trend.momentum5d, 0) * 0.15;
  if (!isNil(trend.momentum20d)) predicted += finiteNumber(trend.momentum20d, 0) * 0.12;
  if (!isNil(trend.ma5) && !isNil(trend.ma20)) {
    predicted += finiteNumber(trend.ma5, 0) > finiteNumber(trend.ma20, 0) ? 0.12 : -0.12;
    confidence += 0.1;
    reasons.push('纳入个股 5/20 日趋势');
  }
  if (!reasons.length)
    reasons.push(isNil(feature?.todayChangePct) ? '个股有效特征不足，按中性保守处理' : '以当日涨跌为基础并保守折算');
  if (missing.length) risks.push(`缺失：${missing.join('、')}`);
  if (!isNil(trend.volatility20d) && finiteNumber(trend.volatility20d, 0) > 3) {
    confidence -= 0.08;
    risks.push('个股波动率较高，扩大不确定性');
  }
  if (!isNil(feature?.todayChangePct) && isNil(feature?.sectorChangePct) && isNil(trend.ma5))
    confidence = Math.min(confidence, 0.45);
  confidence = clamp(round(confidence, 4), 0.15, 0.75);
  return { predictedReturnPct: round(predicted, 4), confidence, reasons, risks };
};

const buildHorizon = ({ expectedReturnPct, confidence, volatility20d, reasons, risks, horizonDays }) => {
  const rangeWidth = Math.max(
    horizonDays ? 0.8 : 0.35,
    finiteNumber(volatility20d, horizonDays ? 1.2 : 0.6) * (horizonDays ? 1.8 : 1)
  );
  return {
    ...(horizonDays ? { horizonDays } : {}),
    direction: directionFromReturn(expectedReturnPct, confidence),
    expectedReturnPct: round(expectedReturnPct, 4),
    expectedRangePct: [round(expectedReturnPct - rangeWidth, 4), round(expectedReturnPct + rangeWidth, 4)],
    score: round(clamp(50 + expectedReturnPct * 8, 0, 100), 2),
    confidence: round(confidence, 4),
    probability: probabilitiesFromExpected(expectedReturnPct, confidence),
    reasons,
    risks,
    invalidIf: ['估值源延迟或盘后大幅波动', '重仓股实际持仓与披露数据差异较大']
  };
};

const buildRebalanceAdvice = (nextTradingDay, shortTerm, dataQuality) => {
  const missingCount = isArray(dataQuality?.missing) ? dataQuality.missing.length : 0;
  let action = 'watch';
  let strength = 'low';
  const avgConfidence = (finiteNumber(nextTradingDay.confidence, 0) + finiteNumber(shortTerm.confidence, 0)) / 2;
  const bothPositive =
    ['bullish', 'slightly_bullish'].includes(nextTradingDay.direction) &&
    ['bullish', 'slightly_bullish'].includes(shortTerm.direction);
  const bothNegative =
    ['bearish', 'slightly_bearish'].includes(nextTradingDay.direction) &&
    ['bearish', 'slightly_bearish'].includes(shortTerm.direction);
  if (avgConfidence < 0.45 || missingCount >= 4) action = 'uncertain';
  else if (bothPositive) {
    action = 'increase';
    strength = 'medium';
  } else if (bothNegative) {
    action = 'reduce';
    strength = 'medium';
  }
  return {
    action,
    strength,
    suggestedAmountText: '仅建议作为分批观察或小幅调整参考，需结合个人仓位人工确认',
    maxSuggestedAmount: 0,
    reason: '根据双周期方向、置信度和数据完整度进行本地约束后的辅助建议',
    riskControls: ['低置信度不执行方向性操作', '重仓数据滞后时降低建议强度', '单只基金集中度过高时不继续提高仓位'],
    mustConfirm: true
  };
};

export function generateFallbackPrediction(input = {}) {
  try {
    const stockFeatures = isArray(input.stockFeatures) ? input.stockFeatures : [];
    const stockPredictions = stockFeatures.map((feature) => {
      const s = scoreStock(feature, 'nextTradingDay');
      const weightPct = finiteNumber(feature.weightPct, 0);
      return {
        code: feature.code || '',
        name: feature.name || '',
        weightPct: round(weightPct, 4),
        predictedReturnPct: s.predictedReturnPct,
        weightedContributionPct: round((weightPct / 100) * s.predictedReturnPct, 4),
        confidence: s.confidence,
        direction: directionFromReturn(s.predictedReturnPct, s.confidence),
        usedFeatures: ['todayChangePct', 'sectorChangePct', 'sectorNetInflow', 'priceTrend'].filter(
          (k) => !isNil(feature?.[k]) || !isNil(feature?.priceTrend?.[k])
        ),
        missingFeatures: feature?.dataQuality?.missing || [],
        reasons: s.reasons,
        risks: s.risks
      };
    });
    const holdingContribution = round(
      stockPredictions.reduce((sum, item) => sum + item.weightedContributionPct, 0),
      4
    );
    const valuation = isNumber(input?.valuation?.gszzl) ? round(input.valuation.gszzl, 4) : 0;
    const tech = technicalContribution(input.technical);
    const market = marketContribution(input.market);
    const hiddenPosition = round((valuation - holdingContribution) * 0.25, 4);
    const missingCount = isArray(input?.dataQuality?.missing) ? input.dataQuality.missing.length : 0;
    let baseConfidence = clamp(
      0.2 +
        (isNumber(input?.valuation?.gszzl) ? 0.1 : 0) +
        (stockPredictions.length ? 0.12 : 0) +
        (market.valid ? 0.08 : 0),
      0,
      0.7
    );
    if (input?.dataQuality?.holdingsIsLastQuarter) baseConfidence -= 0.08;
    if (missingCount >= 4) baseConfidence = Math.min(baseConfidence, 0.38);
    const nextModel = buildNextTradingDayModel({ ...input, components: { holdingContribution } }, stockPredictions);
    const nextExpected = nextModel.expectedReturnPct;
    baseConfidence = Math.min(baseConfidence + nextModel.confidence * 0.35, 0.68);
    const returns = [input?.periodReturns?.week, input?.periodReturns?.month, input?.periodReturns?.month3].filter(
      (v) => Number.isFinite(Number(v))
    );
    const returnSignal = returns.length ? returns.reduce((a, b) => a + finiteNumber(b, 0), 0) / returns.length / 8 : 0;
    const shortExpected = round(tech.value + returnSignal + holdingContribution * 0.18 + market.value * 0.8, 4);
    const next = buildHorizon({
      expectedReturnPct: nextExpected,
      confidence: baseConfidence,
      volatility20d: input?.technical?.volatility20d,
      reasons: nextModel.reasons,
      risks: ['规则兜底结果未调用 LLM，仅用于结构化参考', ...nextModel.risks],
      horizonDays: null
    });
    const short = buildHorizon({
      expectedReturnPct: shortExpected,
      confidence: clamp(baseConfidence + (tech.valid ? 0.08 : -0.06), 0.15, 0.78),
      volatility20d: input?.technical?.volatility20d,
      reasons: ['基金 5/20 日趋势、阶段收益和重仓股趋势预留特征用于短期情景判断'],
      risks: tech.valid ? ['短期趋势可能受市场风格切换影响'] : ['基金技术指标不足，短期置信度已降低'],
      horizonDays: 5
    });
    if (next.direction !== short.direction) {
      next.risks.push('次日与短期方向存在差异，需降低调仓强度');
      short.risks.push('次日与短期方向存在差异，需分周期观察');
    }
    const components = {
      valuation,
      holdingContribution,
      hiddenPosition,
      technical: round(tech.value, 4),
      market: round(market.value, 4),
      nextDayModel: nextModel.components,
      residual: 0
    };
    return {
      horizons: { nextTradingDay: next, shortTerm: short },
      components,
      stockFeatures,
      stockPredictions,
      rebalanceAdvice: buildRebalanceAdvice(next, short, input.dataQuality),
      dataQuality: input.dataQuality || { completeness: 0, missing: [], warnings: [] },
      summary: `${next.direction !== short.direction ? '次日与短期信号存在分歧，' : ''}双周期情景已生成，调仓仅作辅助参考。仅基于当前可得数据计算，不构成投资建议。`
    };
  } catch {
    const horizon = buildHorizon({
      expectedReturnPct: 0,
      confidence: 0.2,
      reasons: ['数据不足，使用保守兜底结果'],
      risks: ['预测计算异常，已返回不确定结果'],
      horizonDays: null
    });
    return {
      horizons: { nextTradingDay: horizon, shortTerm: { ...horizon, horizonDays: 5 } },
      components: { valuation: 0, holdingContribution: 0, hiddenPosition: 0, technical: 0, market: 0, residual: 0 },
      stockFeatures: [],
      stockPredictions: [],
      rebalanceAdvice: {
        action: 'uncertain',
        strength: 'low',
        suggestedAmountText: '数据不足，不建议据此调整仓位',
        maxSuggestedAmount: 0,
        reason: '数据不足',
        riskControls: ['需人工确认'],
        mustConfirm: true
      },
      dataQuality: { missing: ['fallback_error'], warnings: [] },
      summary: '数据不足，方向不确定。仅基于当前可得数据计算，不构成投资建议。'
    };
  }
}
