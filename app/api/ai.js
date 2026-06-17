import dayjs from 'dayjs';
import { isArray, isPlainObject } from 'lodash';

const DASHSCOPE_API_KEY = '';
const DASHSCOPE_BASE_URL = '';
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_DASHSCOPE_MODEL || 'qwen-plus';

const numberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatPct = (value) => {
  const n = numberOrNull(value);
  if (n == null) return '暂无';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const formatAmount = (value) => {
  const n = numberOrNull(value);
  if (n == null) return '暂无';
  return `${n.toFixed(2)}元`;
};

function getHoldingAmount(fund, holding) {
  const share = numberOrNull(holding?.share) ?? 0;
  const nav = numberOrNull(fund?.gsz) ?? numberOrNull(fund?.dwjz) ?? numberOrNull(holding?.cost) ?? 0;
  return share * nav;
}

function getProfitAmount(fund, holding) {
  const share = numberOrNull(holding?.share) ?? 0;
  const cost = numberOrNull(holding?.cost) ?? 0;
  const nav = numberOrNull(fund?.gsz) ?? numberOrNull(fund?.dwjz) ?? cost;
  if (share <= 0 || cost <= 0 || nav <= 0) return 0;
  return (nav - cost) * share;
}

function getConcentrationLabel(topWeight, top3Weight) {
  if (topWeight >= 35 || top3Weight >= 70) return '偏集中';
  if (topWeight >= 25 || top3Weight >= 55) return '中等集中';
  return '较分散';
}

function getSectorBreadth(hotSectors) {
  const list = isArray(hotSectors) ? hotSectors : [];
  const sample = list.slice(0, 20);
  if (!sample.length) return { upCount: 0, downCount: 0, avgChange: null, strongest: [], weakest: [] };
  const changes = sample.map((s) => numberOrNull(s?.change_pct)).filter((v) => v != null);
  const avgChange = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  return {
    upCount: sample.filter((s) => (numberOrNull(s?.change_pct) ?? 0) > 0).length,
    downCount: sample.filter((s) => (numberOrNull(s?.change_pct) ?? 0) < 0).length,
    avgChange,
    strongest: sample.slice(0, 5).map((s) => ({
      name: s?.sector_name || s?.name || '未知板块',
      changePct: numberOrNull(s?.change_pct),
      netInflow: numberOrNull(s?.net_inflow)
    })),
    weakest: [...sample]
      .sort((a, b) => (numberOrNull(a?.change_pct) ?? 0) - (numberOrNull(b?.change_pct) ?? 0))
      .slice(0, 3)
      .map((s) => ({
        name: s?.sector_name || s?.name || '未知板块',
        changePct: numberOrNull(s?.change_pct),
        netInflow: numberOrNull(s?.net_inflow)
      }))
  };
}

export function buildPortfolioSnapshot({ funds = [], hotSectors = [], holdings = {}, maxPositionAmount = null }) {
  const allHoldingsKeys = Object.keys(holdings);
  // 从 holdings 出发：每一个有 share>0 的都必须包含在内
  // 如果 funds 里找不到，也根据 holdings 信息构造 row 确保不遗漏
  const holdingsWithShareGt0 = allHoldingsKeys.filter((k) => Number(holdings[k]?.share ?? 0) > 0);
  console.log('[AI分析] 持仓基金总数(share>0):', holdingsWithShareGt0.length);
  const rows = holdingsWithShareGt0
    .map((code) => {
      const fund = (isArray(funds) ? funds : []).find((f) => String(f.code).trim() === String(code).trim()) || { code };
      const holding = isPlainObject(holdings?.[code]) ? holdings[code] : {};
      const share = numberOrNull(holding?.share) ?? 0;
      const cost = numberOrNull(holding?.cost) ?? 0;
      const nav = numberOrNull(fund?.gsz) ?? numberOrNull(fund?.dwjz) ?? cost;
      const amount = getHoldingAmount(fund, holding);
      const profit = getProfitAmount(fund, holding);
      const profitRate = cost > 0 && nav > 0 ? ((nav - cost) / cost) * 100 : null;
      const dayChange = numberOrNull(fund?.gszzl) ?? numberOrNull(fund?.zzl);
      return {
        code,
        name: fund?.name || fund?.fundName || code,
        share,
        cost,
        nav,
        amount,
        profit,
        profitRate,
        dayChange,
        navDate: fund?.jzrq || '',
        estimateTime: fund?.gztime || '',
        dataSource: fund?.dataSource || '',
        isUpdated: !!fund?.isUpdated
      };
    })
    .filter((row) => row.code && row.share > 0);

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.share * row.cost, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);
  const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : null;
  const rowsWithWeight = rows
    .map((row) => ({ ...row, weight: totalAmount > 0 ? (row.amount / totalAmount) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const topWeight = rowsWithWeight[0]?.weight ?? 0;
  const top3Weight = rowsWithWeight.slice(0, 3).reduce((sum, row) => sum + row.weight, 0);
  const maxPosition = numberOrNull(maxPositionAmount);
  const availableAmount = maxPosition != null ? Math.max(0, maxPosition - totalAmount) : null;
  const positionUsage = maxPosition != null && maxPosition > 0 ? (totalAmount / maxPosition) * 100 : null;

  return {
    generatedAt: dayjs().format('YYYY-MM-DD HH:mm'),
    holdingCount: rowsWithWeight.length,
    totalAmount,
    totalCost,
    totalProfit,
    totalProfitRate,
    maxPositionAmount: maxPosition,
    availableAmount,
    positionUsage,
    topWeight,
    top3Weight,
    concentrationLabel: getConcentrationLabel(topWeight, top3Weight),
    positiveCount: rowsWithWeight.filter((row) => row.profit > 0).length,
    negativeCount: rowsWithWeight.filter((row) => row.profit < 0).length,
    risingCount: rowsWithWeight.filter((row) => (row.dayChange ?? 0) > 0).length,
    fallingCount: rowsWithWeight.filter((row) => (row.dayChange ?? 0) < 0).length,
    highWeightFunds: rowsWithWeight.filter((row) => row.weight >= 20).map((row) => row.code),
    rows: rowsWithWeight,
    sectorBreadth: getSectorBreadth(hotSectors)
  };
}

function buildSnapshotText(snapshot) {
  console.log(
    '[AI分析] snapshot.rows数:',
    snapshot.rows.length,
    '| 发送prompt长度约:',
    JSON.stringify(snapshot).length,
    '字符'
  );
  const rowsText = snapshot.rows
    .map((row) => {
      return `- ${row.name}（${row.code}）：权重${row.weight.toFixed(1)}%，金额${formatAmount(row.amount)}，成本${row.cost.toFixed(4)}，当前估值/净值${row.nav.toFixed(4)}，持仓收益${formatAmount(row.profit)}（${formatPct(row.profitRate)}），今日估算涨跌${formatPct(row.dayChange)}，净值日${row.navDate || '暂无'}，估值时间${row.estimateTime || '暂无'}`;
    })
    .join('\n');

  const strongest = snapshot.sectorBreadth.strongest
    .map(
      (s) =>
        `${s.name} ${formatPct(s.changePct)}，资金净流入${s.netInflow ? `${(s.netInflow / 100000000).toFixed(2)}亿` : '暂无'}`
    )
    .join('；');
  const weakest = snapshot.sectorBreadth.weakest.map((s) => `${s.name} ${formatPct(s.changePct)}`).join('；');

  return `快照时间：${snapshot.generatedAt}

组合指标：
- 持仓数量：${snapshot.holdingCount}只
- 当前持仓金额：${formatAmount(snapshot.totalAmount)}
- 持仓总成本：${formatAmount(snapshot.totalCost)}
- 总持仓收益：${formatAmount(snapshot.totalProfit)}（${formatPct(snapshot.totalProfitRate)}）
- 集中度：${snapshot.concentrationLabel}，单只最高权重${snapshot.topWeight.toFixed(1)}%，前三权重${snapshot.top3Weight.toFixed(1)}%
- 盈利/亏损基金数量：${snapshot.positiveCount}/${snapshot.negativeCount}
- 今日估算上涨/下跌基金数量：${snapshot.risingCount}/${snapshot.fallingCount}
${snapshot.maxPositionAmount != null ? `- 满仓限制：${formatAmount(snapshot.maxPositionAmount)}，已用仓位${formatPct(snapshot.positionUsage)}，可加仓${formatAmount(snapshot.availableAmount)}` : '- 未设置满仓限制'}

持仓明细：
${rowsText || '暂无持仓'}

热点宽度：
- 前20热门板块上涨/下跌数量：${snapshot.sectorBreadth.upCount}/${snapshot.sectorBreadth.downCount}
- 前20热门板块平均涨跌：${formatPct(snapshot.sectorBreadth.avgChange)}
- 强势板块：${strongest || '暂无'}
- 弱势板块：${weakest || '暂无'}`;
}

function extractJson(content) {
  const jsonMatch = String(content || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = jsonMatch ? jsonMatch[1] : String(content || '');
  try {
    return JSON.parse(raw.trim());
  } catch {
    const cleaned = raw
      .replace(/[\u0000-\u001F]+/g, '')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(cleaned.substring(startIdx, endIdx + 1));
    }
    throw new Error('AI返回格式解析失败');
  }
}

/**
 * 调用阿里云百炼大模型进行对话
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {Promise<string>}
 */
function getProxyUrl() {
  if (typeof window === 'undefined') return null;
  if (location.href.includes('39.106.185.205') || location.href.includes('jijiguowang')) return '/jijin/api/chat';
  return null;
}

export async function callDashscopeChat(messages, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;

  const isBrowser = typeof window !== 'undefined';
  const proxyUrl = getProxyUrl();
  if (!proxyUrl && !DASHSCOPE_API_KEY) {
    throw new Error('未配置后端 AI 代理，已停止在浏览器端直连 LLM');
  }

  try {
    const res = await fetch(proxyUrl || `${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(DASHSCOPE_API_KEY ? { Authorization: `Bearer ${DASHSCOPE_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        ...(isBrowser ? {} : {})
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Dashscope API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI 返回内容为空');
    }
    return content;
  } catch (e) {
    console.error('Dashscope chat error:', e);
    throw e;
  }
}

function buildPortfolioSystemPrompt() {
  return `你是一位严谨的基金组合分析师。你必须基于用户提供的组合快照、估值涨跌、持仓权重和热点板块数据进行分析。

重要约束：
- 不要编造未提供的数据，例如均线、MACD、KDJ、成交量、基金经理观点、PE/PB分位等；如果缺数据，明确写入 dataQuality 或 riskFlags。
- 预测只允许表达为概率和情景判断，不允许承诺收益。
- 加仓金额必须受满仓限制、可加仓额度和单只权重约束；没有满仓限制时，只能给比例或小额分批建议。
- 单只基金权重超过20%视为较高，超过30%视为集中风险。
- 组合持仓超过8只时，优先考虑精简重复风格；少于3只时，关注分散不足。
- fundAnalysis 必须包含快照中列出的每一只持仓基金，不得遗漏任何一只。
- 输出必须是严格 JSON，不要 Markdown，不要额外解释。

JSON Schema：
{
  "marketSummary": "市场整体判断，2-3句话",
  "portfolioDiagnosis": {
    "positionLevel": "低仓|中仓|高仓|接近满仓|未设置",
    "concentrationRisk": "集中度判断",
    "profitQuality": "收益结构判断",
    "dataQuality": "数据完整性与缺口"
  },
  "prediction": {
    "direction": "偏强|震荡|偏弱|不确定",
    "confidence": 0,
    "keyDrivers": ["驱动1", "驱动2"],
    "invalidIf": "什么情况下判断失效"
  },
  "fundAnalysis": [
    {
      "code": "基金代码",
      "name": "基金名称",
      "action": "加仓|减仓|持有|观望|转换",
      "amount": "金额或比例建议",
      "reason": "原因，必须引用权重、收益、今日涨跌、热点或仓位约束",
      "positionAdvice": "仓位建议",
      "confidence": 0,
      "urgency": "high|medium|low",
      "keyMetrics": ["关键指标"],
      "riskFlags": ["风险或缺失数据"]
    }
  ],
  "consolidationSuggestions": [
    { "action": "合并|转换|退出|保留", "from": "基金代码", "to": "目标基金代码或现金", "reason": "原因" }
  ],
  "newOpportunities": [
    { "sector": "板块名称", "fundSuggestion": "建议关注的基金类型", "reason": "原因", "riskLevel": "high|medium|low", "suggestedAmount": "建议金额或比例" }
  ],
  "nextActions": ["接下来可执行动作"],
  "riskWarning": "风险提示"
}`;
}

function sanitizeAdviceText(text) {
  return String(text || '')
    .replaceAll('必涨', '偏积极')
    .replaceAll('必跌', '偏谨慎')
    .replaceAll('稳赚', '风险收益不确定')
    .replaceAll('买入', '关注')
    .replaceAll('卖出', '调整')
    .replaceAll('满仓', '高仓位')
    .replaceAll('清仓', '降低仓位');
}

export function validatePortfolioAdvice(raw, snapshot) {
  if (!isPlainObject(raw) || !snapshot) return raw;
  const byCode = new Map((snapshot.rows || []).map((row) => [String(row.code), row]));
  const fundAnalysis = isArray(raw.fundAnalysis) ? raw.fundAnalysis : [];
  const used = new Set(fundAnalysis.map((item) => String(item?.code || '')));
  const missingRows = (snapshot.rows || []).filter((row) => !used.has(String(row.code)));
  const normalized = fundAnalysis.map((item) => {
    const code = String(item?.code || '');
    const row = byCode.get(code);
    let action = sanitizeAdviceText(item?.action || '观望');
    const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
    if (confidence < 0.45) action = '观望';
    if (snapshot.availableAmount == null && action.includes('加仓')) {
      item.amount = '未设置满仓限制，仅可作为比例/分批观察参考';
    }
    if (row?.weight >= 25 && action.includes('加仓')) action = '观望';
    return {
      ...item,
      action,
      amount: sanitizeAdviceText(item?.amount),
      reason: sanitizeAdviceText(item?.reason),
      positionAdvice: sanitizeAdviceText(item?.positionAdvice),
      confidence,
      riskFlags: [
        ...(isArray(item?.riskFlags) ? item.riskFlags.map(sanitizeAdviceText) : []),
        'AI建议仅作调仓辅助参考，不是自动交易指令'
      ]
    };
  });
  raw.fundAnalysis = [
    ...normalized,
    ...missingRows.map((row) => ({
      code: row.code,
      name: row.name,
      action: '观望',
      amount: '未覆盖持仓，需人工复核',
      reason: '本地校验发现 LLM 遗漏该持仓基金',
      positionAdvice: '保持观察',
      confidence: 0.2,
      urgency: 'low',
      keyMetrics: [`当前权重${row.weight.toFixed(1)}%`],
      riskFlags: ['LLM遗漏持仓，已由本地校验补齐']
    }))
  ];
  raw.riskWarning = sanitizeAdviceText(
    `${raw.riskWarning || ''} 本地已按仓位、集中度和置信度约束校验，所有建议均需人工确认。`
  );
  return raw;
}
/**
 * 持仓AI分析
 * @param {object} params
 * @param {Array} params.funds
 * @param {Array} params.hotSectors
 * @param {object} params.holdings
 * @param {string} params.currentDate
 * @param {number|null} params.maxPositionAmount
 * @returns {Promise<object>} AI分析结果（JSON对象）
 */
export async function analyzePortfolioWithAI({ funds, hotSectors, holdings, currentDate, maxPositionAmount }) {
  const snapshot = buildPortfolioSnapshot({ funds, hotSectors, holdings, maxPositionAmount });
  const now = currentDate || dayjs().format('YYYY-MM-DD HH:mm');

  const messages = [
    { role: 'system', content: buildPortfolioSystemPrompt() },
    {
      role: 'user',
      content: `当前时间：${now}

${buildSnapshotText(snapshot)}

请输出严格 JSON。`
    }
  ];

  const response = await callDashscopeChat(messages, {
    temperature: 0.2,
    maxTokens: 16384
  });

  try {
    return validatePortfolioAdvice(extractJson(response), snapshot);
  } catch (e) {
    console.error('JSON解析失败:', e);
    return {
      error: true,
      message: 'AI返回格式解析失败，请重试',
      rawResponse: response
    };
  }
}

/**
 * 基金智能问答
 * @param {string} question
 * @param {object} fund
 * @param {object} context
 * @returns {Promise<string>}
 */
export async function askFundAI(question, fund, context = {}) {
  const fundInfo = fund ? `基金名称：${fund.name || '未知'}，基金代码：${fund.code || '未知'}` : '未指定具体基金';
  const snapshot =
    context && (context.funds || context.holdings || context.hotSectors)
      ? buildPortfolioSnapshot({
          funds: context.funds || [],
          holdings: context.holdings || {},
          hotSectors: context.hotSectors || [],
          maxPositionAmount: context.maxPositionAmount
        })
      : null;
  const messages = [
    {
      role: 'system',
      content:
        '你是一位基金分析师。回答要简洁、可执行；必须区分事实、推断和风险；不要编造未提供的数据；结尾提醒投资建议仅供参考，不构成交易建议。'
    },
    {
      role: 'user',
      content: `用户问题：${question}

${fundInfo}

${snapshot ? `用户组合快照：\n${buildSnapshotText(snapshot)}` : '暂无用户组合快照'}

请给出专业回答。`
    }
  ];
  return callDashscopeChat(messages, { temperature: 0.5, maxTokens: 2048 });
}

/**
 * 市场热点解读
 * @param {Array} hotSectors
 * @returns {Promise<string>}
 */
export async function analyzeMarketHotspots(hotSectors) {
  const breadth = getSectorBreadth(hotSectors);
  const sectorsDesc = breadth.strongest
    .map((s) => {
      return `- ${s.name}：涨跌幅 ${formatPct(s.changePct)}，资金净流入 ${s.netInflow ? (s.netInflow / 100000000).toFixed(2) : '--'}亿`;
    })
    .join('\n');

  const messages = [
    {
      role: 'system',
      content:
        '你是一位市场分析师，擅长解读当日A股市场热点。请只基于提供的板块涨跌与资金流向分析，不要编造指数或个股数据。输出使用Markdown，控制在350字以内，包含“热点”“风险”“应对”三段。'
    },
    {
      role: 'user',
      content: `市场宽度：前20热门板块上涨/下跌 ${breadth.upCount}/${breadth.downCount}，平均涨跌 ${formatPct(breadth.avgChange)}

强势板块：
${sectorsDesc || '暂无数据'}

请解读今日市场热点。`
    }
  ];
  return callDashscopeChat(messages, { temperature: 0.45, maxTokens: 1200 });
}

function buildDeterministicHealth(snapshot) {
  let score = 80;
  if (snapshot.holdingCount === 0) score -= 50;
  if (snapshot.holdingCount > 10) score -= 10;
  if (snapshot.holdingCount < 3 && snapshot.holdingCount > 0) score -= 8;
  if (snapshot.topWeight >= 35) score -= 18;
  else if (snapshot.topWeight >= 25) score -= 10;
  if (snapshot.top3Weight >= 70) score -= 12;
  else if (snapshot.top3Weight >= 55) score -= 6;
  if (snapshot.totalProfitRate != null && snapshot.totalProfitRate < -10) score -= 10;
  if (snapshot.totalProfitRate != null && snapshot.totalProfitRate > 10) score += 4;
  if (snapshot.positionUsage != null && snapshot.positionUsage > 95) score -= 8;
  if (snapshot.negativeCount > snapshot.positiveCount) score -= 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 持仓健康度评分
 * @param {object} params
 * @returns {Promise<{score: number, comment: string, suggestions: string[], dimensions?: object}>}
 */
export async function evaluatePortfolioHealth({ funds, holdings, hotSectors, maxPositionAmount }) {
  const snapshot = buildPortfolioSnapshot({ funds, holdings, hotSectors, maxPositionAmount });
  const baselineScore = buildDeterministicHealth(snapshot);

  const messages = [
    {
      role: 'system',
      content: `你是一位投资组合健康度评估专家。请结合确定性基准分和组合快照，从集中度、仓位、收益结构、数据质量四个维度评分。

输出必须是严格JSON：
{
  "score": 0,
  "comment": "一句总评",
  "dimensions": {
    "diversification": "分散度评价",
    "position": "仓位评价",
    "profit": "收益结构评价",
    "dataQuality": "数据质量评价"
  },
  "suggestions": ["建议1", "建议2", "建议3"]
}
不要输出任何其他内容。`
    },
    {
      role: 'user',
      content: `确定性基准分：${baselineScore}

${buildSnapshotText(snapshot)}

请评估我的持仓健康度，只返回JSON。`
    }
  ];

  const content = await callDashscopeChat(messages, { temperature: 0.2, maxTokens: 1400 });
  try {
    const parsed = extractJson(content);
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || baselineScore)),
      comment: String(parsed.comment || ''),
      dimensions: isPlainObject(parsed.dimensions) ? parsed.dimensions : {},
      suggestions: isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  } catch (e) {
    return {
      score: baselineScore,
      comment: 'AI评估返回格式异常，已使用本地组合规则生成基准评分。',
      dimensions: {
        diversification: `单只最高权重${snapshot.topWeight.toFixed(1)}%，前三权重${snapshot.top3Weight.toFixed(1)}%`,
        position: snapshot.positionUsage != null ? `已用仓位${snapshot.positionUsage.toFixed(1)}%` : '未设置满仓限制',
        profit: `总收益${formatAmount(snapshot.totalProfit)}（${formatPct(snapshot.totalProfitRate)}）`,
        dataQuality: '缺少更完整的历史净值、行业暴露和风险波动数据'
      },
      suggestions: [
        '控制单只基金权重，避免组合过度集中',
        '结合满仓限制分批操作，避免一次性追涨',
        '定期检查亏损基金的风格和持仓逻辑'
      ]
    };
  }
}
