import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./ProfileDetails.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function ProfileDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFeedback, setActionFeedback] = useState({ type: "", text: "" });

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    // Fetch published profile details
    fetch(`${API_URL}/registrations/published/${id}/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("This profile is not publicly available.");
        }
        return res.json();
      })
      .then((data) => {
        setProfile(data);

        // Record profile view
        if (token) {
          fetch(`${API_URL}/registrations/${id}/view/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load profile details.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, token]);

  const handleSendInterest = () => {
    setActionFeedback({ type: "", text: "" });
    fetch(`${API_URL}/registrations/${id}/interest/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Unable to send interest.");
        }
        setActionFeedback({ type: "success", text: "Interest sent successfully." });
      })
      .catch((err) => {
        setActionFeedback({ type: "error", text: err.message });
      });
  };

  const handleShortlist = () => {
    setActionFeedback({ type: "", text: "" });
    fetch(`${API_URL}/registrations/${id}/shortlist/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Unable to shortlist profile.");
        }
        setActionFeedback({ type: "success", text: "Profile added to shortlist." });
      })
      .catch((err) => {
        setActionFeedback({ type: "error", text: err.message });
      });
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading profile details...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !profile) {
    return (
      <ClientLayout>
        <div className="dashboard-error">
          <div className="error-box">
            <h2>Profile Unavailable</h2>
            <p>{error || "Only published profiles can be viewed."}</p>
            <button onClick={() => navigate("/search-matches")}>Back to Search</button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="profile-details-page">
        <div className="details-top-bar">
          <button className="btn-back" onClick={() => navigate(-1)}>
            ← Back to Matches
          </button>
        </div>

        {actionFeedback.text && (
          <div
            className={`alert-message ${actionFeedback.type}`}
            style={{ marginBottom: "20px" }}
          >
            {actionFeedback.text}
          </div>
        )}

        {/* HEADER CARD */}
        <div className="details-header-card">
          <div className="details-header-left">
            <div className="details-avatar">
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt={profile.full_name} />
              ) : (
                profile.full_name?.charAt(0)?.toUpperCase() || "U"
              )}
            </div>
            <div className="details-header-info">
              <h1>{profile.full_name}</h1>
              <div className="details-matrimony-id">
                Matrimony ID: {profile.matrimony_id || "WN-Pending"}
              </div>
              <div className="details-quick-tags">
                {profile.age && <span className="profile-tag">{profile.age} Years</span>}
                {profile.gender && <span className="profile-tag">{profile.gender}</span>}
                {profile.religion && <span className="profile-tag">{profile.religion}</span>}
                {profile.caste && <span className="profile-tag">{profile.caste}</span>}
              </div>
            </div>
          </div>

          <div className="details-header-actions">
            <button className="btn-action-primary" onClick={handleSendInterest}>
              ♡ Send Interest
            </button>
            <button className="btn-action-secondary" onClick={handleShortlist}>
              ☆ Shortlist
            </button>
          </div>
        </div>

        {/* PERSONAL DETAILS */}
        <div className="section-box">
          <h3 className="section-box-title">👤 Personal Details</h3>
          <div className="details-grid">
            <DetailItem label="Full Name" value={profile.full_name} />
            <DetailItem label="Matrimony ID" value={profile.matrimony_id} />
            <DetailItem label="Age" value={profile.age ? `${profile.age} Years` : null} />
            <DetailItem label="Gender" value={profile.gender} />
            <DetailItem label="Religion" value={profile.religion} />
            <DetailItem label="Caste" value={profile.caste} />
            <DetailItem label="Marital Status" value={profile.marital_status} />
            <DetailItem label="Height" value={profile.height} />
            <DetailItem label="Disability" value={profile.disability} />
          </div>
        </div>

        {/* ABOUT ME */}
        {profile.about && (
          <div className="section-box">
            <h3 className="section-box-title">✍️ About Profile</h3>
            <div className="about-text">{profile.about}</div>
          </div>
        )}

        {/* LOCATION DETAILS */}
        <div className="section-box">
          <h3 className="section-box-title">📍 Location Details</h3>
          <div className="details-grid">
            <DetailItem label="City" value={profile.city} />
            <DetailItem label="District" value={profile.district} />
            <DetailItem label="State" value={profile.state} />
            <DetailItem label="Native Place" value={profile.place} />
          </div>
        </div>

        {/* EDUCATION & CAREER */}
        <div className="section-box">
          <h3 className="section-box-title">🎓 Education & Occupation</h3>
          <div className="details-grid">
            <DetailItem label="Education Level" value={profile.education_level} />
            <DetailItem label="Education" value={profile.education} />
            <DetailItem label="Highest Education" value={profile.highest_education} />
            <DetailItem label="Occupation Level" value={profile.occupation_level} />
            <DetailItem label="Occupation" value={profile.occupation} />
            <DetailItem label="Company" value={profile.company} />
            <DetailItem label="Annual Income" value={profile.income} />
            <DetailItem label="Work Location" value={profile.work_location || profile.working_place} />
          </div>
        </div>

        {/* FAMILY DETAILS */}
        <div className="section-box">
          <h3 className="section-box-title">👨‍👩‍👧‍👦 Family Information</h3>
          <div className="details-grid">
            <DetailItem label="Father's Name" value={profile.father_name} />
            <DetailItem label="Father's Occupation" value={profile.father_occupation} />
            <DetailItem label="Mother's Name" value={profile.mother_name} />
            <DetailItem label="Mother's Occupation" value={profile.mother_occupation} />
            <DetailItem label="Brothers" value={profile.brothers !== undefined ? `${profile.brothers} (Married: ${profile.married_brothers || 0})` : null} />
            <DetailItem label="Sisters" value={profile.sisters !== undefined ? `${profile.sisters} (Married: ${profile.married_sisters || 0})` : null} />
            <DetailItem label="Financial Level" value={profile.financial_level} />
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "Not Specified"}</strong>
    </div>
  );
}
