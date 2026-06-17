'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { isArray } from 'lodash';
import { Loader2, Sparkles, TrendingDown, TrendingUp, Minus, AlertCircle, RotateCw } from 'lucide-react';
import { predictFundWithLLM } from '@/app/lib/fund-llm-prediction';

const DIRECTION_CONFIG = {
  bullish: { label: '看涨', color: '#ef4444', Icon: TrendingUp, bg: 'rgba(239,68,68,0.1)' },
  slightly_bullish: { label: '偏多', color: '#f97316', Icon: TrendingUp, bg: 'rgba(249,115,22,0.1)' },
  neutral: { label: '中性', color: '#6b7280', Icon: Minus, bg: 'rgba(107,114,128,0.1)' },
  slightly_bearish: { label: '偏空', color: '#22c55e', Icon: TrendingDown, bg: 'rgba(34,197,94,0.1)' },
  bearish: { label: '看跌', color: '#22c55e', Icon: TrendingDown, bg: 'rgba(34,197,94,0.1)' },
  uncertain: { label: '不确定', color: '#6b7280', Icon: Minus, bg: 'rgba(107,114,128,0.1)' }
};

function formatPct(value) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatConfidence(value) {
  if (value == null) return '--';
  return `${(value * 100).toFixed(0)}%`;
}

function SingleFundPrediction({ fundCode, fundName, autoLoad = false, onRequestLoad }) {
  const {
    data: result,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ['fundPrediction', fundCode, 'dual', true],
    queryFn: () => predictFundWithLLM(fundCode, { useLLM: true, timeoutMs: 25000 }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    enabled: !!fundCode && autoLoad
  });

  const prediction = result?.horizons?.nextTradingDay || result?.prediction;
  const shortTerm = result?.horizons?.shortTerm;
  const config = prediction?.direction ? DIRECTION_CONFIG[prediction.direction] || DIRECTION_CONFIG.uncertain : null;
  const DirectionIcon = config?.Icon || Minus;
  const isLLM = result?.source === 'llm';

  if (!autoLoad) {
    return (
      <button
        onClick={() => {
          if (onRequestLoad) onRequestLoad();
          refetch();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          width: '100%',
          padding: '8px 0',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--primary)',
          fontSize: 12,
          cursor: 'pointer'
        }}
      >
        <Sparkles width={12} height={12} />
        点击查看双周期走势参考 {fundName || fundCode}
      </button>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '12px 0',
          color: 'var(--muted-foreground)',
          fontSize: 12
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        分析中...
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '8px 0',
          color: 'var(--muted-foreground)',
          fontSize: 12
        }}
      >
        <AlertCircle size={14} />
        <span>预测失败</span>
        <button
          onClick={() => refetch()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 4,
            border: 'none',
            background: 'var(--primary-light, rgba(34,211,238,0.1))',
            color: 'var(--primary)',
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          <RotateCw size={10} />
          重试
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      style={{ textAlign: 'center' }}
    >
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 6 }}>次日 / 短期情景判断</div>
      {/* 方向 + 预期收益 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
        <DirectionIcon size={18} style={{ color: config?.color || 'var(--muted)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: config?.color || 'var(--foreground)' }}>
          {formatPct(prediction?.expectedReturnPct)}
        </span>
      </div>

      {/* 方向标签 */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: config?.color || 'var(--muted)',
          marginBottom: 4,
          padding: '1px 8px',
          borderRadius: 4,
          background: config?.bg || 'transparent',
          display: 'inline-block'
        }}
      >
        下个交易日 · {isLLM ? 'AI' : '规则'} {config?.label || '--'}
      </div>

      {/* 置信度 */}
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
        置信度 {formatConfidence(prediction?.confidence)} · 区间{' '}
        {prediction?.expectedRangePct
          ? `${formatPct(prediction.expectedRangePct[0])}~${formatPct(prediction.expectedRangePct[1])}`
          : '--'}
      </div>

      {/* 概率条 */}
      {prediction?.probability && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 1 }}>
            <div style={{ flex: prediction.probability.up || 0.33, background: 'var(--up, #ef4444)' }} />
            <div style={{ flex: prediction.probability.flat || 0.34, background: 'var(--muted, #6b7280)' }} />
            <div style={{ flex: prediction.probability.down || 0.33, background: 'var(--down, #22c55e)' }} />
          </div>
        </div>
      )}

      {shortTerm && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
            fontSize: 11,
            color: 'var(--muted-foreground)'
          }}
        >
          短期趋势：{DIRECTION_CONFIG[shortTerm.direction]?.label || '不确定'} · 置信度{' '}
          {formatConfidence(shortTerm.confidence)}
          <br />
          区间{' '}
          {shortTerm.expectedRangePct
            ? `${formatPct(shortTerm.expectedRangePct[0])}~${formatPct(shortTerm.expectedRangePct[1])}`
            : '--'}
        </div>
      )}
      {result?.rebalanceAdvice && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted-foreground)' }}>
          调仓辅助：{result.rebalanceAdvice.action} / {result.rebalanceAdvice.strength} · 需人工确认
        </div>
      )}
      {/* 摘要 */}
      {result?.summary && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--muted-foreground)',
            marginTop: 6,
            lineHeight: 1.4,
            opacity: 0.8
          }}
        >
          {result.summary}
        </div>
      )}
    </motion.div>
  );
}

