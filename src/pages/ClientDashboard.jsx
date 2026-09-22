import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ClientDashboard.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function ClientDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [photos, setPhotos] = useState([
    null,
    null,
    null,
    null,
  ]);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const token = localStorage.getItem("access_token");

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

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
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("user");

            navigate("/login");
            return;
          }

          throw new Error(
            data.detail || "Failed to load profile"
          );
        }

        setProfile(data);

        if (data.profile_photo_url) {
          setPhotos([
            data.profile_photo_url,
            null,
            null,
            null,
          ]);
        }
      })
      .catch((error) => {
        console.error("Profile error:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, navigate]);

  /* =========================================================
     LOGOUT
  ========================================================= */

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");

    navigate("/login");
  };

  /* =========================================================
     PHOTO SELECT
  ========================================================= */

  const handlePhotoSelect = (event, index) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5 MB.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setPhotos((previousPhotos) => {
      const updatedPhotos = [...previousPhotos];

      if (
        updatedPhotos[index] &&
        updatedPhotos[index].startsWith("blob:")
      ) {
        URL.revokeObjectURL(updatedPhotos[index]);
      }

      updatedPhotos[index] = previewUrl;

      return updatedPhotos;
    });

    event.target.value = "";
  };

  /* =========================================================
     REMOVE PHOTO
  ========================================================= */

  const handleRemovePhoto = (index) => {
    const currentPhoto = photos[index];

    if (
      currentPhoto &&
      currentPhoto.startsWith("blob:")
    ) {
      URL.revokeObjectURL(currentPhoto);
    }

    setPhotos((previousPhotos) => {
      const updatedPhotos = [...previousPhotos];
      updatedPhotos[index] = null;
      return updatedPhotos;
    });

    if (selectedPhoto === currentPhoto) {
      setSelectedPhoto(null);
    }
  };

  /* =========================================================
     OPEN PHOTO
  ========================================================= */

  const handleOpenPhoto = (photo) => {
    if (!photo) return;

    setSelectedPhoto(photo);
  };

  /* =========================================================
     CLOSE PHOTO
  ========================================================= */

  const handleClosePhoto = () => {
    setSelectedPhoto(null);
  };

  /* =========================================================
     STATUS MESSAGE
  ========================================================= */

  const getStatusMessage = () => {
    switch (profile?.status) {
      case "PUBLISHED":
        return "Your profile is visible to other members.";

      case "APPROVED":
        return "Your profile has been approved by our team.";

      case "CORRECTION_REQUIRED":
        return "Please make the required corrections.";

      case "UNDER_REVIEW":
        return "Your profile is currently under review.";

      case "REJECTED":
        return "Your profile has been rejected. Please contact us.";

      default:
        return "Your profile is waiting for admin verification.";
    }
  };

  /* =========================================================
     STATUS CLASS
  ========================================================= */

  const getStatusClass = () => {
    return (
      profile?.status?.toLowerCase() || "pending"
    );
  };

  /* =========================================================
     PROFILE COMPLETION
  ========================================================= */

  const calculateProfileCompletion = () => {
    if (!profile) return 0;

    const fields = [
      profile.full_name,
      profile.gender,
      profile.date_of_birth,
      profile.religion,
      profile.caste,
      profile.height,
      profile.education,
      profile.occupation,
      profile.city,
      profile.district,
      profile.about,
      profile.profile_photo_url,
    ];

    const completed = fields.filter(
      (field) => field
    ).length;

    return Math.round(
      (completed / fields.length) * 100
    );
  };

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  /* =========================================================
     ERROR
  ========================================================= */

  if (!profile) {
    return (
      <div className="dashboard-error">
        <div className="error-box">
          <h2>Unable to load profile</h2>

          <p>
            We couldn't load your profile details.
          </p>

          <button
            type="button"
            onClick={() => navigate("/login")}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const completion = calculateProfileCompletion();

  return (
    <div className="client-dashboard">

      {/* =====================================================
          MOBILE SIDEBAR OVERLAY
      ===================================================== */}

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >

        {/* NO LOGO HERE */}

        <nav className="sidebar-nav">

          <p className="nav-heading">
            MAIN MENU
          </p>

          <button
            className="nav-item active"
            onClick={() => {
              navigate("/dashboard");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▦</span>
            <span>Dashboard</span>
          </button>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/profile");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">◎</span>
            <span>My Profile</span>
          </button>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/search-matches");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">⌕</span>
            <span>Search Matches</span>
          </button>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/interests");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">♡</span>
            <span>Interests</span>
          </button>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/shortlist");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">☆</span>
            <span>Shortlist</span>
          </button>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/messages");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▱</span>
            <span>Messages</span>
          </button>

          <p className="nav-heading second-heading">
            ACCOUNT
          </p>

          <button
            className="nav-item"
            onClick={() => {
              navigate("/photos");
              setSidebarOpen(false);
            }}
          >
            <span className="nav-icon">▧</span>
            <span>My Photos</span>
          </button>

          <button
            className="nav-item"
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

            <div className="help-icon">
              ?
            </div>

            <div>
              <strong>Need Help?</strong>

              <span>
                Contact our team
              </span>
            </div>

          </div>

          <button
            className="sidebar-logout"
            onClick={handleLogout}
          >
            <span>↪</span>
            Logout
          </button>

        </div>

      </aside>

      {/* =====================================================
          MAIN AREA
      ===================================================== */}

      <div className="dashboard-main">

        {/* MOBILE MENU BUTTON */}

        <button
          type="button"
          className="dashboard-mobile-menu"
          onClick={() => setSidebarOpen(true)}
        >
          ☰
        </button>

        {/* ===================================================
            CONTENT
        =================================================== */}

        <main className="dashboard-content">

          {/* =================================================
              WELCOME
          ================================================= */}

          <div className="welcome-section">

            <div>

              <h2>
                Welcome back,{" "}
                {profile.full_name?.split(" ")[0]}!
              </h2>

              <p>
                Here's what's happening with your profile.
              </p>

            </div>

            <span className="profile-id">
              ID: {profile.matrimony_id || "Pending"}
            </span>

          </div>

          {/* =================================================
              OVERVIEW
          ================================================= */}

          <section className="overview-section">

            <div className="section-title">

              <h3>
                Profile Overview
              </h3>

              <p>
                Your account at a glance
              </p>

            </div>

            <div className="overview-grid">

              {/* PROFILE STATUS */}


              {/* PROFILE COMPLETION */}

              <div className="overview-card">

                <div className="overview-card-top">

                  {/* <div className="overview-icon completion-icon">
                    %
                  </div> */}

                  <span className="card-label">
                    Completion
                  </span>

                </div>

                <h4>
                  Profile Completion
                </h4>

                <strong>
                  {completion}%
                </strong>

                <div className="progress-bar">

                  <div
                    className="progress-fill"
                    style={{
                      width: `${completion}%`,
                    }}
                  />

                </div>

                <p>
                  Complete your profile to get better matches.
                </p>

              </div>

              {/* INTERESTS */}

              <div className="overview-card">

                <div className="overview-card-top">

                  {/* <div className="overview-icon interest-icon">
                    ♡
                  </div> */}

                  <span className="card-label">
                    Activity
                  </span>

                </div>

                <h4>
                  Interests
                </h4>

                <strong>
                  0
                </strong>

                <p>
                  Interests received from other members.
                </p>

                <button
                  className="card-link"
                  onClick={() =>
                    navigate("/interests")
                  }
                >
                  View Interests →
                </button>

              </div>

              {/* SHORTLIST */}

              <div className="overview-card">

                <div className="overview-card-top">

                  {/* <div className="overview-icon shortlist-icon">
                    ☆
                  </div> */}

                  <span className="card-label">
                    Saved
                  </span>

                </div>

                <h4>
                  Shortlisted
                </h4>

                <strong>
                  0
                </strong>

                <p>
                  Profiles you have saved for later.
                </p>

                <button
                  className="card-link"
                  onClick={() =>
                    navigate("/shortlist")
                  }
                >
                  View Shortlist →
                </button>

              </div>
                                <div className="overview-card">

                <div className="overview-card-top">


                  <span
                    className={`small-status ${getStatusClass()}`}
                  >
                    {profile.status || "PENDING"}
                  </span>

                </div>

                <h4>
                  Profile Status
                </h4>

                <strong>
                  {profile.status === "PUBLISHED"
                    ? "Published"
                    : profile.status === "APPROVED"
                    ? "Approved"
                    : profile.status === "UNDER_REVIEW"
                    ? "Under Review"
                    : profile.status === "CORRECTION_REQUIRED"
                    ? "Correction"
                    : profile.status === "REJECTED"
                    ? "Rejected"
                    : "Pending"}
                </strong>

                <p>
                  {getStatusMessage()}
                </p>

              </div>

            </div>

          </section>

          {/* =================================================
              PROFILE + PHOTOS
          ================================================= */}

          <div className="dashboard-two-column">

            {/* PROFILE CARD */}

            <section className="dashboard-panel profile-summary-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    My Profile
                  </h3>

                  <p>
                    Your basic profile information
                  </p>

                </div>

                <button
                  type="button"
                  className="panel-action"
                  onClick={() =>
                    navigate("/profile/edit")
                  }
                >
                  Edit Profile
                </button>

              </div>

              <div className="profile-summary">

                <div className="summary-photo">

                  {profile.profile_photo_url ? (

                    <img
                      src={profile.profile_photo_url}
                      alt={profile.full_name}
                      onClick={() =>
                        handleOpenPhoto(
                          profile.profile_photo_url
                        )
                      }
                    />

                  ) : (

                    <div className="summary-photo-empty">
                      {profile.full_name
                        ?.charAt(0)
                        ?.toUpperCase() || "U"}
                    </div>

                  )}

                </div>

                <div className="summary-info">

                  <h2>
                    {profile.full_name}
                  </h2>

                  <p className="summary-id">
                    Matrimony ID:{" "}
                    <strong>
                      {profile.matrimony_id || "-"}
                    </strong>
                  </p>

                  <div className="summary-details">

                    <SummaryDetail
                      label="Age"
                      value={profile.age}
                    />

                    <SummaryDetail
                      label="Gender"
                      value={profile.gender}
                    />

                    <SummaryDetail
                      label="Religion"
                      value={profile.religion}
                    />

                    <SummaryDetail
                      label="Location"
                      value={
                        profile.city ||
                        profile.district
                      }
                    />

                    <SummaryDetail
                      label="Education"
                      value={profile.education}
                    />

                    <SummaryDetail
                      label="Occupation"
                      value={profile.occupation}
                    />

                  </div>

                </div>

              </div>

            </section>

            {/* PHOTO PANEL */}

            <section className="dashboard-panel photo-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    My Photos
                  </h3>

                  <p>
                    Manage your profile photos
                  </p>

                </div>

                <button
                  type="button"
                  className="panel-action"
                  onClick={() =>
                    navigate("/dashboard/photos")
                  }
                >
                  Manage
                </button>

              </div>

              <div className="mini-photo-grid">

                {photos.map((photo, index) => (

                  <PhotoBox
                    key={index}
                    photo={photo}
                    index={index}
                    isMain={index === 0}
                    onSelect={handlePhotoSelect}
                    onRemove={handleRemovePhoto}
                    onImageClick={handleOpenPhoto}
                  />

                ))}

              </div>

              <p className="photo-note">
                Upload up to 4 profile photos. Clear,
                recent photos help you get better responses.
              </p>

            </section>

          </div>

          {/* =================================================
              PERSONAL DETAILS
          ================================================= */}

          <section className="dashboard-panel details-panel">

            <div className="panel-header">

              <div>

                <h3>
                  Personal Details
                </h3>

                <p>
                  Information visible on your profile
                </p>

              </div>

              <button
                type="button"
                className="panel-action"
                onClick={() =>
                  navigate("/dashboard/edit")
                }
              >
                Edit
              </button>

            </div>

            <div className="details-grid">

              <Detail
                label="Full Name"
                value={profile.full_name}
              />

              <Detail
                label="Gender"
                value={profile.gender}
              />

              <Detail
                label="Age"
                value={profile.age}
              />

              <Detail
                label="Religion"
                value={profile.religion}
              />

              <Detail
                label="Caste"
                value={profile.caste}
              />

              <Detail
                label="Marital Status"
                value={profile.marital_status}
              />

              <Detail
                label="Height"
                value={profile.height}
              />

              <Detail
                label="Education"
                value={profile.education}
              />

              <Detail
                label="Occupation"
                value={profile.occupation}
              />

              <Detail
                label="Company"
                value={profile.company}
              />

              <Detail
                label="Income"
                value={profile.income}
              />

              <Detail
                label="City"
                value={profile.city}
              />

              <Detail
                label="District"
                value={profile.district}
              />

              <Detail
                label="State"
                value={profile.state}
              />

            </div>

          </section>

          {/* =================================================
              ABOUT
          ================================================= */}

          {profile.about && (

            <section className="dashboard-panel about-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    About Me
                  </h3>

                  <p>
                    About your profile
                  </p>

                </div>

              </div>

              <p className="about-text">
                {profile.about}
              </p>

            </section>

          )}

          {/* =================================================
              CORRECTION
          ================================================= */}

          {profile.status === "CORRECTION_REQUIRED" &&
            profile.correction_reason && (

              <section className="correction-panel">

                <div className="correction-icon">
                  !
                </div>

                <div className="correction-content">

                  <h3>
                    Correction Required
                  </h3>

                  <p>
                    {profile.correction_reason}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate("/dashboard/edit")
                  }
                >
                  Make Corrections
                </button>

              </section>

            )}

        </main>

      </div>

      {/* =====================================================
          LARGE PHOTO MODAL
      ===================================================== */}

      {selectedPhoto && (

        <div
          className="photo-modal"
          onClick={handleClosePhoto}
        >

          <button
            type="button"
            className="photo-modal-close"
            onClick={handleClosePhoto}
          >
            ×
          </button>

          <img
            src={selectedPhoto}
            alt="Profile preview"
            className="photo-modal-image"
            onClick={(event) =>
              event.stopPropagation()
            }
          />

        </div>

      )}

    </div>
  );
}


/* =========================================================
   PHOTO BOX
========================================================= */

function PhotoBox({
  photo,
  index,
  isMain,
  onSelect,
  onRemove,
  onImageClick,
}) {
  return (
    <div
      className={`photo-box ${
        isMain ? "main-photo" : ""
      }`}
    >

      {photo ? (

        <>

          <img
            src={photo}
            alt={
              isMain
                ? "Main profile"
                : `Profile ${index + 1}`
            }
            onClick={() =>
              onImageClick(photo)
            }
            className="photo-box-image"
          />

          <button
            type="button"
            className="remove-photo-btn"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(index);
            }}
          >
            ×
          </button>

          {isMain && (
            <span className="main-photo-label">
              Main
            </span>
          )}

        </>

      ) : (

        <label className="photo-placeholder">

          <span className="upload-plus">
            +
          </span>

          <p>
            {isMain
              ? "Add Main Photo"
              : "Add Photo"}
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) =>
              onSelect(event, index)
            }
          />

        </label>

      )}

    </div>
  );
}


/* =========================================================
   SUMMARY DETAIL
========================================================= */

function SummaryDetail({
  label,
  value,
}) {
  return (
    <div className="summary-detail">

      <span>
        {label}
      </span>

      <strong>
        {value || "-"}
      </strong>

    </div>
  );
}


/* =========================================================
   PERSONAL DETAIL
========================================================= */

function Detail({
  label,
  value,
}) {
  return (
    <div className="detail-item">

      <span>
        {label}
      </span>

      <strong>
        {value || "-"}
      </strong>

    </div>
  );
}