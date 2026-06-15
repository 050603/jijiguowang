'use client';

import React from 'react';

/**
 * 极简 Markdown 渲染组件
 * 仅支持：标题、列表、粗体、换行
 */
export default function SimpleMarkdown({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let keyIndex = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${keyIndex++}`} style={{ paddingLeft: 18, margin: '8px 0', lineHeight: 1.7 }}>
          {listItems.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const renderInline = (line) => {
    // 处理粗体 **text**
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} style={{ fontWeight: 700 }}>
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3
          key={`h-${keyIndex++}`}
          style={{ fontSize: 16, fontWeight: 700, margin: '16px 0 8px', color: 'var(--text)' }}
        >
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4
          key={`h4-${keyIndex++}`}
          style={{ fontSize: 14, fontWeight: 700, margin: '12px 0 6px', color: 'var(--text)' }}
        >
          {renderInline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === '') {
      flushList();
      elements.push(<div key={`br-${keyIndex++}`} style={{ height: 8 }} />);
    } else {
      flushList();
      elements.push(
        <p key={`p-${keyIndex++}`} style={{ lineHeight: 1.7, margin: '6px 0' }}>
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  flushList();

  return <div style={{ color: 'var(--text)', fontSize: 14 }}>{elements}</div>;
}
