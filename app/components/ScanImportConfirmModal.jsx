'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { CloseIcon } from './Icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export default function ScanImportConfirmModal({
  scannedFunds,
  selectedScannedCodes,
  onClose,
  onToggle,
  onConfirm,
  onRetryOcr,
  refreshing,
  groups = [],
  existingAllCodes = [],
  existingFavCodes = [],
  isOcrScan = false,
  currentGroup = 'all'
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroup);
  const [expandAfterAdd, setExpandAfterAdd] = useState(true);
  const [addMode, setAddMode] = useState('watchlist'); // 'watchlist' | 'holding'

  const allCodeSet = useMemo(() => new Set((existingAllCodes || []).filter(Boolean)), [existingAllCodes]);
  const favCodeSet = useMemo(() => new Set((existingFavCodes || []).filter(Boolean)), [existingFavCodes]);

  const formatAmount = (val) => {
    if (!val) return null;
    const num = parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(num)) return null;
    return num;
  };

  const handleConfirm = () => {
    onConfirm(selectedGroupId, expandAfterAdd, addMode);
  };

  const selectedFundsList = useMemo(() => {
    return (scannedFunds || []).filter((item) => selectedScannedCodes.has(item.code));
  }, [scannedFunds, selectedScannedCodes]);

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="确认导入基金"
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
        style={{ width: 520, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div
          className="title"
          style={{
            marginBottom: 12,
            justifyContent: 'space-between',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>确认导入基金</span>
            {isOcrScan && (
              <button
                onClick={onRetryOcr}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <RefreshCw width="14" height="14" />
                重新识别
              </button>
            )}
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {isOcrScan && (
          <div className="ocr-warning" style={{ marginBottom: 12, flexShrink: 0 }}>
            <span>拍照识别方案目前还在优化，请确认识别结果是否正确。</span>
          </div>
        )}

        {scannedFunds.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, flexShrink: 0 }}>
            未识别到有效的基金代码，请尝试更清晰的截图或手动搜索。
          </div>
        ) : (
          <>
            {/* Add mode toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 10,
                padding: 3,
                marginBottom: 12,
                border: '1px solid var(--border)',
                flexShrink: 0
              }}
            >
              <button
                type="button"
                onClick={() => setAddMode('watchlist')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  border: 'none',
                  borderRadius: 8,
                  background: addMode === 'watchlist' ? 'var(--primary)' : 'transparent',
                  color: addMode === 'watchlist' ? '#fff' : 'var(--muted-foreground)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
              >
                添加自选
              </button>
              <button
                type="button"
                onClick={() => setAddMode('holding')}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  border: 'none',
                  borderRadius: 8,
                  background: addMode === 'holding' ? 'var(--primary)' : 'transparent',
                  color: addMode === 'holding' ? '#fff' : 'var(--muted-foreground)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
              >
                添加持仓
              </button>
            </div>

            {/* Scrollable list */}
            <div
              className="search-results pending-list scrollbar-y-styled"
              style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}
            >
              {scannedFunds.map((item) => {
                const isSelected = selectedScannedCodes.has(item.code);
                const isInvalid = item.status === 'invalid';
                const targetGroup = selectedGroupId;
                const inAll = allCodeSet.has(item.code);
                const inFav = favCodeSet.has(item.code);
                const groupCodes =
                  targetGroup && targetGroup !== 'all' && targetGroup !== 'fav'
                    ? groups.find((g) => g.id === targetGroup)?.codes || []
                    : [];
                const inGroup =
                  targetGroup && targetGroup !== 'all' && targetGroup !== 'fav'
                    ? groupCodes.includes(item.code)
                    : false;
                const holdAmounts = formatAmount(item.holdAmounts);
                const holdGains = formatAmount(item.holdGains);
                const hasHoldingData = holdAmounts !== null && holdGains !== null;
                const isAlreadyInTarget = targetGroup === 'all' ? inAll : targetGroup === 'fav' ? inFav : inGroup;
                const isDisabled = (isAlreadyInTarget && !hasHoldingData) || isInvalid;
                const displayName = item.name || (isInvalid ? '未找到基金' : '未知基金');

                return (
                  <div
                    key={item.code}
                    className={`search-item ${isSelected ? 'selected' : ''} ${isAlreadyInTarget && !hasHoldingData ? 'added' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (isDisabled) return;
                      onToggle(item.code);
                    }}
                    style={{
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      flexDirection: 'column',
                      alignItems: 'stretch'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="fund-info">
                        <span className="fund-name">{displayName}</span>
                        <span className="fund-code muted">#{item.code}</span>
                      </div>
                      {isAlreadyInTarget && !hasHoldingData ? (
                        <span className="added-label">已添加</span>
                      ) : isInvalid ? (
                        <span className="added-label">未找到</span>
                      ) : (
                        <div className="checkbox">{isSelected && <div className="checked-mark" />}</div>
                      )}
                    </div>

                    {hasHoldingData && !isDisabled && (
                      <div style={{ display: 'flex', gap: 16, marginTop: 6, alignItems: 'center' }}>
                        {holdAmounts !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有金额：
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                              {holdAmounts.toLocaleString('zh-CN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </span>
                          </span>
                        )}
                        {holdGains !== null && (
                          <span className="muted" style={{ fontSize: 12 }}>
                            持有收益：
                            <span
                              style={{ color: holdGains >= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 500 }}
                            >
                              {holdGains >= 0 ? '+' : '-'}
                              {Math.abs(holdGains).toLocaleString('zh-CN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </span>
                          </span>
                        )}
                        {isAlreadyInTarget && (
                          <span
                            className="added-label"
                            style={{
                              color: 'var(--danger)',
                              background: 'color-mix(in srgb, var(--danger) 15%, transparent)',
                              marginLeft: 'auto'
                            }}
                          >
                            已存在
                          </span>
                        )}
                      </div>
                    )}

                    {addMode === 'holding' && isSelected && !isDisabled && (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                        导入后将自动打开持仓设置
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer controls */}
            <div style={{ flexShrink: 0, marginTop: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 10
                }}
              >
                <span className="muted" style={{ fontSize: 13 }}>
                  添加后展开详情
                </span>
                <Switch checked={expandAfterAdd} onCheckedChange={(checked) => setExpandAfterAdd(!!checked)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                  添加到分组：
                </span>
                <Select value={selectedGroupId} onValueChange={(value) => setSelectedGroupId(value)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择分组" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="fav">自选</SelectItem>
                    {groups
                      .filter((g) => g.id !== 'all' && g.id !== 'fav')
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="button secondary" onClick={onClose}>
                  取消
                </button>
                <button className="button" onClick={handleConfirm} disabled={selectedScannedCodes.size === 0}>
                  确认导入
                </button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
