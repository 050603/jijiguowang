'use client';

import { useEffect } from 'react';

import { notifyClientError } from './ClientErrorBoundary';

export default function GlobalClientErrorHandler() {
  useEffect(() => {
    const handleError = (event) => {
      notifyClientError(event.error || event.message || event, {
        title: '页面运行异常',
        toastId: 'window-runtime-error',
        closeModals: true
      });
    };

    const handleUnhandledRejection = (event) => {
      notifyClientError(event.reason || event, {
        title: '异步任务异常',
        toastId: 'window-promise-error',
        closeModals: true
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}
