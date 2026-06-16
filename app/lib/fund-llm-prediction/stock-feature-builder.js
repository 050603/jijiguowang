import { isArray, isNil, isString } from 'lodash';

import { round } from './fallback-prediction';

const toNumber = (value) => {
  if (isNil(value) || value === '') return null;
  const n = Number(isString(value) ? value.replace(/%/g, '').replace(/,/g, '').trim() : value);
  return Number.isFinite(n) ? n : null;
};

export function identifyStockMarket(code) {
  const c = code != null ? String(code).trim().toUpperCase() : '';
  if (/^(600|601|603|605)\d{3}$/.test(c)) return { market: 'A股-上交所主板', exchange: 'SH', board: 'main' };
  if (/^688\d{3}$/.test(c)) return { market: 'A股-科创板', exchange: 'SH', board: 'star' };
  if (/^(000|001|002|003)\d{3}$/.test(c)) return { market: 'A股-深交所主板/中小板', exchange: 'SZ', board: 'main' };
  if (/^(300|301)\d{3}$/.test(c)) return { market: 'A股-创业板', exchange: 'SZ', board: 'chinext' };
  if (/^\d{5}$/.test(c)) return { market: 'unknown', exchange: 'HK', board: 'unknown' };
  if (/^[A-Z.]{1,8}$/.test(c)) return { market: 'unknown', exchange: 'US', board: 'unknown' };
  return { market: 'unknown', exchange: 'unknown', board: 'unknown' };
}

export async function fetchStockTrendFeatures() {
  return {
    ma5: null,
    ma20: null,
    distanceToMa5Pct: null,
    distanceToMa20Pct: null,
    momentum5d: null,
    momentum20d: null,
    volatility20d: null,
    support: null,
    resistance: null,
    dataQuality: { missing: ['stock.priceTrend'], warnings: ['暂未接入个股历史行情接口'] }
  };
}

const pickSectorForStock = (holding, hotSectors) => {
  const name = holding?.name ? String(holding.name) : '';
  const list = isArray(hotSectors) ? hotSectors : [];
  const matched = list.find((s) => {
    const sectorName = String(s?.sector_name || s?.name || '');
    return sectorName && name && (name.includes(sectorName) || sectorName.includes(name));
  });
  return matched || null;
};

export function buildStockFeatures(holdings = [], context = {}) {
  const hotSectors = context.hotSectors || [];
  return (isArray(holdings) ? holdings : []).map((holding) => {
    const missing = [];
    const warnings = [];
    const marketInfo = identifyStockMarket(holding?.code);
    const sector = pickSectorForStock(holding, hotSectors);
    if (!sector) missing.push('sector');
    missing.push('mainFundFlow', 'stock.priceTrend');
    const sectorChangePct = sector ? toNumber(sector.change_pct ?? sector.changePct) : null;
    const sectorNetInflow = sector ? toNumber(sector.net_inflow ?? sector.netInflow) : null;
    if (isNil(sectorNetInflow)) missing.push('sectorNetInflow');
    return {
      code: holding?.code || '',
      name: holding?.name || '',
      market: marketInfo.market,
      exchange: marketInfo.exchange,
      board: marketInfo.board,
      weightPct: round(holding?.weightPct, 4),
      todayChangePct: isNil(holding?.changePct) ? null : round(holding.changePct, 4),
      sectorName: sector?.sector_name || sector?.name || null,
      sectorChangePct: isNil(sectorChangePct) ? null : round(sectorChangePct, 4),
      sectorNetInflow: isNil(sectorNetInflow) ? null : round(sectorNetInflow, 2),
      relatedSectorStrength: isNil(sectorChangePct) ? null : round(sectorChangePct, 4),
      mainFundFlow: null,
      priceTrend: {
        ma5: null,
        ma20: null,
        distanceToMa5Pct: null,
        distanceToMa20Pct: null,
        momentum5d: null,
        momentum20d: null,
        volatility20d: null,
        support: null,
        resistance: null
      },
      dataQuality: { missing: [...new Set(missing)], warnings }
    };
  });
}
