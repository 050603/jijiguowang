import { isArray, isNil, isNumber } from 'lodash';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
};
const directionFromReturn = (value, confidence = 0.5) => {
  if (confidence <= 0.4) return 'uncertain';
  if (value >= 1.5) return 'bullish';
  if (value >= 0.25) return 'slightly_bullish';
  if (value <= -1.5) return 'bearish';
  if (value <= -0.25) return 'slightly_bearish';
  return 'neutral';
};

const validNumber = (value) => isNumber(value) && Number.isFinite(value);

const weightedAverage = (items) => {
  const valid = items.filter((item) => validNumber(item.value) && validNumber(item.weight) && item.weight > 0);
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!weightSum) return null;
  return valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum;
};

const scoreToReturn = (score, volatility20d) => {
  const volatilityScale = clamp(finiteNumber(volatility20d, 0.8), 0.35, 2.2);
  return round(clamp(score, -1, 1) * volatilityScale * 0.45, 4);
};

const normalizeMarketMood = (market) => {
  const values = Object.values(market || {})
    .map((item) => (item ? Number(item.changePct) : null))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return { score: 0, valid: false, breadth: 0 };
  const avg = values.reduce((sum, v) => sum + clamp(v / 2.5, -1, 1), 0) / values.length;
  const breadth = values.filter((v) => v > 0).length / values.length;
  return { score: round(clamp(avg * 0.65 + (breadth - 0.5) * 0.7, -1, 1), 4), valid: true, breadth: round(breadth, 4) };
};

const normalizeValuationResidual = (valuation, holdingContribution) => {
  if (!validNumber(valuation)) return { score: 0, valid: false };
  const residual = valuation - finiteNumber(holdingContribution, 0);
  return { score: round(clamp(residual / 1.8, -1, 1), 4), residual: round(residual, 4), valid: true };
};

const trendScore = (technical = {}) => {
  const distance5 = technical.distanceToMa5Pct;
  const distance20 = technical.distanceToMa20Pct;
  const rsi6 = technical.rsi6;
  const rsi14 = technical.rsi14;
  const macdHistogram = technical.macdHistogram;
  const bollingerPctB = technical.bollingerPctB;
  const dailyMomentum3d = technical.dailyMomentum3d;
  const dailyMomentum5d = technical.dailyMomentum5d;
  const items = [];

  if (validNumber(dailyMomentum3d)) items.push({ value: clamp(dailyMomentum3d / 1.6, -1, 1), weight: 1.2 });
  if (validNumber(dailyMomentum5d)) items.push({ value: clamp(dailyMomentum5d / 2.4, -1, 1), weight: 0.8 });
  if (validNumber(distance5)) items.push({ value: clamp(distance5 / 2.2, -1, 1), weight: 0.8 });
  if (validNumber(distance20)) items.push({ value: clamp(distance20 / 5, -1, 1), weight: 0.5 });
  if (validNumber(macdHistogram)) items.push({ value: clamp(macdHistogram * 80, -1, 1), weight: 0.9 });

  const continuation = weightedAverage(items);
  const reversalItems = [];
  if (validNumber(rsi6)) {
    if (rsi6 >= 78) reversalItems.push({ value: -0.75, weight: 1.1 });
    else if (rsi6 >= 68) reversalItems.push({ value: -0.35, weight: 0.8 });
    else if (rsi6 <= 22) reversalItems.push({ value: 0.75, weight: 1.1 });
    else if (rsi6 <= 32) reversalItems.push({ value: 0.35, weight: 0.8 });
  }
  if (validNumber(rsi14)) {
    if (rsi14 >= 72) reversalItems.push({ value: -0.45, weight: 0.8 });
    else if (rsi14 <= 28) reversalItems.push({ value: 0.45, weight: 0.8 });
  }
  if (validNumber(bollingerPctB)) {
    if (bollingerPctB >= 1.05) reversalItems.push({ value: -0.5, weight: 0.9 });
    else if (bollingerPctB <= -0.05) reversalItems.push({ value: 0.5, weight: 0.9 });
  }
  const reversal = weightedAverage(reversalItems);
  return {
    continuation: isNil(continuation) ? 0 : round(continuation, 4),
    reversal: isNil(reversal) ? 0 : round(reversal, 4),
    valid: !isNil(continuation) || !isNil(reversal)
  };
};

