import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./MyProfile.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function MyProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    fetch(`${API_URL}/registrations/my-profile/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.clear();
            navigate("/login");
            return;
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Unable to load profile information.");
        }
        return res.json();
      })
      .then((data) => {
        setProfile(data);
      })
      .catch((err) => {
        setError(err.message || "Failed to load profile.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, navigate]);

  if (loading) {
    return (
      <ClientLayout>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading your profile details...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !profile) {
    return (
      <ClientLayout>
        <div className="dashboard-error">
          <div className="error-box">
            <h2>Unable to Load Profile</h2>
            <p>{error || "Profile information is currently unavailable."}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  const getStatusClass = (status) => {
    return (status || "pending").toLowerCase();
  };

  const formatStatus = (status) => {
    switch (status) {
      case "PUBLISHED": return "Published";
      case "APPROVED": return "Approved";
      case "UNDER_REVIEW": return "Under Review";
      case "CORRECTION_REQUIRED": return "Correction Required";
      case "REJECTED": return "Rejected";
      default: return "Pending Verification";
    }
  };

  return (
    <ClientLayout>
      <div className="my-profile-container">
        {/* HEADER CARD */}
        <div className="profile-header-card">
          <div className="profile-header-left">
            <div className="profile-header-avatar">
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt={profile.full_name} />
              ) : (
                profile.full_name?.charAt(0)?.toUpperCase() || "U"
              )}
            </div>
            <div className="profile-header-info">
              <h1>{profile.full_name}</h1>
              <div className="profile-matrimony-id">
                Matrimony ID: <strong>{profile.matrimony_id || "Pending Assignment"}</strong>
              </div>
              <div className="profile-badges">
                <span className={`badge-status ${getStatusClass(profile.status)}`}>
                  {formatStatus(profile.status)}
                </span>
              </div>
            </div>
          </div>
          <button
            className="edit-profile-btn"
            onClick={() => navigate("/profile/edit")}
          >
            <span>✎</span> Edit Profile
          </button>
        </div>

        {/* CORRECTION REQUIRED ALERT BOX */}
        {profile.status === "CORRECTION_REQUIRED" && (
          <div className="correction-alert-box">
            <div className="correction-alert-title">
              <span>⚠️</span> Action Required: Admin Correction Message
            </div>
            <div className="correction-alert-message">
              {profile.correction_reason || "The admin team requested corrections to your profile information before approval."}
            </div>
          </div>
        )}

        {/* PERSONAL DETAILS */}
        <div className="profile-section-card">
          <h3 className="section-card-title">👤 Personal Details</h3>
          <div className="details-grid">
            <DetailItem label="Full Name" value={profile.full_name} />
            <DetailItem label="Matrimony ID" value={profile.matrimony_id} />
            <DetailItem label="Age" value={profile.age ? `${profile.age} Years` : null} />
            <DetailItem label="Gender" value={profile.gender} />
            <DetailItem label="Date of Birth" value={profile.date_of_birth} />
            <DetailItem label="Religion" value={profile.religion} />
            <DetailItem label="Caste" value={profile.caste} />
            <DetailItem label="Marital Status" value={profile.marital_status} />
            <DetailItem label="Height" value={profile.height} />
            <DetailItem label="Disability" value={profile.disability} />
          </div>
        </div>

        {/* ABOUT ME */}
        {profile.about && (
          <div className="profile-section-card">
            <h3 className="section-card-title">✍️ About Profile</h3>
            <div className="about-text">{profile.about}</div>
          </div>
        )}

        {/* LOCATION & ADDRESS */}
        <div className="profile-section-card">
          <h3 className="section-card-title">📍 Location Details</h3>
          <div className="details-grid">
            <DetailItem label="City" value={profile.city} />
            <DetailItem label="District" value={profile.district} />
            <DetailItem label="State" value={profile.state} />
            <DetailItem label="Address" value={profile.address} />
            <DetailItem label="Native Place" value={profile.place} />
            <DetailItem label="House Name" value={profile.house_name} />
          </div>
        </div>

        {/* EDUCATION & CAREER */}
        <div className="profile-section-card">
          <h3 className="section-card-title">🎓 Education & Occupation</h3>
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
        <div className="profile-section-card">
          <h3 className="section-card-title">👨‍👩‍👧‍👦 Family Details</h3>
          <div className="details-grid">
            <DetailItem label="Father's Name" value={profile.father_name} />
            <DetailItem label="Father's Occupation" value={profile.father_occupation} />
            <DetailItem label="Mother's Name" value={profile.mother_name} />
            <DetailItem label="Mother's Occupation" value={profile.mother_occupation} />
            <DetailItem label="Brothers" value={profile.brothers !== undefined ? `${profile.brothers} (Married: ${profile.married_brothers || 0})` : null} />
            <DetailItem label="Sisters" value={profile.sisters !== undefined ? `${profile.sisters} (Married: ${profile.married_sisters || 0})` : null} />
            <DetailItem label="Financial Level" value={profile.financial_level} />
          </div>
          {profile.about_family && (
            <div style={{ marginTop: "16px" }}>
              <DetailItem label="About Family" value={profile.about_family} />
            </div>
          )}
        </div>

        {/* CONTACT INFORMATION */}
        <div className="profile-section-card">
          <h3 className="section-card-title">📞 Contact Details</h3>
          <div className="details-grid">
            <DetailItem label="Phone Number" value={profile.phone} />
            <DetailItem label="Alternate Phone" value={profile.alternate_phone} />
            <DetailItem label="Contact Person Name" value={profile.contact_name} />
            <DetailItem label="Relationship" value={profile.relationship} />
            <DetailItem label="Contact Person Phone" value={profile.contact_phone ? `${profile.country_code || '+91'} ${profile.contact_phone}` : null} />
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
