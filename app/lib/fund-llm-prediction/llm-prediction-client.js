import { isObject, isString } from 'lodash';

import { isSupabaseConfigured, supabase } from '@/app/lib/supabase';

const safeParseJson = (value) => {
  if (isObject(value)) return value;
  if (!isString(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const withTimeout = (promise, timeoutMs) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ data: null, error: { message: '预测服务请求超时' } }), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

export async function invokeFundPredictionLLM(compressedInput, options = {}) {
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 20000;
  if (!isSupabaseConfigured || !supabase?.functions?.invoke) return null;
  try {
    const result = await withTimeout(
      supabase.functions.invoke('predict-fund', {
        body: { input: compressedInput }
      }),
      timeoutMs
    );
    if (result?.error) return null;
    const data = result?.data;
    if (data?.success === false) return null;
    const payload = data?.data ?? data?.result ?? data?.prediction ?? data;
    return safeParseJson(payload);
  } catch {
    return null;
  }
}