const stockLeadScore = (stockPredictions) => {
  if (!isArray(stockPredictions) || !stockPredictions.length) return { score: 0, valid: false };
  const weighted = stockPredictions.map((item) => ({
    value: clamp(finiteNumber(item.predictedReturnPct, 0) / 2.5, -1, 1),
    weight: Math.max(0, finiteNumber(item.weightPct, 0)) * clamp(finiteNumber(item.confidence, 0.2), 0.1, 0.8)
  }));
  const score = weightedAverage(weighted);
  return { score: isNil(score) ? 0 : round(score, 4), valid: !isNil(score) };
};

export function buildNextTradingDayModel(input = {}, stockPredictions = []) {
  const technical = input.technical || {};
  const market = normalizeMarketMood(input.market);
  const trend = trendScore(technical);
  const stockLead = stockLeadScore(stockPredictions);
  const valuationResidual = normalizeValuationResidual(input?.valuation?.gszzl, input?.components?.holdingContribution);
  const volatility20d = technical.volatility20d;
  const highVolatilityPenalty = validNumber(volatility20d) ? clamp((volatility20d - 1.6) / 3, 0, 0.18) : 0.06;
  const missingCount = isArray(input?.dataQuality?.missing) ? input.dataQuality.missing.length : 0;

  const signalItems = [
    { value: trend.continuation, weight: trend.valid ? 1.25 : 0 },
    { value: trend.reversal, weight: trend.valid ? 1.05 : 0 },
    { value: market.score, weight: market.valid ? 0.75 : 0 },
    { value: stockLead.score, weight: stockLead.valid ? 0.65 : 0 },
    { value: valuationResidual.score, weight: valuationResidual.valid ? 0.35 : 0 }
  ];
  const modelScore = weightedAverage(signalItems);
  const score = isNil(modelScore) ? 0 : round(clamp(modelScore, -1, 1), 4);
  const expectedReturnPct = scoreToReturn(score, volatility20d);
  const validSignalCount = signalItems.filter((item) => item.weight > 0).length;
  const agreement = signalItems.filter((item) => item.weight > 0 && Math.sign(item.value) === Math.sign(score)).length;
  const agreementRatio = validSignalCount ? agreement / validSignalCount : 0;
  const confidence = round(
    clamp(
      0.22 + validSignalCount * 0.055 + agreementRatio * 0.18 - missingCount * 0.025 - highVolatilityPenalty,
      0.18,
      0.68
    ),
    4
  );

  const reasons = [
    '次日模型改用技术信号集成，不再把当天估值涨跌作为主信号',
    `趋势延续分=${round(trend.continuation, 3)}，超买超卖修正分=${round(trend.reversal, 3)}`
  ];
  if (market.valid) reasons.push(`市场广度=${market.breadth}，市场情绪分=${market.score}`);
  if (stockLead.valid) reasons.push(`重仓股先行信号分=${stockLead.score}`);
  if (valuationResidual.valid) reasons.push(`估值残差信号仅低权重参与，残差=${valuationResidual.residual}%`);

  const risks = ['技术指标只能描述历史价格结构，不能保证第二日方向'];
  if (validNumber(volatility20d) && volatility20d > 1.6)
    risks.push('20 日波动率偏高，次日预测区间已放宽、置信度已降低');
  if (missingCount >= 3) risks.push('关键特征缺失较多，模型输出偏保守');
  if (Math.abs(score) < 0.12) risks.push('多项信号分歧或强度不足，方向接近中性');

  return {
    score,
    expectedReturnPct,
    confidence,
    direction: directionFromReturn(expectedReturnPct, confidence),
    components: {
      continuation: round(trend.continuation, 4),
      reversal: round(trend.reversal, 4),
      market: market.score,
      stockLead: stockLead.score,
      valuationResidual: valuationResidual.score
    },
    reasons,
    risks
  };
}
