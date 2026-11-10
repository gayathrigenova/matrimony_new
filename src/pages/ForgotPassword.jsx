import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, readApiResponse } from '../api.js';
import './ForgotPassword.css';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/accounts/password-reset/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await readApiResponse(res);
      if (res.ok) {
        setSent(true);
      } else {
        setError(data.detail || data.email?.[0] || 'Something went wrong. Please try again.');
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
          <h1>Forgot Password?</h1>
          <p>No worries! Enter your email and we'll send you a reset link.</p>
        </div>
      </section>

      <div className="fp-card">
        {sent ? (
          <div className="fp-success" role="status" aria-live="polite">
            <div className="fp-success-icon">✉️</div>
            <h2>Check Your Email</h2>
            <p>If an account exists with this email, a password reset link has been sent.</p>
            <button onClick={() => navigate('/login')} className="fp-btn">Back to Login</button>
          </div>
        ) : (
          <>
            <div className="fp-header">
              <h2>Reset Password</h2>
              <p>Enter your registered email address</p>
            </div>

            {error && <div className="fp-error" role="alert">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="fp-form-group">
                <label htmlFor="fp-email">Email Address</label>
                <input
                  id="fp-email"
                  type="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  autoComplete="email"
                  required
                />
              </div>
              <button type="submit" className="fp-btn" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" className="fp-back-btn" onClick={() => navigate('/login')}>
                ← Back to Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
