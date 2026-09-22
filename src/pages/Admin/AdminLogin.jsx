import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminLogin.css";

export default function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);


const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);

  try {
    const response = await fetch(
      "http://127.0.0.1:8000/api/accounts/login/",
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

    console.log("Login Response:", data);

    if (!response.ok) {
      alert(
        data.detail ||
        data.non_field_errors?.[0] ||
        "Invalid email or password"
      );
      return;
    }

    // Admin only
    if (data.user?.role !== "ADMIN") {
      alert("You are not authorized to access the Admin Panel.");
      return;
    }

    // Save JWT
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);

    // Save admin user
    localStorage.setItem(
      "admin_user",
      JSON.stringify(data.user)
    );

    alert("Admin login successful!");

    navigate("/admin/dashboard");

  } catch (error) {
    console.error("Login Error:", error);
    alert("Unable to connect to backend server.");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="admin-login-page">

      <div className="admin-login-card">

        <h1>Admin Login</h1>

        <p>Owner / Admin Panel</p>

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              placeholder="Enter admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="admin-login-btn"
            disabled={loading}
          >
            {loading ? "Logging in..." : "LOGIN"}
          </button>

        </form>

      </div>

    </div>
  );
}