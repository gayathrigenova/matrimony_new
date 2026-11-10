import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_URL, readApiResponse } from '../api.js';
import './ForgotPassword.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { uid, token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!done) return undefined;
    const redirectTimer = window.setTimeout(() => navigate('/login'), 2500);
    return () => window.clearTimeout(redirectTimer);
  }, [done, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/accounts/password-reset-confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token, new_password: password }),
      });
      const data = await readApiResponse(res);
      if (res.ok) {
        setDone(true);
      } else {
        const passwordError = Array.isArray(data.new_password)
          ? data.new_password[0]
          : data.new_password;
        setError(data.detail || passwordError || data.token?.[0] || 'Invalid or expired link. Please request a new one.');
      }
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fp-page">
      <section className="fp-banner">
        <div className="fp-banner-content">
          <h1>Set New Password</h1>
          <p>Create a strong new password for your account.</p>
        </div>
      </section>

      <div className="fp-card">
        {done ? (
          <div className="fp-success" role="status" aria-live="polite">
            <div className="fp-success-icon">✓</div>
            <h2>Password Updated!</h2>
            <p>Your password has been reset successfully. Redirecting you to Login...</p>
            <button onClick={() => navigate('/login')} className="fp-btn">Go to Login</button>
          </div>
        ) : (
          <>
            <div className="fp-header">
              <h2>Create New Password</h2>
              <p>Enter and confirm your new password</p>
            </div>

            {error && <div className="fp-error" role="alert">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="fp-form-group">
                <label htmlFor="rp-password">New Password</label>
                <div className="fp-password-wrap">
                  <input
                    id="rp-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your new password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="fp-password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="fp-form-group">
                <label htmlFor="rp-confirm">Confirm New Password</label>
                <div className="fp-password-wrap">
                  <input
                    id="rp-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError('');
                    }}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="fp-password-toggle"
                    onClick={() => setShowConfirm((visible) => !visible)}
                    aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                    aria-pressed={showConfirm}
                  >
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button type="submit" className="fp-btn" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
