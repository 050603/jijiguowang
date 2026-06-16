import { isObject, isString } from 'lodash';

import { buildFundPredictionPrompt } from './prediction-prompt';

const DASHSCOPE_API_KEY = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || 'sk-62db71312d81415b93c059eec68e7a27';
const DASHSCOPE_BASE_URL =
  process.env.NEXT_PUBLIC_DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_DASHSCOPE_MODEL || 'qwen3.7-max';

function getProxyUrl() {
  if (typeof window === 'undefined') return null;
  let url = DASHSCOPE_BASE_URL + '/chat/completions';
  if (location.href.includes('39.106.185.205') || location.href.includes('jijiguowang')) {
    url = '/jijin/api/chat';
  }
  return url;
}

const safeParseJson = (value) => {
  if (isObject(value)) return value;
  if (!isString(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

function extractJson(text) {
  if (!isString(text)) return null;
  let cleaned = text.trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  // Try to find JSON object
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return safeParseJson(cleaned);
}

const withTimeout = (promise, timeoutMs) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

export async function invokeFundPredictionLLM(compressedInput, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 25000;
  if (!DASHSCOPE_API_KEY) return null;

  try {
    const prompt = buildFundPredictionPrompt(compressedInput);
    const messages = [
      {
        role: 'system',
        content:
          '你是一个基金短期预测计算引擎。你必须严格基于输入 JSON 进行计算，不能使用输入之外的信息。必须输出严格的 JSON，不要 Markdown。'
      },
      { role: 'user', content: prompt }
    ];

    const proxyUrl = getProxyUrl();
    const url = proxyUrl || `${DASHSCOPE_BASE_URL}/chat/completions`;

    const result = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 2048,
          stream: false
        })
      }),
      timeoutMs
    );

    if (!result || !result.ok) return null;

    const data = await result.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    return extractJson(content);
  } catch {
    return null;
  }
}
