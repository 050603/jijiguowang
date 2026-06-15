import { isArray, isNil, isNumber } from 'lodash';

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

const marketContribution = (market) => {
  const values = Object.values(market || {})
    .map((item) => (item ? Number(item.changePct) : null))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return { value: 0, valid: false };
  const up = values.filter((v) => v > 0).length;
  const down = values.filter((v) => v < 0).length;
  if (up > down) return { value: 0.08, valid: true };
  if (down > up) return { value: -0.08, valid: true };
  return { value: 0, valid: true };
};

const technicalContribution = (technical) => {
  const currentNav = Number(technical?.currentNav);
  const ma5 = Number(technical?.ma5);
  const ma20 = Number(technical?.ma20);
  if (![currentNav, ma5, ma20].every((v) => Number.isFinite(v))) return { value: 0, valid: false };
  if (currentNav > ma5 && ma5 > ma20) return { value: 0.12, valid: true };
  if (currentNav < ma5 && ma5 < ma20) return { value: -0.12, valid: true };
  return { value: 0, valid: true };
};

const probabilitiesFromExpected = (expectedReturnPct, confidence) => {
  const tilt = clamp(expectedReturnPct / 4, -0.25, 0.25) * confidence;
  const up = clamp(0.34 + tilt, 0.05, 0.9);
  const down = clamp(0.33 - tilt, 0.05, 0.9);
  const flat = Math.max(0, 1 - up - down);
  return { up: round(up, 4), flat: round(flat, 4), down: round(down, 4) };
};

export function generateFallbackPrediction(compressedInput = {}) {
  try {
    const valuationContribution = isNumber(compressedInput?.valuation?.gszzl)
      ? round(compressedInput.valuation.gszzl, 4)
      : 0;
    const stockPredictions = (isArray(compressedInput.holdings) ? compressedInput.holdings : []).map((holding) => {
      const weightPct = finiteNumber(holding.weightPct, 0);
      const predictedReturnPct = isNil(holding.changePct) ? 0 : finiteNumber(holding.changePct, 0);
      const weightedContributionPct = round((weightPct / 100) * predictedReturnPct, 4);
      return {
        code: holding.code || '',
        name: holding.name || '',
        weightPct: round(weightPct, 4),
        changePct: isNil(holding.changePct) ? null : round(holding.changePct, 4),
        direction: directionFromReturn(predictedReturnPct, isNil(holding.changePct) ? 0.3 : 0.6),
        predictedReturnPct: round(predictedReturnPct, 4),
        weightedContributionPct,
        confidence: isNil(holding.changePct) ? 0.25 : 0.55,
        reasons: [isNil(holding.changePct) ? '个股涨跌幅缺失，按中性处理' : '使用当前可得个股涨跌幅估算'],
        risks: ['重仓数据存在披露滞后，贡献估算可能偏离实际']
      };
    });
    const holdingContribution = round(
      stockPredictions.reduce((sum, item) => sum + item.weightedContributionPct, 0),
      4
    );
    const tech = technicalContribution(compressedInput.technical);
    const market = marketContribution(compressedInput.market);
    const hiddenPositionContribution = round((valuationContribution - holdingContribution) * 0.25, 4);
    const components = {
      valuationContribution,
      holdingContribution,
      hiddenPositionContribution,
      technicalContribution: round(tech.value, 4),
      marketContribution: round(market.value, 4),
      residualCorrection: 0
    };
    const expectedReturnPct = round(
      valuationContribution * 0.55 +
        holdingContribution * 0.2 +
        hiddenPositionContribution * 0.1 +
        tech.value +
        market.value,
      4
    );
    let confidence = 0.15;
    if (isNumber(compressedInput?.valuation?.gszzl)) confidence += 0.3;
    if (stockPredictions.some((item) => !isNil(item.changePct) && item.weightPct > 0)) confidence += 0.2;
    if (tech.valid) confidence += 0.15;
    if (market.valid) confidence += 0.1;
    confidence = clamp(round(confidence, 4), 0, 0.85);
    if ((compressedInput?.dataQuality?.missing || []).length >= 4) confidence = Math.min(confidence, 0.4);
    const direction = directionFromReturn(expectedReturnPct, confidence);
    const rangeWidth = Math.max(0.35, finiteNumber(compressedInput?.technical?.volatility20d, 0.6));
    const risks = [];
    if (!isNumber(compressedInput?.valuation?.gszzl)) risks.push('基金实时估值缺失，预测置信度已降低');
    if (!stockPredictions.length) risks.push('重仓数据缺失，无法估算十大重仓贡献');
    if (!tech.valid) risks.push('技术指标不足，趋势判断按中性处理');
    if (!market.valid) risks.push('市场指数数据不足，市场环境按中性处理');
    risks.push('规则兜底结果未调用 LLM，仅用于结构化参考');
    const reasons = [];
    reasons.push(
      isNumber(compressedInput?.valuation?.gszzl) ? '基金实时估值作为主要短期信号' : '实时估值缺失，短期信号不完整'
    );
    reasons.push(stockPredictions.length ? '已按可得重仓权重和涨跌幅估算持仓贡献' : '暂无有效重仓贡献数据');
    reasons.push(tech.value > 0 ? '技术趋势偏积极' : tech.value < 0 ? '技术趋势偏谨慎' : '技术趋势信号偏中性');
    reasons.push(
      market.value > 0 ? '主要市场指数多数上涨' : market.value < 0 ? '主要市场指数多数下跌' : '市场环境信号偏中性'
    );
    return {
      prediction: {
        direction,
        expectedReturnPct,
        expectedRangePct: [round(expectedReturnPct - rangeWidth, 4), round(expectedReturnPct + rangeWidth, 4)],
        score: round(clamp(50 + expectedReturnPct * 8, 0, 100), 2),
        confidence,
        probability: probabilitiesFromExpected(expectedReturnPct, confidence)
      },
      components,
      stockPredictions,
      reasons,
      risks,
      summary: `短期信号${expectedReturnPct > 0.25 ? '偏积极' : expectedReturnPct < -0.25 ? '偏谨慎' : '偏中性'}，置信度${round(confidence, 2)}。仅基于当前可得数据计算，不构成投资建议。`
    };
  } catch {
    return {
      prediction: {
        direction: 'uncertain',
        expectedReturnPct: 0,
        expectedRangePct: [-0.5, 0.5],
        score: 50,
        confidence: 0.2,
        probability: { up: 0.33, flat: 0.34, down: 0.33 }
      },
      components: {
        valuationContribution: 0,
        holdingContribution: 0,
        hiddenPositionContribution: 0,
        technicalContribution: 0,
        marketContribution: 0,
        residualCorrection: 0
      },
      stockPredictions: [],
      reasons: ['数据不足，使用保守兜底结果'],
      risks: ['预测计算异常，已返回不确定结果'],
      summary: '数据不足，短期方向不确定。仅基于当前可得数据计算，不构成投资建议。'
    };
  }
}