export default function FundPredictionModule({ funds = [], autoLoadAll = false, mode = 'batch' }) {
  const [loadedFunds, setLoadedFunds] = useState({});
  const [loadingAll, setLoadingAll] = useState(false);

  const handlePredictAll = () => {
    setLoadingAll(true);
    const list = funds.slice();
    list.forEach((f, index) => {
      setTimeout(
        () => {
          setLoadedFunds((prev) => ({ ...prev, [f.code]: true }));
          if (index === list.length - 1) setLoadingAll(false);
        },
        Math.floor(index / 3) * 1200
      );
    });
  };

  if (!isArray(funds) || !funds.length) {
    return null;
  }

  if (mode === 'batch') {
    // 批量预测视图：卡片网格
    const allLoaded = funds.every((f) => loadedFunds[f.code]);

    return (
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles width={16} height={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>双周期走势参考</span>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>({funds.length}只)</span>
          </div>
          {!allLoaded && (
            <button
              onClick={handlePredictAll}
              disabled={loadingAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--primary)',
                color: '#05263b',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: loadingAll ? 0.6 : 1
              }}
            >
              {loadingAll ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Sparkles width={12} height={12} />
                  分批预测
                </>
              )}
            </button>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 10
          }}
        >
          {funds.map((fund) => (
            <div
              key={fund.code}
              style={{
                background: 'var(--card-bg, rgba(255,255,255,0.02))',
                borderRadius: 10,
                border: '1px solid var(--border, rgba(255,255,255,0.06))',
                padding: 12
              }}
            >
              {/* 基金名称 */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  marginBottom: 8,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                title={fund.name || fund.code}
              >
                {fund.name || fund.code}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--muted-foreground)',
                  marginBottom: 8
                }}
              >
                {fund.code}
              </div>

              {/* 预测结果 */}
              <SingleFundPrediction
                fundCode={fund.code}
                fundName={fund.name}
                autoLoad={autoLoadAll || !!loadedFunds[fund.code]}
                onRequestLoad={() => setLoadedFunds((prev) => ({ ...prev, [fund.code]: true }))}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 单基金模式：兼容 FundCard 中的使用
  const fund = funds[0];
  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0 12px' }}>
        <div style={{ flex: 1, height: '1px', background: 'var(--border, rgba(255,255,255,0.08))' }} />
        <button
          onClick={() => {
            setLoadedFunds((prev) => ({ ...prev, [fund.code]: true }));
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '0 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--primary)',
            fontSize: '12px',
            fontWeight: 600,
            transition: 'color 0.2s ease'
          }}
        >
          <Sparkles width="14" height="14" />
          <span>双周期走势参考</span>
        </button>
        <div style={{ flex: 1, height: '1px', background: 'var(--border, rgba(255,255,255,0.08))' }} />
      </div>
      <SingleFundPrediction
        fundCode={fund.code}
        fundName={fund.name}
        autoLoad={!!loadedFunds[fund.code]}
        onRequestLoad={() => setLoadedFunds((prev) => ({ ...prev, [fund.code]: true }))}
      />
    </div>
  );
}
