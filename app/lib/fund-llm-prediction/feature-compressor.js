import { isArray, isNil, isNumber, isObject, isString } from 'lodash';

const toFiniteNumber = (value) => {
  if (isNil(value) || value === '') return null;
  const normalized = isString(value) ? value.replace(/%/g, '').replace(/,/g, '').trim() : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 4) => {
  const n = toFiniteNumber(value);
  if (isNil(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const pickFirstNumber = (obj, keys) => {
  if (!isObject(obj)) return null;
  for (const key of keys) {
    const n = toFiniteNumber(obj[key]);
    if (!isNil(n)) return n;
  }
  return null;
};

const getFundName = (fundData, rawData) => {
  if (isString(fundData?.name) && fundData.name.trim()) return fundData.name.trim();
  if (isString(rawData?.name) && rawData.name.trim()) return rawData.name.trim();
  return '';
};

const normalizeHolding = (holding) => {
  const weightPct = pickFirstNumber(holding, ['weightPct', 'weight', 'percent', 'zjzbl']);
  const changePct = pickFirstNumber(holding, ['changePct', 'change', 'changePercent', 'zdf']);
  return {
    code: holding?.code != null ? String(holding.code).trim() : '',
    name: holding?.name != null ? String(holding.name).trim() : '',
    weightPct: round(weightPct, 4),
    changePct: isNil(changePct) ? null : round(changePct, 4)
  };
};

const normalizeAssetAllocation = (assetAllocation) => {
  if (!isArray(assetAllocation)) return [];
  return assetAllocation
    .map((item) => ({
      name: item?.name != null ? String(item.name).trim() : '',
      value: round(pickFirstNumber(item, ['value', 'percent', 'ratio']), 4)
    }))
    .filter((item) => item.name && !isNil(item.value));
};

const normalizeHistory = (history) => {
  if (!isArray(history)) return [];
  return history
    .map((item) => ({
      date: item?.date,
      nav: pickFirstNumber(item, ['value', 'nav', 'dwjz'])
    }))
    .filter((item) => !isNil(item.nav));
};

const average = (values) => {
  const valid = values.filter((v) => isNumber(v) && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
};

const computeVolatility = (history, days = 20) => {
  const recent = history.slice(-days - 1);
  if (recent.length < 2) return null;
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].nav;
    const curr = recent[i].nav;
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(curr)) {
      returns.push(((curr - prev) / prev) * 100);
    }
  }
  if (returns.length < 2) return null;
  const mean = average(returns);
  const variance = average(returns.map((v) => (v - mean) ** 2));
  return Math.sqrt(variance);
};

const computeTechnical = (history, fundData, missing) => {
  const rows = normalizeHistory(history);
  const currentNav = rows.length ? rows[rows.length - 1].nav : toFiniteNumber(fundData?.dwjz ?? fundData?.gsz);
  const ma5 = rows.length >= 5 ? average(rows.slice(-5).map((item) => item.nav)) : null;
  const ma20 = rows.length >= 20 ? average(rows.slice(-20).map((item) => item.nav)) : null;
  if (!rows.length) missing.push('history');
  if (isNil(ma5)) missing.push('technical.ma5');
  if (isNil(ma20)) missing.push('technical.ma20');
  const recent20 = rows
    .slice(-20)
    .map((item) => item.nav)
    .filter((v) => Number.isFinite(v));
  return {
    currentNav: round(currentNav, 4),
    ma5: round(ma5, 4),
    ma20: round(ma20, 4),
    distanceToMa5Pct:
      !isNil(currentNav) && !isNil(ma5) && ma5 !== 0 ? round(((currentNav - ma5) / ma5) * 100, 4) : null,
    distanceToMa20Pct:
      !isNil(currentNav) && !isNil(ma20) && ma20 !== 0 ? round(((currentNav - ma20) / ma20) * 100, 4) : null,
    volatility20d: round(computeVolatility(rows, 20), 4),
    support: recent20.length ? round(Math.min(...recent20), 4) : null,
    resistance: recent20.length ? round(Math.max(...recent20), 4) : null
  };
};

const normalizeMarketItem = (item) => {
  if (!isObject(item)) return null;
  return {
    name: item.name || '',
    price: round(pickFirstNumber(item, ['price', 'value']), 4),
    changePct: round(pickFirstNumber(item, ['changePercent', 'changePct', 'zdf']), 4)
  };
};

const compressMarket = (marketIndices, missing) => {
  const market = {
    shanghai: null,
    hs300: null,
    cyb: null,
    csi500: null,
    hsi: null,
    hstech: null,
    nasdaq: null,
    nasdaq100: null
  };
  if (!isArray(marketIndices)) {
    missing.push('market');
    return market;
  }
  const byCodeOrName = (code, name) => marketIndices.find((item) => item?.code === code || item?.name === name);
  market.shanghai = normalizeMarketItem(byCodeOrName('sh000001', '上证指数'));
  market.hs300 = normalizeMarketItem(byCodeOrName('sh000300', '沪深300'));
  market.cyb = normalizeMarketItem(byCodeOrName('sz399006', '创业板指'));
  market.csi500 = normalizeMarketItem(byCodeOrName('sh000905', '中证500'));
  market.hsi = normalizeMarketItem(byCodeOrName('hkHSI', '恒生指数'));
  market.hstech = normalizeMarketItem(byCodeOrName('hkHSTECH', '恒生科技指数'));
  market.nasdaq = normalizeMarketItem(byCodeOrName('usIXIC', '纳斯达克'));
  market.nasdaq100 = normalizeMarketItem(byCodeOrName('usNDX', '纳斯达克100'));
  if (!Object.values(market).some(Boolean)) missing.push('market');
  return market;
};

export function compressFundPredictionInput(rawData = {}) {
  const missing = [];
  const warnings = [];
  try {
    const fundData = rawData.fundData || rawData.fund || {};
    const holdingsData = rawData.holdingsData || rawData.holdings || {};
    const holdingsRaw = isArray(holdingsData) ? holdingsData : holdingsData?.holdings;
    const holdings = isArray(holdingsRaw) ? holdingsRaw.slice(0, 10).map(normalizeHolding) : [];
    if (!holdings.length) missing.push('holdings');
    if (holdings.some((item) => isNil(item.weightPct))) warnings.push('部分重仓权重缺失');
    const periodReturns = rawData.periodReturns || {};
    const technical = computeTechnical(rawData.history, fundData, missing);
    const valuation = {
      gszzl: round(fundData.gszzl, 4),
      gsz: round(fundData.gsz, 4),
      gztime: fundData.gztime || null,
      dwjz: round(fundData.dwjz, 4),
      jzrq: fundData.jzrq || null,
      valuationSource: fundData.valuationSource || (fundData.noValuation ? 'fallback' : null)
    };
    if (isNil(valuation.gszzl)) missing.push('valuation.gszzl');
    return {
      fund: { code: String(fundData.code || rawData.code || '').trim(), name: getFundName(fundData, rawData) },
      valuation,
      periodReturns: {
        week: round(periodReturns.week, 4),
        month: round(periodReturns.month, 4),
        month3: round(periodReturns.month3, 4),
        month6: round(periodReturns.month6, 4),
        year1: round(periodReturns.year1, 4),
        consecutiveTrend: periodReturns.consecutiveTrend || null
      },
      technical,
      holdings,
      assetAllocation: normalizeAssetAllocation(holdingsData?.assetAllocation || rawData.assetAllocation),
      market: compressMarket(rawData.marketIndices || rawData.market, missing),
      dataQuality: {
        holdingsReportDate: holdingsData?.holdingsReportDate || fundData.holdingsReportDate || null,
        holdingsIsLastQuarter: Boolean(holdingsData?.holdingsIsLastQuarter || fundData.holdingsIsLastQuarter),
        missing: [...new Set(missing)],
        warnings
      },
      collectedAt: new Date().toISOString()
    };
  } catch (e) {
    return {
      fund: { code: String(rawData?.code || '').trim(), name: '' },
      valuation: { gszzl: null, gsz: null, gztime: null, dwjz: null, jzrq: null, valuationSource: null },
      periodReturns: { week: null, month: null, month3: null, month6: null, year1: null, consecutiveTrend: null },
      technical: {
        currentNav: null,
        ma5: null,
        ma20: null,
        distanceToMa5Pct: null,
        distanceToMa20Pct: null,
        volatility20d: null,
        support: null,
        resistance: null
      },
      holdings: [],
      assetAllocation: [],
      market: {
        shanghai: null,
        hs300: null,
        cyb: null,
        csi500: null,
        hsi: null,
        hstech: null,
        nasdaq: null,
        nasdaq100: null
      },
      dataQuality: {
        holdingsReportDate: null,
        holdingsIsLastQuarter: false,
        missing: ['compress_failed'],
        warnings: ['特征压缩失败，已返回空输入']
      },
      collectedAt: new Date().toISOString()
    };
  }
}
