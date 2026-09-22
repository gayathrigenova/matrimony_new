import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./Settings.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function Settings() {
  const navigate = useNavigate();

  const [accountData, setAccountData] = useState({
    email: "",
    phone: "",
  });

  const [passwordData, setPasswordData] = useState({
    old_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [msgAccount, setMsgAccount] = useState({ type: "", text: "" });
  const [msgPassword, setMsgPassword] = useState({ type: "", text: "" });
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const userString = localStorage.getItem("user");
    if (userString) {
      try {
        const u = JSON.parse(userString);
        setAccountData({
          email: u.email || "",
          phone: u.phone || "",
        });
      } catch (e) {}
    }
  }, [token, navigate]);

  const handleAccountUpdate = (e) => {
    e.preventDefault();
    setMsgAccount({ type: "", text: "" });

    fetch(`${API_URL}/accounts/update-account/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(accountData),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update account.");

        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        setMsgAccount({ type: "success", text: "Account details updated successfully." });
      })
      .catch((err) => setMsgAccount({ type: "error", text: err.message }));
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setMsgPassword({ type: "", text: "" });

    if (passwordData.new_password !== passwordData.confirm_password) {
      setMsgPassword({ type: "error", text: "New passwords do not match." });
      return;
    }

    fetch(`${API_URL}/accounts/change-password/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: passwordData.old_password,
        new_password: passwordData.new_password,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to change password.");

        setMsgPassword({ type: "success", text: "Password changed successfully." });
        setPasswordData({ old_password: "", new_password: "", confirm_password: "" });
      })
      .catch((err) => setMsgPassword({ type: "error", text: err.message }));
  };

  const confirmLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <ClientLayout>
      <div className="settings-container">
        <div className="settings-header">
          <h1>Account Settings</h1>
          <p>Manage your account contact, security credentials and privacy options.</p>
        </div>

        {/* ACCOUNT SECTION */}
        <div className="settings-card">
          <h3 className="settings-card-title">👤 Account Contact Information</h3>
          {msgAccount.text && (
            <div className={`alert-message ${msgAccount.type}`} style={{ marginBottom: "16px" }}>
              {msgAccount.text}
            </div>
          )}
          <form onSubmit={handleAccountUpdate}>
            <div className="settings-form">
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={accountData.email}
                  onChange={(e) => setAccountData({ ...accountData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Primary Phone Number</label>
                <input
                  type="text"
                  value={accountData.phone}
                  onChange={(e) => setAccountData({ ...accountData, phone: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn-settings-save">
              Update Account Details
            </button>
          </form>
        </div>

        {/* SECURITY SECTION */}
        <div className="settings-card">
          <h3 className="settings-card-title">🔒 Security & Password</h3>
          {msgPassword.text && (
            <div className={`alert-message ${msgPassword.type}`} style={{ marginBottom: "16px" }}>
              {msgPassword.text}
            </div>
          )}
          <form onSubmit={handlePasswordChange}>
            <div className="settings-form">
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={passwordData.old_password}
                  onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <button type="submit" className="btn-settings-save">
              Change Password
            </button>
          </form>
        </div>

        {/* PRIVACY SECTION */}
        <div className="settings-card">
          <h3 className="settings-card-title">🛡️ Privacy & Session</h3>

          <div className="privacy-toggle-row">
            <div className="privacy-info">
              <h4>Public Profile Status</h4>
              <p>Your profile is managed under the admin verification workflow.</p>
            </div>
            <span style={{ fontSize: "12px", color: "var(--primary)", fontWeight: "600" }}>
              Verified by Admin
            </span>
          </div>

          <div className="privacy-toggle-row">
            <div className="privacy-info">
              <h4>Log Out of Session</h4>
              <p>End your current session on this device.</p>
            </div>
            <button className="btn-logout-danger" onClick={() => setShowLogoutModal(true)}>
              Logout
            </button>
          </div>
        </div>

        {/* LOGOUT CONFIRMATION MODAL */}
        {showLogoutModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Confirm Logout</h3>
              <p>Are you sure you want to log out of your client account?</p>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowLogoutModal(false)}>
                  Cancel
                </button>
                <button className="btn-logout-danger" onClick={confirmLogout}>
                  Yes, Log Me Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
