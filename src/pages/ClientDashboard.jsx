import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../api.js";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ClientDashboard.css";
import ClientLayout from "../components/ClientLayout";
import ProtectedImage from "../components/ProtectedImage";


export default function ClientDashboard() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [photos, setPhotos] = useState([
    null,
    null,
    null,
    null,
  ]);

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [horoscopeBusy, setHoroscopeBusy] = useState(false);
  const [horoscopeMessage, setHoroscopeMessage] = useState("");

  const token = localStorage.getItem("access_token");

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    fetchWithTokenRefresh(`${API_URL}/registrations/my-profile/`, {
      method: "GET",
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("user");
            window.dispatchEvent(new Event("auth-change"));

            navigate("/login");
            return;
          }

          const data = await readApiResponse(response);
          throw new Error(data.detail || `Failed to load profile (HTTP ${response.status}).`);
        }

        const data = await readApiResponse(response);
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
        console.error("Profile error:", error.message);
        setProfileError(error.message || "Unable to load your profile.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, navigate]);

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

  const handleHoroscopeUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!/\.jpe?g$/i.test(file.name)) {
      setHoroscopeMessage("Choose a JPG or JPEG file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setHoroscopeMessage("The JPG horoscope file must be smaller than 5 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("horoscope_file", file);
    setHoroscopeBusy(true);
    setHoroscopeMessage("");
    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/registrations/my-profile/horoscope/`,
        { method: "POST", body: formData },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.detail || "Unable to upload the horoscope file.");
      setProfile((currentProfile) => ({
        ...currentProfile,
        horoscope_file_url: `${data.horoscope_file_url}?updated=${Date.now()}`,
      }));
      setHoroscopeMessage("Horoscope file uploaded successfully.");
    } catch (error) {
      setHoroscopeMessage(error.message || "Unable to upload the horoscope file.");
    } finally {
      setHoroscopeBusy(false);
    }
  };

  const handleHoroscopeRemove = async () => {
    setHoroscopeBusy(true);
    setHoroscopeMessage("");
    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/registrations/my-profile/horoscope/`,
        { method: "DELETE" },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.detail || "Unable to remove the horoscope file.");
      setProfile((currentProfile) => ({
        ...currentProfile,
        horoscope_file_url: null,
      }));
      setHoroscopeMessage("Horoscope file removed.");
    } catch (error) {
      setHoroscopeMessage(error.message || "Unable to remove the horoscope file.");
    } finally {
      setHoroscopeBusy(false);
    }
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
      <ClientLayout>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading your dashboard...</p>
        </div>
      </ClientLayout>
    );
  }
  /* =========================================================
     ERROR
  ========================================================= */

  if (!profile) {
    return (
      <ClientLayout>
        <div className="dashboard-error">
          <div className="error-box">
            <h2>Unable to load profile</h2>

            <p>{profileError || "We couldn't load your profile details."}</p>

            <button type="button" onClick={() => navigate("/profile/edit")}>Open Profile Details</button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  const completion = calculateProfileCompletion();

  return (
    <ClientLayout>


          {/* =================================================
              WELCOME
          ================================================= */}

          <div className="welcome-section dashboard-profile-banner">

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
              PHOTOS + HOROSCOPE
          ================================================= */}

          <div className="dashboard-two-column">

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

            <section className="dashboard-panel horoscope-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Horoscope
                  </h3>

                  <p>
                    Your horoscope information
                  </p>

                </div>

              </div>

              <div className="horoscope-content">
                {profile.horoscope_file_url ? (
                  <ProtectedImage
                    src={profile.horoscope_file_url}
                    alt="Your horoscope"
                    className="horoscope-image"
                  />
                ) : (
                  <p className="horoscope-empty-message">
                    Upload your horoscope as a JPG or JPEG file.
                  </p>
                )}

                <div className="horoscope-actions">
                  <label className={`panel-action horoscope-upload-button ${horoscopeBusy ? "disabled" : ""}`}>
                    {profile.horoscope_file_url ? "Replace JPG" : "Upload JPG"}
                    <input
                      type="file"
                      accept=".jpg,.jpeg,image/jpeg"
                      hidden
                      onChange={handleHoroscopeUpload}
                      disabled={horoscopeBusy}
                    />
                  </label>
                  {profile.horoscope_file_url && (
                    <button
                      type="button"
                      className="panel-action horoscope-remove-button"
                      onClick={handleHoroscopeRemove}
                      disabled={horoscopeBusy}
                    >
                      Remove
                    </button>
                  )}
                  {horoscopeBusy && <span role="status">Saving...</span>}
                </div>
                {horoscopeMessage && (
                  <p className="horoscope-message" role="status">
                    {horoscopeMessage}
                  </p>
                )}
              </div>

            </section>

          </div>

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

    </ClientLayout>
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
