import React, { useEffect, useState } from 'react';
import { apiService } from '../utils/ApiService';
import logo from '../assets/logo2.png';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Stage: 'login' or 'change-password' (forced on first successful login)
  const [stage, setStage] = useState('login');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Apply dark mode on the login screen too — defaults to system if no
  // explicit preference is saved.
  useEffect(() => {
    const apply = () => {
      const saved = localStorage.getItem('theme') || 'system';
      const prefersDark =
        saved === 'dark' ||
        (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.body.classList.toggle('dark-mode', prefersDark);
    };
    if (!localStorage.getItem('theme')) {
      localStorage.setItem('theme', 'system');
    }
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem('theme') || 'system') === 'system') apply();
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await apiService.login(username, password);
      if (user?.must_change_password) {
        setStage('change-password');
      } else {
        onLogin();
      }
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword === password) {
      setError('New password must differ from your current password.');
      return;
    }
    setLoading(true);
    try {
      await apiService.login(username, password, newPassword);
      onLogin();
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logo} alt="Peridot" className="login-logo" />
        <h1 className="login-title">Peridot</h1>

        {stage === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="login-input"
              autoComplete="username"
              autoFocus
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="login-input"
              autoComplete="current-password"
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="login-form">
            <div className="login-subtitle">
              You must set a new password before continuing.
            </div>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="login-input"
              autoComplete="new-password"
              autoFocus
              required
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="login-input"
              autoComplete="new-password"
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
