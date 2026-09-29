import { API_URL } from "../api.js";
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../pages/ClientDashboard.css";


export default function ClientLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    // 1. Auth check
    if (!token) {
      navigate("/login");
      return;
    }

    // 2. Client Role protection check
    const userString = localStorage.getItem("user");
    if (userString) {
      try {
        const userObj = JSON.parse(userString);
        if (userObj.role === "ADMIN") {
          navigate("/admin/dashboard");
          return;
        } else if (userObj.role === "BROKER") {
          navigate("/broker/dashboard");
          return;
        }
      } catch (err) {
        console.error("Failed to parse user string from localStorage", err);
      }
    }

    // Load profile header summary
    fetch(`${API_URL}/registrations/my-profile/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("user");
            navigate("/login");
            return;
          }
          throw new Error("Failed to load profile");
        }
        const data = await res.json();
        setProfile(data);
      })
      .catch((err) => {
        console.error("ClientLayout profile error:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isActive = (path) => {
    if (path === "/dashboard" && location.pathname === "/dashboard") return true;
    if (path !== "/dashboard" && location.pathname.startsWith(path)) return true;
    return false;
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="client-dashboard">
      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <nav className="sidebar-nav">
          <p className="nav-heading">MAIN MENU</p>

          <button
            className={`nav-item ${isActive("/dashboard") ? "active" : ""}`}
            onClick={() => {
              navigate("/dashboard");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▦</span>
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-item ${isActive("/profile") ? "active" : ""}`}
            onClick={() => {
              navigate("/profile");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">◎</span>
            <span>My Profile</span>
          </button>

          <button
            className={`nav-item ${isActive("/search-matches") ? "active" : ""}`}
            onClick={() => {
              navigate("/search-matches");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">⌕</span>
            <span>Search Matches</span>
          </button>

          <button
            className={`nav-item ${isActive("/interests") ? "active" : ""}`}
            onClick={() => {
              navigate("/interests");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">♡</span>
            <span>Interests</span>
          </button>

          <button
            className={`nav-item ${isActive("/shortlist") ? "active" : ""}`}
            onClick={() => {
              navigate("/shortlist");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">☆</span>
            <span>Shortlist</span>
          </button>

          <button
            className={`nav-item ${isActive("/messages") ? "active" : ""}`}
            onClick={() => {
              navigate("/messages");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▱</span>
            <span>Messages</span>
          </button>

          <p className="nav-heading second-heading">ACCOUNT</p>

          <button
            className={`nav-item ${isActive("/photos") ? "active" : ""}`}
            onClick={() => {
              navigate("/photos");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▧</span>
            <span>My Photos</span>
          </button>

          <button
            className={`nav-item ${isActive("/settings") ? "active" : ""}`}
            onClick={() => {
              navigate("/settings");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">⚙</span>
            <span>Settings</span>
          </button>
        </nav>

        {/* SIDEBAR BOTTOM */}
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">?</div>
            <div>
              <strong>Need Help?</strong>
              <span>Contact our team</span>
            </div>
          </div>

          <button className="sidebar-logout" onClick={handleLogout}>
            <span>↪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="dashboard-main">
        {/* MOBILE MENU BUTTON */}
        <button
          type="button"
          className="dashboard-mobile-menu"
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>

        {/* CONTENT */}
        <main className="dashboard-content">
          {children}
        </main>
      </div>
    </div>
  );
}
