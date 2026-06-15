'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, HeartPulse, MessageCircle, X, Bot, Send, Loader2 } from 'lucide-react';
import { analyzePortfolioWithAI, analyzeMarketHotspots, evaluatePortfolioHealth, askFundAI } from '../api/ai';
import { fetchHotSectorsFromEastmoney } from '../api/fund';
import SimpleMarkdown from './SimpleMarkdown';
import { useQuery } from '@tanstack/react-query';

const TABS = [
  { id: 'portfolio', label: '持仓分析', Icon: Sparkles },
  { id: 'market', label: '热点解读', Icon: TrendingUp },
  { id: 'health', label: '健康评分', Icon: HeartPulse },
  { id: 'chat', label: '智能问答', Icon: MessageCircle }
];

export default function AIAnalysisModal({ onClose, funds, holdings, user }) {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [healthResult, setHealthResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef(null);

  // 获取热门板块数据
  const { data: hotSectorsData } = useQuery({
    queryKey: ['hotSectors'],
    queryFn: fetchHotSectorsFromEastmoney,
    staleTime: 120000
  });
  const hotSectors = hotSectorsData || [];

  // 持仓分析不再限制时间，随时可用
  const canAnalyzePortfolio = true;

  // 切换tab时不自动触发分析，需要用户手动点击确认
  // （移除自动触发逻辑）

  // 计算当前持仓基金（用于界面展示和数据校验）
  const holdingFunds = (funds || []).filter((f) => {
    const h = holdings?.[f.code];
    const share = Number(h?.share ?? 0);
    return share > 0;
  });

  const handlePortfolioAnalysis = async () => {
    if (!user?.id) {
      setResult('请先登录后再使用AI分析功能。');
      return;
    }
    if (!canAnalyzePortfolio) {
      setResult('持仓AI分析功能在交易日14:30后开放，请耐心等待。');
      return;
    }
    if (holdingFunds.length === 0) {
      setResult('未检测到持仓数据。请先在基金列表中设置持仓信息（份额和成本），再使用AI分析功能。');
      return;
    }
    setLoading(true);
    setResult('');
    try {
      const text = await analyzePortfolioWithAI({
        funds: holdingFunds,
        hotSectors: hotSectors || [],
        holdings
      });
      setResult(text);
    } catch (e) {
      setResult('AI分析出错：' + (e.message || '网络异常，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  const handleMarketAnalysis = async () => {
    setLoading(true);
    setResult('');
    try {
      const text = await analyzeMarketHotspots(hotSectors || []);
      setResult(text);
    } catch (e) {
      setResult('市场热点解读出错：' + (e.message || '网络异常，请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  const handleHealthAnalysis = async () => {
    if (!user?.id) {
      setHealthResult({ score: 0, comment: '请先登录后再使用AI分析功能。', suggestions: [] });
      return;
    }
    if (holdingFunds.length === 0) {
      setHealthResult({
        score: 0,
        comment: '未检测到持仓数据。请先在基金列表中设置持仓信息（份额和成本），再使用AI评估功能。',
        suggestions: []
      });
      return;
    }
    setLoading(true);
    setHealthResult(null);
    try {
      const res = await evaluatePortfolioHealth({
        funds: holdingFunds,
        holdings,
        hotSectors: hotSectors || []
      });
      setHealthResult(res);
    } catch (e) {
      setHealthResult({
        score: 0,
        comment: '评估出错：' + (e.message || '网络异常，请稍后重试'),
        suggestions: ['请检查网络连接后重试']
      });
    } finally {
      setLoading(false);
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
      const reply = await askFundAI(text);
      setChatMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setChatMessages([...newMessages, { role: 'assistant', content: 'AI回答出错：' + (e.message || '请稍后重试') }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const scoreColor = (score) => {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="AI智能分析"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="title" style={{ marginBottom: 16, justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot width="22" height="22" style={{ color: 'var(--primary)' }} />
            <span>AI 智能分析</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <X width="20" height="20" />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: 3,
            border: '1px solid var(--border)',
            flexShrink: 0,
            marginBottom: 16,
            gap: 3
          }}
        >
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1,
                padding: '7px 0',
                border: 'none',
                borderRadius: 8,
                background: activeTab === id ? 'var(--primary)' : 'transparent',
                color: activeTab === id ? '#fff' : 'var(--muted-foreground)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <Icon width="14" height="14" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <AnimatePresence mode="wait">
            {activeTab === 'portfolio' && (
              <motion.div
                key="portfolio"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {!result && !loading && (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted-foreground)' }}>
                    <Sparkles width="40" height="40" style={{ marginBottom: 12, opacity: 0.5 }} />
                    <p style={{ fontSize: 14, marginBottom: 8 }}>AI 将根据您的持仓和今日行情，给出加减仓及调仓建议</p>
                    {user?.id && (
                      <p style={{ fontSize: 12, marginBottom: 16, color: 'var(--muted-foreground)' }}>
                        已检测到 {funds?.length || 0} 只基金，其中 {holdingFunds.length} 只设有持仓
                      </p>
                    )}
                    <button
                      className="button"
                      onClick={handlePortfolioAnalysis}
                      disabled={!user?.id}
                      style={{ opacity: !user?.id ? 0.6 : 1 }}
                    >
                      {user?.id ? '开始持仓AI分析' : '请先登录'}
                    </button>
                  </div>
                )}
                {loading && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted-foreground)' }}>
                    <Loader2 width="32" height="32" className="spin" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 14 }}>AI 正在分析您的持仓与市场行情，请稍候...</p>
                  </div>
                )}
                {result && !loading && (
                  <div
                    style={{
                      padding: 14,
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 10,
                      border: '1px solid var(--border)'
                    }}
                  >
                    <SimpleMarkdown text={result} />
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="button secondary" onClick={() => setResult('')} style={{ fontSize: 12 }}>
                        重新分析
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'market' && (
              <motion.div
                key="market"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {!result && !loading && (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted-foreground)' }}>
                    <TrendingUp width="40" height="40" style={{ marginBottom: 12, opacity: 0.5 }} />
                    <p style={{ fontSize: 14, marginBottom: 16 }}>AI 将解读今日市场热点与资金流向</p>
                    <button className="button" onClick={handleMarketAnalysis}>
                      获取热点解读
                    </button>
                  </div>
                )}
                {loading && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted-foreground)' }}>
                    <Loader2 width="32" height="32" className="spin" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 14 }}>AI 正在解读市场热点...</p>
                  </div>
                )}
                {result && !loading && (
                  <div
                    style={{
                      padding: 14,
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 10,
                      border: '1px solid var(--border)'
                    }}
                  >
                    <SimpleMarkdown text={result} />
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="button secondary" onClick={handleMarketAnalysis} style={{ fontSize: 12 }}>
                        重新解读
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'health' && (
              <motion.div
                key="health"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {!healthResult && !loading && (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted-foreground)' }}>
                    <HeartPulse width="40" height="40" style={{ marginBottom: 12, opacity: 0.5 }} />
                    <p style={{ fontSize: 14, marginBottom: 16 }}>
                      AI 将从分散度、收益表现、热点匹配度等维度评估您的持仓健康度
                    </p>
                    <button
                      className="button"
                      onClick={handleHealthAnalysis}
                      disabled={!user?.id}
                      style={{ opacity: !user?.id ? 0.6 : 1 }}
                    >
                      {user?.id ? '开始健康度评估' : '请先登录'}
                    </button>
                  </div>
                )}
                {loading && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted-foreground)' }}>
                    <Loader2 width="32" height="32" className="spin" style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 14 }}>AI 正在评估持仓健康度...</p>
                  </div>
                )}
                {healthResult && !loading && (
                  <div>
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '24px 16px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        marginBottom: 12
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          border: `4px solid ${scoreColor(healthResult.score)}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 12px',
                          fontSize: 28,
                          fontWeight: 800,
                          color: scoreColor(healthResult.score)
                        }}
                      >
                        {healthResult.score}
                      </div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                        持仓健康度评分
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                        {healthResult.comment}
                      </p>
                    </div>
                    {healthResult.suggestions.length > 0 && (
                      <div
                        style={{
                          padding: 14,
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 10,
                          border: '1px solid var(--border)'
                        }}
                      >
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>优化建议</p>
                        <ul style={{ paddingLeft: 16, margin: 0 }}>
                          {healthResult.suggestions.map((s, i) => (
                            <li
                              key={i}
                              style={{
                                fontSize: 13,
                                color: 'var(--muted-foreground)',
                                marginBottom: 6,
                                lineHeight: 1.6
                              }}
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="button secondary" onClick={handleHealthAnalysis} style={{ fontSize: 12 }}>
                        重新评估
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              >
                <div
                  ref={chatScrollRef}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    minHeight: 200,
                    maxHeight: 420,
                    padding: '8px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  {chatMessages.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--muted-foreground)' }}>
                      <MessageCircle width="32" height="32" style={{ marginBottom: 8, opacity: 0.4 }} />
                      <p style={{ fontSize: 13 }}>向 AI 提问任何关于基金投资的问题</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '90%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                        color: msg.role === 'user' ? '#fff' : 'var(--text)',
                        fontSize: 13,
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border)'
                      }}
                    >
                      {msg.role === 'assistant' ? <SimpleMarkdown text={msg.content} /> : msg.content}
                    </div>
                  ))}
                  {chatLoading && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <Loader2 width="14" height="14" className="spin" />
                      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>AI 思考中...</span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)'
                  }}
                >
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
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'var(--text)',
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                  <button
                    className="button"
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || chatLoading || !user?.id}
                    style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Send width="14" height="14" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
