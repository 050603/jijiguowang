'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  Gauge,
  HeartPulse,
  Loader2,
  MessageCircle,
  PieChart,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useStorageStore, useUserStore, storageStore } from '../stores';
import {
  analyzePortfolioWithAI,
  analyzeMarketHotspots,
  evaluatePortfolioHealth,
  askFundAI,
  buildPortfolioSnapshot
} from '../api/ai';
import { fetchHotSectorsFromEastmoney } from '../api/fund';
import SimpleMarkdown from './SimpleMarkdown';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'portfolio', label: '持仓分析', Icon: Sparkles, desc: '给出组合诊断、预测情景和基金操作建议' },
  { id: 'market', label: '热点解读', Icon: TrendingUp, desc: '解读板块强弱、资金方向和短线风险' },
  { id: 'health', label: '健康评分', Icon: HeartPulse, desc: '评估集中度、仓位、收益结构和数据质量' },
  { id: 'chat', label: '智能问答', Icon: MessageCircle, desc: '结合当前组合上下文回答基金问题' }
];

const STORAGE_KEY = 'aiAnalysisResults';

function loadPersistedResults() {
  if (typeof window === 'undefined') return null;
  const parsed = storageStore.getItem(STORAGE_KEY, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function savePersistedResults(data) {
  if (typeof window === 'undefined') return;
  try {
    storageStore.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `今天 ${timeStr}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function scoreColor(score) {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--danger)';
}

function getAdviceBadge(advice) {
  const a = String(advice || '').toLowerCase();
  if (a.includes('加仓')) return { text: '加仓', tone: 'buy' };
  if (a.includes('减仓')) return { text: '减仓', tone: 'sell' };
  if (a.includes('转换')) return { text: '转换', tone: 'switch' };
  if (a.includes('观望')) return { text: '观望', tone: 'watch' };
  if (a.includes('持有')) return { text: '持有', tone: 'hold' };
  return { text: advice || '待判断', tone: 'neutral' };
}

function parseStructuredPortfolio(data) {
  if (!data || data.error) return null;
  return {
    marketSummary: data.marketSummary || '',
    diagnosis: data.portfolioDiagnosis || data.marketTechAnalysis || null,
    prediction: data.prediction || null,
    funds: (data.fundAnalysis || []).map((f) => ({
      name: f.name || '',
      code: f.code || '',
      advice: f.action || '',
      amount: f.amount || '',
      reason: f.reason || '',
      position: f.positionAdvice || '',
      confidence: f.confidence,
      keyMetrics: Array.isArray(f.keyMetrics) ? f.keyMetrics : [],
      riskFlags: Array.isArray(f.riskFlags) ? f.riskFlags : [],
      urgency: f.urgency || 'medium'
    })),
    consolidationSuggestions: data.consolidationSuggestions || [],
    newOpportunities: data.newOpportunities || [],
    nextActions: data.nextActions || [],
    riskWarning: data.riskWarning || ''
  };
}

function MetricCard({ Icon, label, value, sub, tone }) {
  return (
    <div className={cn('ai-metric-card glass', tone && `is-${tone}`)}>
      <div className="ai-metric-icon">
        <Icon width={18} height={18} />
      </div>
      <div className="ai-metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

function ResultTime({ label, time }) {
  if (!time) return null;
  return (
    <div className="ai-result-time">
      <Clock width={13} height={13} />
      <span>
        {label}：{formatTime(time)}
      </span>
    </div>
  );
}

function EmptyPrompt({ Icon, title, desc }) {
  return (
    <div className="ai-empty glass">
      <Icon width={36} height={36} />
      <p>{title}</p>
      {desc ? <span>{desc}</span> : null}
    </div>
  );
}

function LoadingBlock({ title, desc }) {
  return (
    <div className="ai-loading glass">
      <Loader2 width={30} height={30} className="spin" />
      <p>{title}</p>
      {desc ? <span>{desc}</span> : null}
    </div>
  );
}

export default function AIAnalysisTab({ funds, holdings, isActive }) {
  const user = useUserStore((s) => s.user);
  const customSettings = useStorageStore((s) => s.customSettings);
  const setCustomSettings = useStorageStore((s) => s.setCustomSettings);

  const [activeTab, setActiveTab] = useState('portfolio');
  const [loadingMap, setLoadingMap] = useState({});
  const [portfolioResult, setPortfolioResult] = useState('');
  const [portfolioTime, setPortfolioTime] = useState(null);
  const [marketResult, setMarketResult] = useState('');
  const [marketTime, setMarketTime] = useState(null);
  const [healthResult, setHealthResult] = useState(null);
  const [healthTime, setHealthTime] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [maxPositionInput, setMaxPositionInput] = useState('');
  const chatScrollRef = useRef(null);

  useEffect(() => {
    const persisted = loadPersistedResults();
    if (persisted) {
      if (persisted.portfolio?.result) setPortfolioResult(persisted.portfolio.result);
      if (persisted.portfolio?.time) setPortfolioTime(persisted.portfolio.time);
      if (persisted.market?.result) setMarketResult(persisted.market.result);
      if (persisted.market?.time) setMarketTime(persisted.market.time);
      if (persisted.health?.result) setHealthResult(persisted.health.result);
      if (persisted.health?.time) setHealthTime(persisted.health.time);
      if (Array.isArray(persisted.chatMessages)) setChatMessages(persisted.chatMessages);
    }
  }, []);

  useEffect(() => {
    savePersistedResults({
      portfolio: { result: portfolioResult, time: portfolioTime },
      market: { result: marketResult, time: marketTime },
      health: { result: healthResult, time: healthTime },
      chatMessages
    });
  }, [portfolioResult, portfolioTime, marketResult, marketTime, healthResult, healthTime, chatMessages]);

  useEffect(() => {
    const value = customSettings?.aiMaxPositionAmount;
    if (value == null || value === '') {
      setMaxPositionInput('');
      return;
    }
    const n = Number(value);
    setMaxPositionInput(Number.isFinite(n) && n > 0 ? String(n) : '');
  }, [customSettings?.aiMaxPositionAmount]);

  const { data: hotSectorsData } = useQuery({
    queryKey: ['hotSectors'],
    queryFn: fetchHotSectorsFromEastmoney,
    staleTime: 120000,
    enabled: !!isActive
  });
  const hotSectors = useMemo(() => hotSectorsData || [], [hotSectorsData]);

  const holdingFunds = useMemo(
    () =>
      (funds || []).filter((f) => {
        const h = holdings?.[f.code];
        const share = Number(h?.share ?? 0);
        return share > 0;
      }),
    [funds, holdings]
  );

  const maxPositionAmount = useMemo(() => {
    const n = Number(maxPositionInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [maxPositionInput]);

  const snapshot = useMemo(
    () => buildPortfolioSnapshot({ funds: holdingFunds, hotSectors, holdings, maxPositionAmount }),
    [holdingFunds, hotSectors, holdings, maxPositionAmount]
  );

  const setLoading = useCallback((key, val) => {
    setLoadingMap((prev) => ({ ...prev, [key]: val }));
  }, []);
  const isLoading = (key) => !!loadingMap[key];

  const handleSetMaxPosition = (value) => {
    setMaxPositionInput(value);
    const n = Number(value);
    const nextValue = Number.isFinite(n) && n > 0 ? n : null;
    const current = useStorageStore.getState().customSettings || {};
    setCustomSettings({ ...current, aiMaxPositionAmount: nextValue });
  };

  const handlePortfolioAnalysis = async () => {
    if (!user?.id || holdingFunds.length === 0) return;
    setLoading('portfolio', true);
    try {
      const result = await analyzePortfolioWithAI({
        funds: holdingFunds,
        hotSectors,
        holdings,
        maxPositionAmount
      });
      setPortfolioResult(result);
      setPortfolioTime(Date.now());
    } catch (e) {
      setPortfolioResult({ error: true, message: 'AI分析出错：' + (e.message || '网络异常，请稍后重试') });
      setPortfolioTime(Date.now());
    } finally {
      setLoading('portfolio', false);
    }
  };

  const handleMarketAnalysis = async () => {
    setLoading('market', true);
    try {
      const text = await analyzeMarketHotspots(hotSectors);
      setMarketResult(text);
      setMarketTime(Date.now());
    } catch (e) {
      setMarketResult('市场热点解读出错：' + (e.message || '网络异常，请稍后重试'));
      setMarketTime(Date.now());
    } finally {
      setLoading('market', false);
    }
  };

  const handleHealthAnalysis = async () => {
    if (!user?.id || holdingFunds.length === 0) return;
    setLoading('health', true);
    try {
      const res = await evaluatePortfolioHealth({
        funds: holdingFunds,
        holdings,
        hotSectors,
        maxPositionAmount
      });
      setHealthResult(res);
      setHealthTime(Date.now());
    } catch (e) {
      setHealthResult({
        score: 0,
        comment: '评估出错：' + (e.message || '网络异常，请稍后重试'),
        suggestions: ['请检查网络连接后重试']
      });
      setHealthTime(Date.now());
    } finally {
      setLoading('health', false);
    }
  };

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    if (!user?.id) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '请先登录后再使用AI问答功能。' }
      ]);
      setChatInput('');
      return;
    }
    const newMessages = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await askFundAI(text, null, {
        funds: holdingFunds,
        holdings,
        hotSectors,
        maxPositionAmount
      });
      setChatMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'AI回答出错：' + (e.message || '请稍后重试') }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const parsedPortfolio = activeTab === 'portfolio' ? parseStructuredPortfolio(portfolioResult) : null;
  const activeMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0];

  return (
    <div className="ai-page">
      <section className="ai-hero glass">
        <div className="ai-hero-main">
          <div className="ai-hero-icon">
            <Bot width={22} height={22} />
          </div>
          <div>
            <h2>AI 智能投资助手</h2>
            <p>基于持仓、仓位约束和实时热点生成结构化分析。结果仅供参考，不构成投资建议。</p>
          </div>
        </div>
        {!user?.id && (
          <div className="ai-login-tip">
            <AlertCircle width={16} height={16} />
            <span>登录后可使用持仓分析、健康评分和组合问答。</span>
          </div>
        )}
      </section>

      <section className="ai-metric-grid">
        <MetricCard
          Icon={PieChart}
          label="持仓金额"
          value={`¥${formatCurrency(snapshot.totalAmount)}`}
          sub={`${snapshot.holdingCount} 只持仓基金`}
        />
        <MetricCard
          Icon={TrendingUp}
          label="持仓收益"
          value={`¥${formatCurrency(snapshot.totalProfit)}`}
          sub={formatPct(snapshot.totalProfitRate)}
          tone={snapshot.totalProfit > 0 ? 'up' : snapshot.totalProfit < 0 ? 'down' : undefined}
        />
        <MetricCard
          Icon={ShieldCheck}
          label="集中度"
          value={snapshot.concentrationLabel}
          sub={`最高 ${snapshot.topWeight.toFixed(1)}%，前三 ${snapshot.top3Weight.toFixed(1)}%`}
        />
        <MetricCard
          Icon={Gauge}
          label="今日估算"
          value={`${snapshot.risingCount}/${snapshot.fallingCount}`}
          sub="上涨/下跌持仓数"
        />
      </section>

      <section className="ai-workspace">
        <div className="ai-tab-rail glass">
          {TABS.map(({ id, label, Icon, desc }) => (
            <button
              key={id}
              type="button"
              className={cn('ai-tab-button', activeTab === id && 'is-active')}
              onClick={() => setActiveTab(id)}
            >
              <Icon width={18} height={18} />
              <span>{label}</span>
              <small>{desc}</small>
            </button>
          ))}
        </div>

        <div className="ai-main-panel">
          <div className="ai-panel-heading">
            <div>
              <h3>{activeMeta.label}</h3>
              <p>{activeMeta.desc}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'portfolio' && (
              <motion.div
                key="portfolio"
                className="ai-panel-stack"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="ai-control-card glass">
                  <div>
                    <strong>仓位约束</strong>
                    <span>设置满仓金额后，AI 会按剩余额度和单只权重给出更保守的操作金额。</span>
                  </div>
                  <label className="ai-position-input">
                    <input
                      type="number"
                      value={maxPositionInput}
                      onChange={(e) => handleSetMaxPosition(e.target.value)}
                      placeholder="例如 50000"
                    />
                    <span>元</span>
                  </label>
                  {maxPositionInput && (
                    <button type="button" className="ai-text-button" onClick={() => handleSetMaxPosition('')}>
                      清除
                    </button>
                  )}
                </div>

                <div className="ai-action-card glass">
                  <div>
                    <strong>组合调整建议</strong>
                    <span>
                      {holdingFunds.length > 0
                        ? `将分析 ${holdingFunds.length} 只持仓基金、仓位权重和热点板块。`
                        : '暂无持仓数据，请先设置持仓。'}
                    </span>
                  </div>
                  <button
                    className="button ai-primary-action"
                    onClick={handlePortfolioAnalysis}
                    disabled={isLoading('portfolio') || !user?.id || holdingFunds.length === 0}
                  >
                    {isLoading('portfolio') ? (
                      <Loader2 width={15} height={15} className="spin" />
                    ) : (
                      <RefreshCw width={15} height={15} />
                    )}
                    {portfolioResult ? '重新分析' : '开始分析'}
                  </button>
                </div>

                <ResultTime label="分析时间" time={portfolioTime} />

                {isLoading('portfolio') && (
                  <LoadingBlock title="AI 正在分析组合" desc="正在结合仓位、权重、收益结构和热点宽度生成建议。" />
                )}

                {portfolioResult?.error && !isLoading('portfolio') && (
                  <div className="ai-error glass">{portfolioResult.message || '分析失败'}</div>
                )}

                {parsedPortfolio && !isLoading('portfolio') && (
                  <div className="ai-result-stack">
                    {parsedPortfolio.marketSummary && (
                      <div className="ai-section-card glass">
                        <span className="ai-section-kicker">市场判断</span>
                        <p>{parsedPortfolio.marketSummary}</p>
                      </div>
                    )}

                    {(parsedPortfolio.diagnosis || parsedPortfolio.prediction) && (
                      <div className="ai-diagnosis-grid">
                        {parsedPortfolio.diagnosis && (
                          <div className="ai-section-card glass">
                            <span className="ai-section-kicker">组合诊断</span>
                            <dl className="ai-kv-list">
                              {Object.entries(parsedPortfolio.diagnosis).map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>{String(value || '--')}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        )}
                        {parsedPortfolio.prediction && (
                          <div className="ai-section-card glass">
                            <span className="ai-section-kicker">预测情景</span>
                            <div className="ai-prediction-head">
                              <strong>{parsedPortfolio.prediction.direction || '不确定'}</strong>
                              {parsedPortfolio.prediction.confidence != null && (
                                <span>置信度 {parsedPortfolio.prediction.confidence}%</span>
                              )}
                            </div>
                            <ul className="ai-clean-list">
                              {(parsedPortfolio.prediction.keyDrivers || []).map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                            {parsedPortfolio.prediction.invalidIf && (
                              <p className="ai-muted-line">失效条件：{parsedPortfolio.prediction.invalidIf}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {parsedPortfolio.funds.length > 0 && (
                      <div className="ai-fund-grid">
                        {parsedPortfolio.funds.map((fund, idx) => {
                          const badge = getAdviceBadge(fund.advice);
                          return (
                            <motion.div
                              key={`${fund.code}-${idx}`}
                              className="ai-fund-card glass"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.04 }}
                            >
                              <div className="ai-fund-card-head">
                                <div>
                                  <strong>{fund.name || fund.code}</strong>
                                  <span>{fund.code}</span>
                                </div>
                                <div className="ai-fund-action">
                                  <span className={cn('ai-advice-badge', `is-${badge.tone}`)}>{badge.text}</span>
                                  {fund.confidence != null && <small>{fund.confidence}%</small>}
                                </div>
                              </div>
                              {fund.amount && <div className="ai-amount-line">{fund.amount}</div>}
                              {fund.reason && <p>{fund.reason}</p>}
                              {fund.position && <span className="ai-muted-line">{fund.position}</span>}
                              {fund.keyMetrics.length > 0 && (
                                <div className="ai-chip-row">
                                  {fund.keyMetrics.slice(0, 4).map((item, i) => (
                                    <span key={i}>{item}</span>
                                  ))}
                                </div>
                              )}
                              {fund.riskFlags.length > 0 && (
                                <div className="ai-risk-row">
                                  {fund.riskFlags.slice(0, 3).map((item, i) => (
                                    <span key={i}>{item}</span>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {parsedPortfolio.nextActions.length > 0 && (
                      <div className="ai-section-card glass">
                        <span className="ai-section-kicker">下一步动作</span>
                        <ul className="ai-clean-list">
                          {parsedPortfolio.nextActions.map((item, idx) => (
                            <li key={idx}>
                              <CheckCircle2 width={14} height={14} />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {parsedPortfolio.consolidationSuggestions.length > 0 && (
                      <div className="ai-section-card glass">
                        <span className="ai-section-kicker">精简与转换</span>
                        <div className="ai-mini-list">
                          {parsedPortfolio.consolidationSuggestions.map((s, idx) => (
                            <div key={idx}>
                              <strong>
                                {s.from} → {s.to}
                              </strong>
                              <span>{s.reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsedPortfolio.newOpportunities.length > 0 && (
                      <div className="ai-section-card glass">
                        <span className="ai-section-kicker">可关注方向</span>
                        <div className="ai-mini-list">
                          {parsedPortfolio.newOpportunities.map((opp, idx) => (
                            <div key={idx}>
                              <strong>{opp.sector}</strong>
                              <span>
                                {opp.reason}
                                {opp.suggestedAmount ? `，建议：${opp.suggestedAmount}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsedPortfolio.riskWarning && (
                      <div className="ai-warning glass">{parsedPortfolio.riskWarning}</div>
                    )}
                  </div>
                )}

                {!portfolioResult && !isLoading('portfolio') && (
                  <EmptyPrompt
                    Icon={Target}
                    title="点击开始分析，生成今日组合调整建议"
                    desc="建议先设置满仓金额，模型会更准确地控制加仓额度和集中度。"
                  />
                )}
              </motion.div>
            )}

            {activeTab === 'market' && (
              <motion.div
                key="market"
                className="ai-panel-stack"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="ai-action-card glass">
                  <div>
                    <strong>市场热点解读</strong>
                    <span>基于热门板块涨跌、资金流向和市场宽度生成简报。</span>
                  </div>
                  <button
                    className="button ai-primary-action"
                    onClick={handleMarketAnalysis}
                    disabled={isLoading('market')}
                  >
                    {isLoading('market') ? (
                      <Loader2 width={15} height={15} className="spin" />
                    ) : (
                      <RefreshCw width={15} height={15} />
                    )}
                    {marketResult ? '重新解读' : '获取解读'}
                  </button>
                </div>

                {hotSectors.length > 0 && (
                  <div className="ai-hot-sector-row">
                    {hotSectors.slice(0, 8).map((item, idx) => (
                      <span key={`${item.sector_name || item.name}-${idx}`}>
                        {item.sector_name || item.name}
                        {item.change_pct != null ? ` ${formatPct(item.change_pct)}` : ''}
                      </span>
                    ))}
                  </div>
                )}

                <ResultTime label="解读时间" time={marketTime} />
                {isLoading('market') && (
                  <LoadingBlock title="AI 正在解读热点" desc="正在整理强势板块、资金流向和短线风险。" />
                )}
                {marketResult && !isLoading('market') && (
                  <div className="ai-markdown-card glass">
                    <SimpleMarkdown text={marketResult} />
                  </div>
                )}
                {!marketResult && !isLoading('market') && (
                  <EmptyPrompt Icon={TrendingUp} title="点击获取解读，查看今日市场热点分析" />
                )}
              </motion.div>
            )}

            {activeTab === 'health' && (
              <motion.div
                key="health"
                className="ai-panel-stack"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="ai-action-card glass">
                  <div>
                    <strong>持仓健康度评估</strong>
                    <span>先用本地规则生成基准分，再由 AI 解释分散度、仓位和数据质量。</span>
                  </div>
                  <button
                    className="button ai-primary-action"
                    onClick={handleHealthAnalysis}
                    disabled={isLoading('health') || !user?.id || holdingFunds.length === 0}
                  >
                    {isLoading('health') ? (
                      <Loader2 width={15} height={15} className="spin" />
                    ) : (
                      <RefreshCw width={15} height={15} />
                    )}
                    {healthResult ? '重新评估' : '开始评估'}
                  </button>
                </div>

                <ResultTime label="评估时间" time={healthTime} />
                {isLoading('health') && (
                  <LoadingBlock title="AI 正在评估持仓健康度" desc="正在检查集中度、仓位、收益结构和数据质量。" />
                )}
                {healthResult && !isLoading('health') && (
                  <div className="ai-health-grid">
                    <div className="ai-health-score glass">
                      <div className="ai-score-ring" style={{ '--score-color': scoreColor(healthResult.score) }}>
                        {healthResult.score}
                      </div>
                      <strong>持仓健康度评分</strong>
                      <p>{healthResult.comment}</p>
                    </div>
                    <div className="ai-section-card glass">
                      <span className="ai-section-kicker">维度解释</span>
                      <dl className="ai-kv-list">
                        {Object.entries(healthResult.dimensions || {}).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{String(value || '--')}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    {healthResult.suggestions?.length > 0 && (
                      <div className="ai-section-card glass ai-health-suggestions">
                        <span className="ai-section-kicker">优化建议</span>
                        <ul className="ai-clean-list">
                          {healthResult.suggestions.map((s, i) => (
                            <li key={i}>
                              <CheckCircle2 width={14} height={14} />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {!healthResult && !isLoading('health') && (
                  <EmptyPrompt Icon={HeartPulse} title="点击开始评估，获取持仓健康度评分" />
                )}
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                className="ai-chat-card glass"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div ref={chatScrollRef} className="ai-chat-messages">
                  {chatMessages.length === 0 && (
                    <div className="ai-chat-empty">
                      <MessageCircle width={36} height={36} />
                      <p>向 AI 提问任何关于基金投资的问题</p>
                      <span>例如：我的组合是否过度集中？现在适合继续定投吗？</span>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn('ai-chat-bubble', msg.role === 'user' ? 'is-user' : 'is-assistant')}>
                      {msg.role === 'assistant' ? <SimpleMarkdown text={msg.content} /> : msg.content}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="ai-chat-bubble is-assistant is-loading">
                      <Loader2 width={14} height={14} className="spin" />
                      <span>AI 思考中...</span>
                    </div>
                  )}
                </div>

                <div className="ai-chat-input">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    placeholder={user?.id ? '输入您的问题...' : '请先登录后再提问'}
                    disabled={!user?.id || chatLoading}
                  />
                  <button
                    className="button"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || chatLoading || !user?.id}
                  >
                    <Send width={15} height={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
