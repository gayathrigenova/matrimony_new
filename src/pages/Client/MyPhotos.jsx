import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./MyPhotos.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function MyPhotos() {
  const navigate = useNavigate();
  const [photoSlots, setPhotoSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const token = localStorage.getItem("access_token");

  const fetchPhotos = () => {
    setLoading(true);
    fetch(`${API_URL}/registrations/photos/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load photos.");
        return res.json();
      })
      .then((data) => {
        setPhotoSlots(data || []);
      })
      .catch((err) => {
        setMessage({ type: "error", text: err.message });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchPhotos();
  }, [token, navigate]);

  const handleFileUpload = (e, slotIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5 MB.");
      return;
    }

    setUploadingSlot(slotIndex);
    setMessage({ type: "", text: "" });

    const formData = new FormData();
    formData.append("slot_index", slotIndex);
    formData.append("photo", file);

    fetch(`${API_URL}/registrations/photos/upload/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Photo upload failed.");
        setMessage({ type: "success", text: data.message || "Photo uploaded successfully." });
        fetchPhotos();
      })
      .catch((err) => {
        setMessage({ type: "error", text: err.message });
      })
      .finally(() => setUploadingSlot(null));
  };

  const handleSetMain = (slotIndex) => {
    setMessage({ type: "", text: "" });
    fetch(`${API_URL}/registrations/photos/${slotIndex}/set-main/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to set main photo.");
        setMessage({ type: "success", text: "Main photo updated successfully." });
        fetchPhotos();
      })
      .catch((err) => setMessage({ type: "error", text: err.message }));
  };

  const handleDelete = (slotIndex) => {
    if (!window.confirm("Are you sure you want to delete this photo?")) return;
    setMessage({ type: "", text: "" });

    fetch(`${API_URL}/registrations/photos/${slotIndex}/delete/`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to delete photo.");
        setMessage({ type: "success", text: "Photo deleted successfully." });
        fetchPhotos();
      })
      .catch((err) => setMessage({ type: "error", text: err.message }));
  };

  return (
    <ClientLayout>
      <div className="my-photos-container">
        <div className="photos-header">
          <h1>My Photos</h1>
          <p>Upload up to 4 photos to increase your profile interest rates.</p>
        </div>

        <div className="photos-notice">
          📸 <strong>Photo Guidelines & Verification:</strong>
          <ul>
            <li>You can upload up to 4 high quality profile photos (Max 5MB each).</li>
            <li>Photo 1 is set as your Primary Main Profile Photo.</li>
            <li>If your profile is already published, new or replaced photo uploads undergo admin review before replacing your live public photo.</li>
          </ul>
        </div>

        {message.text && (
          <div className={`alert-message ${message.type}`} style={{ marginBottom: "20px" }}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading photo gallery...</p>
          </div>
        ) : (
          <div className="photos-grid">
            {photoSlots.map((slot) => {
              const displayPhoto = slot.photo_url || slot.pending_photo_url;
              return (
                <div key={slot.slot_index} className="photo-slot-card">
                  <div className="photo-slot-header">
                    <span className="slot-title">
                      {slot.slot_index === 1 ? "Photo 1 - Main Photo" : `Photo ${slot.slot_index}`}
                    </span>
                    {slot.is_main && <span className="badge-main">Main</span>}
                  </div>

                  <div className="photo-display-area">
                    {displayPhoto ? (
                      <>
                        <img src={displayPhoto} alt={`Slot ${slot.slot_index}`} />
                        {slot.pending_photo_url && (
                          <div className="pending-photo-overlay">
                            ⏳ Pending Admin Verification
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty-slot-placeholder">
                        <div className="empty-slot-icon">📷</div>
                        <span>Empty Slot</span>
                      </div>
                    )}
                  </div>

                  <div className="photo-slot-actions">
                    <label className="btn-upload-label">
                      {uploadingSlot === slot.slot_index
                        ? "Uploading..."
                        : displayPhoto
                        ? "Replace Photo"
                        : "Upload Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleFileUpload(e, slot.slot_index)}
                        disabled={uploadingSlot === slot.slot_index}
                      />
                    </label>

                    {displayPhoto && (
                      <div className="photo-secondary-actions">
                        {!slot.is_main && slot.photo_url && (
                          <button
                            className="btn-slot-action"
                            onClick={() => handleSetMain(slot.slot_index)}
                          >
                            Set Main
                          </button>
                        )}
                        <button
                          className="btn-slot-action delete"
                          onClick={() => handleDelete(slot.slot_index)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
