import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../../api.js";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import ProtectedImage from "../../components/ProtectedImage";
import ProtectedFileLink from "../../components/ProtectedFileLink";
import "./MyProfile.css";


export default function MyProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("access_token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    fetchWithTokenRefresh(`${API_URL}/registrations/my-profile/`, {
      method: "GET",
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.clear();
            window.dispatchEvent(new Event("auth-change"));
            navigate("/login");
            return;
          }
          const errData = await readApiResponse(res);
          throw new Error(errData.detail || `Unable to load profile information (HTTP ${res.status}).`);
        }
        return readApiResponse(res);
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

  const fieldLabels = {
    full_name: "Full Name",
    gender: "Gender",
    date_of_birth: "Date of Birth",
    religion: "Religion",
    caste: "Caste",
    birth_star: "Birth Star",
    marital_status: "Marital Status",
    height: "Height",
    disability: "Disability",
    address: "Address",
    city: "City",
    district: "District",
    state: "State",
    education_level: "Education Level",
    education: "Education",
    highest_education: "Highest Education",
    occupation_level: "Occupation Level",
    occupation: "Occupation",
    company: "Company",
    income: "Annual Income",
    work_location: "Work Location",
    working_place: "Working Place",
    phone: "Phone Number",
    alternate_phone: "Alternate Phone",
    email: "Email Address",
    about: "About",
    father_name: "Father's Name",
    father_occupation: "Father's Occupation",
    mother_name: "Mother's Name",
    mother_occupation: "Mother's Occupation",
    brothers: "Brothers",
    married_brothers: "Married Brothers",
    sisters: "Sisters",
    married_sisters: "Married Sisters",
    financial_level: "Financial Level",
    about_family: "About Family",
    place: "Native Place",
    house_name: "House Name",
    bus_stop: "Bus Stop",
    post_office: "Post Office",
    taluk: "Taluk",
    village: "Village",
    contact_name: "Contact Person",
    relationship: "Relationship",
    country_code: "Country Code",
    contact_phone: "Contact Phone",
    extra_phone: "Additional Phone",
    profile_photo: "Profile Photo",
    identity_document: "Identity Document",
    additional_document: "Additional Document",
    horoscope_file: "Horoscope",
    gallery_photo: "Gallery Photo",
  };
  const changedFields = profile.changed_fields || [];

  return (
    <ClientLayout>
      <div className="my-profile-container">
        {location.state?.success && (
          <div className="alert-message success" role="status">{location.state.success}</div>
        )}
        {/* HEADER CARD */}
        <div className="profile-header-card">
          <div className="profile-header-left">
            <div className="profile-header-avatar">
              {profile.profile_photo_url ? (
                <ProtectedImage src={profile.profile_photo_url} alt={profile.full_name} />
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
                <span className="contact-credit-balance" role="status">
                  <strong>{profile.contacts_remaining ?? 0}</strong> Contacts Remaining
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

        {changedFields.length > 0 && (
          <section className={`profile-change-summary ${profile.status === "REJECTED" ? "rejected" : ""}`}>
            <h2>
              {profile.status === "REJECTED"
                ? "Last profile changes were rejected"
                : profile.status === "CORRECTION_REQUIRED"
                  ? "Changes requiring correction"
                  : "Profile changes awaiting admin approval"}
            </h2>
            <p>
              {profile.status === "UNDER_REVIEW"
                ? "Your approved profile remains unchanged until the admin approves these updates."
                : profile.status === "REJECTED"
                  ? `The previous approved information is still active. ${profile.rejection_reason || ""}`
                  : "Review the previous and proposed values below."}
            </p>
            <div className="profile-change-list">
              {changedFields.map((change, index) => (
                <div
                  className="profile-change-item"
                  key={`${change.field_name}-${change.slot_index ?? index}`}
                >
                  <strong className="profile-change-label">
                    {change.field_name === "gallery_photo"
                      ? `${fieldLabels.gallery_photo} ${change.slot_index}`
                      : fieldLabels[change.field_name] || change.field_name}
                  </strong>
                  <div className="profile-change-values">
                    <ChangeValue change={change} side="old" />
                    <span className="profile-change-arrow" aria-hidden="true">→</span>
                    <ChangeValue change={change} side="new" />
                  </div>
                </div>
              ))}
            </div>
          </section>
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
            <DetailItem label="Birth Star" value={profile.birth_star} />
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
            <DetailItem label="Email Address" value={profile.email} />
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}

function ChangeValue({ change, side }) {
  const value = change[`${side}_value`];
  const url = change[`${side}_value_url`];
  const fieldName = change.field_name;
  const isImage = fieldName === "profile_photo" || fieldName === "gallery_photo";
  const isDocument = [
    "identity_document",
    "additional_document",
    "horoscope_file",
  ].includes(fieldName);

  return (
    <div className={`profile-change-value ${side}`}>
      <span>{side === "old" ? "Previous" : "Proposed"}</span>
      {url && isImage ? (
        <ProtectedImage src={url} alt={`${side} ${fieldName.replaceAll("_", " ")}`} />
      ) : url && isDocument ? (
        <ProtectedFileLink href={url}>{value || "View file"}</ProtectedFileLink>
      ) : side === "old" ? (
        <del>{value === null || value === "" ? "Not provided" : String(value)}</del>
      ) : (
        <strong>{value === null || value === "" ? "Removed" : String(value)}</strong>
      )}
    </div>
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
