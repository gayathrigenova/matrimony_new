import { API_URL } from "../api.js";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/accounts/login/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: email,
            password: password,
          }),
        }
      );

      const data = await response.json();

      console.log("Login response:", data);

      if (!response.ok) {
        alert(data.detail || "Invalid email or password");
        return;
      }

      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.dispatchEvent(new Event("auth-change"));

      const destination = data.user.role === "CLIENT"
        ? "/dashboard"
        : data.user.role === "ADMIN"
          ? "/admin/dashboard"
          : data.user.role === "BROKER"
            ? "/broker/dashboard"
            : "/";

      setNotice({ title: "Welcome back!", message: "You’re signed in successfully." });
      window.setTimeout(() => navigate(destination), 1200);
    } catch (error) {
      console.error("Login error:", error);
      alert("Unable to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {notice && (
        <div className="login-toast" role="status" aria-live="polite">
          <span className="login-toast-icon" aria-hidden="true">✓</span>
          <span className="login-toast-copy">
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </span>
          <span className="login-toast-progress" aria-hidden="true" />
        </div>
      )}

      {/* Banner */}
      <section className="login-banner">
        <div className="login-banner-overlay">
          <h1>Find Your Perfect Life Partner</h1>

          <p>
            Welcome back! Sign in to continue your search for a meaningful
            relationship.
          </p>
        </div>
      </section>

      {/* Login Card */}
      <div className="login-card">

        <div className="login-header">
          <h2>Welcome Back ❤️</h2>
          <p>Login to your account</p>
        </div>

        <form onSubmit={handleLogin}>

          {/* Email */}
          <div className="login-form-group">
            <label htmlFor="login-email">Email</label>

            <input
              id="login-email"
              type="email"
              placeholder="Enter your registered email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password */}
          <div className="login-form-group">
            <label htmlFor="login-password">Password</label>

            <input
              id="login-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* Links */}
          <div className="login-links">
            <button
              type="button"
              className="login-forgot-btn"
              onClick={() => alert("Forgot password feature coming soon.")}
            >
              Forgot Password?
            </button>

            <button
              type="button"
              className="login-create-btn"
              onClick={() => navigate("/registration")}
            >
              Create Account
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
