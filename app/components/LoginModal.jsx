'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MailIcon } from './Icons';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function LoginModal({ onClose, showToast, isExplicitLoginRef, initialError = '' }) {
  const [mode, setMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('otp');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [showActivationInput, setShowActivationInput] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const resetForm = () => {
    setError('');
    setSuccess('');
    setOtpSent(false);
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setActivationCode('');
    setShowActivationInput(false);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    resetForm();
  };

  const switchLoginMethod = (method) => {
    setLoginMethod(method);
    resetForm();
  };

  const validateEmail = (val) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!val.trim()) return '请输入邮箱地址';
    if (!emailRegex.test(val.trim())) return '请输入有效的邮箱地址';
    return null;
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    if (mode === 'register') {
      if (showActivationInput) {
        if (!activationCode.trim()) {
          setError('请输入激活码');
          return;
        }
        if (activationCode.trim() !== '88888888') {
          setError('激活码错误');
          return;
        }
      } else {
        setError('目前仅开放测试资格注册，请点击下方「测试资格注册」入口');
        return;
      }
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true
        }
      });
      if (otpError) throw otpError;
      setOtpSent(true);
      setSuccess('验证码已发送到您的邮箱，请输入六位验证码');
    } catch (err) {
      if (err.message?.includes('rate limit')) {
        setError('请求过于频繁，请稍后再试');
      } else if (err.message?.includes('network')) {
        setError('网络错误，请检查网络连接');
      } else {
        setError(err.message || '发送验证码失败，请稍后再试');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpLogin = async () => {
    setError('');
    if (!otp || otp.length < 4) {
      setError('请输入邮箱中的验证码');
      return;
    }
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    try {
      if (isExplicitLoginRef) isExplicitLoginRef.current = true;
      setLoading(true);
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email'
      });
      if (verifyError) throw verifyError;
      if (data?.user) {
        onClose();
      }
    } catch (err) {
      setError(err.message || '验证失败，请检查验证码或稍后再试');
      if (isExplicitLoginRef) isExplicitLoginRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!otp || otp.length < 4) {
      setError('请输入邮箱中的验证码');
      return;
    }
    if (!password.trim()) {
      setError('请设置登录密码');
      return;
    }
    if (password.trim().length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法注册', 'error');
      return;
    }
    try {
      if (isExplicitLoginRef) isExplicitLoginRef.current = true;
      setLoading(true);
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: 'email'
      });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({
        password: password.trim()
      });
      if (updateError) throw updateError;
      if (data?.user) {
        onClose();
      }
    } catch (err) {
      setError(err.message || '注册失败，请检查验证码或稍后再试');
      if (isExplicitLoginRef) isExplicitLoginRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!isSupabaseConfigured) {
      showToast('未配置 Supabase，无法登录', 'error');
      return;
    }
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!password.trim()) {
      setError('请输入登录密码');
      return;
    }
    try {
      if (isExplicitLoginRef) isExplicitLoginRef.current = true;
      setLoading(true);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });
      if (signInError) throw signInError;
      if (data?.user) {
        onClose();
      }
    } catch (err) {
      setError(err.message || '登录失败，请检查邮箱和密码');
      if (isExplicitLoginRef) isExplicitLoginRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.25 } },
    exit: { opacity: 0, transition: { duration: 0.2 } }
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.92, y: 30 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 350, delay: 0.05 }
    },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={onClose}
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="glass card modal login-modal"
        onClick={(e) => e.stopPropagation()}
        variants={cardVariants}
        style={{ maxWidth: 400, margin: 'auto', padding: 32, borderRadius: 20 }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.15 }}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 32px rgba(5, 150, 105, 0.3)'
            }}
          >
            <MailIcon width="28" height="28" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}
          >
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}
          >
            {mode === 'login'
              ? loginMethod === 'otp'
                ? '使用邮箱验证码登录'
                : '使用密码登录'
              : '注册后即可同步基金数据'}
          </motion.p>
        </div>

        {/* Mode toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 3,
            marginBottom: 20,
            border: '1px solid var(--border)'
          }}
        >
          <button
            type="button"
            onClick={() => switchMode('login')}
            style={{
              flex: 1,
              padding: '9px 0',
              border: 'none',
              borderRadius: 10,
              background: mode === 'login' ? 'var(--primary)' : 'transparent',
              color: mode === 'login' ? '#fff' : 'var(--muted-foreground)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: mode === 'login' ? '0 4px 14px rgba(5, 150, 105, 0.35)' : 'none'
            }}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            style={{
              flex: 1,
              padding: '9px 0',
              border: 'none',
              borderRadius: 10,
              background: mode === 'register' ? 'var(--primary)' : 'transparent',
              color: mode === 'register' ? '#fff' : 'var(--muted-foreground)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: mode === 'register' ? '0 4px 14px rgba(5, 150, 105, 0.35)' : 'none'
            }}
          >
            注册
          </button>
        </motion.div>

        {/* Login method toggle */}
        <AnimatePresence mode="wait">
          {mode === 'login' && (
            <motion.div
              key="login-methods"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: 'flex', gap: 8, marginBottom: 16, overflow: 'hidden' }}
            >
              <button
                type="button"
                onClick={() => switchLoginMethod('otp')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: loginMethod === 'otp' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  borderRadius: 10,
                  background: loginMethod === 'otp' ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                  color: loginMethod === 'otp' ? 'var(--primary)' : 'var(--muted-foreground)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
              >
                验证码登录
              </button>
              <button
                type="button"
                onClick={() => switchLoginMethod('password')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: loginMethod === 'password' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  borderRadius: 10,
                  background: loginMethod === 'password' ? 'rgba(5, 150, 105, 0.08)' : 'transparent',
                  color: loginMethod === 'password' ? 'var(--primary)' : 'var(--muted-foreground)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.25s ease'
                }}
              >
                密码登录
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form fields */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          {/* Email */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>邮箱地址</label>
            <input
              style={inputStyle}
              className="input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || (mode === 'register' && otpSent)}
            />
          </div>

          {/* Register: hidden activation code */}
          {mode === 'register' && !otpSent && (
            <>
              <AnimatePresence>
                {showActivationInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 14 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="form-group">
                      <label style={labelStyle}>
                        激活码 <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>*</span>
                      </label>
                      <input
                        style={inputStyle}
                        className="input"
                        type="password"
                        placeholder="请输入激活码"
                        value={activationCode}
                        onChange={(e) => setActivationCode(e.target.value)}
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {!showActivationInput && (
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActivationInput(true);
                      setError('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                      opacity: 0.8,
                      transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
                  >
                    测试资格注册
                  </button>
                </div>
              )}
            </>
          )}

          {/* OTP fields */}
          {((mode === 'login' && loginMethod === 'otp' && otpSent) || (mode === 'register' && otpSent)) && (
            <>
              <AnimatePresence>
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    style={{
                      background: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      marginBottom: 14,
                      fontSize: 13,
                      color: 'var(--success, #22c55e)'
                    }}
                  >
                    {success}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={labelStyle}>邮箱验证码</label>
                <input
                  style={{
                    ...inputStyle,
                    letterSpacing: '0.5em',
                    textAlign: 'center',
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    fontFamily: 'monospace'
                  }}
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="------"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Register: password fields */}
          {mode === 'register' && otpSent && (
            <>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={labelStyle}>设置密码</label>
                <input
                  style={inputStyle}
                  className="input"
                  type="password"
                  placeholder="至少 6 位字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={labelStyle}>确认密码</label>
                <input
                  style={inputStyle}
                  className="input"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* Password login */}
          {mode === 'login' && loginMethod === 'password' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label style={labelStyle}>登录密码</label>
              <input
                style={inputStyle}
                className="input"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: 13,
                  color: 'var(--error, #ef4444)',
                  overflow: 'hidden'
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mode === 'login' && loginMethod === 'otp' && !otpSent && (
              <button
                type="button"
                className="button"
                onClick={handleSendOtp}
                disabled={loading || !email}
                style={primaryBtnStyle}
              >
                {loading ? '发送中...' : '发送验证码'}
              </button>
            )}

            {mode === 'login' && loginMethod === 'otp' && otpSent && (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={handleVerifyOtpLogin}
                  disabled={loading || otp.length < 4}
                  style={primaryBtnStyle}
                >
                  {loading ? '验证中...' : '确认登录'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp('');
                    setSuccess('');
                  }}
                  disabled={loading}
                  style={secondaryBtnStyle}
                >
                  重新发送验证码
                </button>
              </>
            )}

            {mode === 'login' && loginMethod === 'password' && (
              <button
                type="button"
                className="button"
                onClick={handlePasswordLogin}
                disabled={loading || !email || !password}
                style={primaryBtnStyle}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            )}

            {mode === 'register' && !otpSent && (
              <button
                type="button"
                className="button"
                onClick={handleSendOtp}
                disabled={loading || !email || (showActivationInput && !activationCode)}
                style={primaryBtnStyle}
              >
                {loading ? '发送中...' : '发送验证码'}
              </button>
            )}

            {mode === 'register' && otpSent && (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={handleRegister}
                  disabled={loading || otp.length < 4 || !password}
                  style={primaryBtnStyle}
                >
                  {loading ? '注册中...' : '完成注册'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp('');
                    setSuccess('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  disabled={loading}
                  style={secondaryBtnStyle}
                >
                  重新发送验证码
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Close */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          style={{ textAlign: 'center', marginTop: 18 }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted-foreground)',
              fontSize: 13,
              cursor: 'pointer',
              padding: '6px 16px',
              borderRadius: 8,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted-foreground)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            取消
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

const labelStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  marginBottom: 6,
  display: 'block',
  letterSpacing: '0.02em'
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1.5px solid var(--border)',
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  transition: 'all 0.25s ease'
};

const primaryBtnStyle = {
  width: '100%',
  padding: '13px 0',
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.25s ease',
  boxShadow: '0 4px 16px rgba(5, 150, 105, 0.25)'
};

const secondaryBtnStyle = {
  width: '100%',
  padding: '11px 0',
  fontSize: 13,
  borderRadius: 10,
  border: '1.5px solid var(--border)',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transition: 'all 0.25s ease'
};
