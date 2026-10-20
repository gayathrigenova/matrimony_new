import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../../api.js";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import ProtectedImage from "../../components/ProtectedImage";
import "./MyPhotos.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function errorMessage(data, statusCode) {
  return data?.detail || data?.message || `Request failed (HTTP ${statusCode}).`;
}

export default function MyPhotos() {
  const navigate = useNavigate();
  const [photoSlots, setPhotoSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [workingSlot, setWorkingSlot] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });

  const token = localStorage.getItem("access_token");

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${API_URL}/registrations/photos/`);
      const data = await readApiResponse(response);
      if (!response.ok) {
        if (response.status === 401) {
          navigate("/login");
          return false;
        }
        throw new Error(errorMessage(data, response.status));
      }
      setPhotoSlots(Array.isArray(data) ? data : []);
      return true;
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to load your saved photos." });
      return false;
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    const timer = setTimeout(fetchPhotos, 0);
    return () => clearTimeout(timer);
  }, [token, navigate, fetchPhotos]);

  const uploadFiles = async (files, slotIndices) => {
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setMessage({ type: "error", text: "Choose image files only." });
      return;
    }
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setMessage({ type: "error", text: "Each image must be smaller than 5 MB." });
      return;
    }

    setMessage({ type: "", text: "" });
    setUploadProgress({ completed: 0, total: files.length });
    let completed = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const formData = new FormData();
        formData.append("slot_index", String(slotIndices[index]));
        formData.append("photo", files[index]);

        const response = await fetchWithTokenRefresh(`${API_URL}/registrations/photos/upload/`, {
          method: "POST",
          body: formData,
        });
        const data = await readApiResponse(response);
        if (!response.ok) throw new Error(errorMessage(data, response.status));

        if (data?.photo) {
          setPhotoSlots((current) => current.map((slot) => (
            slot.slot_index === data.photo.slot_index ? data.photo : slot
          )));
        }
        completed += 1;
        setUploadProgress({ completed, total: files.length });
      }

      await fetchPhotos();
      setMessage({
        type: "success",
        text: `${completed} photo${completed === 1 ? "" : "s"} uploaded successfully. Published-profile changes are shown as pending until admin review.`,
      });
    } catch (error) {
      if (completed > 0) await fetchPhotos();
      setMessage({
        type: "error",
        text: completed
          ? `Uploaded ${completed} of ${files.length} photos. The next upload failed: ${error.message}`
          : error.message || "Photo upload failed.",
      });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleFileUpload = (event, slotIndex) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadFiles([file], [slotIndex]);
  };

  const handleMultipleUpload = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const emptySlots = photoSlots
      .filter((slot) => !slot.photo_url && !slot.pending_photo_url)
      .map((slot) => slot.slot_index);
    if (files.length > emptySlots.length) {
      setMessage({
        type: "error",
        text: `Only ${emptySlots.length} empty slot${emptySlots.length === 1 ? " is" : "s are"} available. Remove or replace a photo before adding more.`,
      });
      return;
    }
    uploadFiles(files, emptySlots.slice(0, files.length));
  };

  const handlePhotoAction = async (slotIndex, action) => {
    if (action === "delete" && !window.confirm("Are you sure you want to delete this photo?")) return;
    setWorkingSlot(slotIndex);
    setMessage({ type: "", text: "" });
    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/registrations/photos/${slotIndex}/${action}/`,
        { method: action === "delete" ? "DELETE" : "POST" },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      await fetchPhotos();
      setMessage({ type: "success", text: data?.message || (action === "delete" ? "Photo deleted successfully." : "Main photo updated successfully.") });
    } catch (error) {
      setMessage({ type: "error", text: error.message || `Unable to ${action} photo.` });
    } finally {
      setWorkingSlot(null);
    }
  };

  const availableSlots = photoSlots.filter((slot) => !slot.photo_url && !slot.pending_photo_url).length;

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
          <div className={`alert-message ${message.type}`} role={message.type === "error" ? "alert" : "status"} style={{ marginBottom: "20px" }}>
            {message.text}
          </div>
        )}

        <div className="gallery-batch-upload">
          <label className="btn-upload-label">
            Add multiple photos ({availableSlots} slots available)
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleMultipleUpload}
              disabled={Boolean(uploadProgress) || availableSlots === 0}
            />
          </label>
          {uploadProgress && (
            <span role="status">
              {uploadProgress.completed === uploadProgress.total
                ? "Finishing uploads..."
                : `Uploading photo ${uploadProgress.completed + 1} of ${uploadProgress.total}...`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading photo gallery...</p>
          </div>
        ) : (
          <div className="photos-grid">
            {photoSlots.map((slot) => {
              const displayPhoto = slot.pending_photo_url || slot.photo_url;
              const busy = Boolean(uploadProgress) || workingSlot === slot.slot_index;
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
                        {slot.pending_photo_url ? (
                          <ProtectedImage src={slot.pending_photo_url} alt={`Slot ${slot.slot_index}`} />
                        ) : (
                          <img src={displayPhoto} alt={`Slot ${slot.slot_index}`} />
                        )}
                        {(slot.pending_photo_url || slot.status === "PENDING") && (
                          <div className="pending-photo-overlay">⏳ Pending Admin Verification</div>
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
                      {uploadProgress
                        ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}...`
                        : displayPhoto
                        ? "Replace Photo"
                        : "Upload Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(event) => handleFileUpload(event, slot.slot_index)}
                        disabled={busy}
                      />
                    </label>

                    {displayPhoto && (
                      <div className="photo-secondary-actions">
                        {!slot.is_main && slot.photo_url && (
                          <button
                            className="btn-slot-action"
                            onClick={() => handlePhotoAction(slot.slot_index, "set-main")}
                            disabled={busy}
                          >
                            Set Main
                          </button>
                        )}
                        <button
                          className="btn-slot-action delete"
                          onClick={() => handlePhotoAction(slot.slot_index, "delete")}
                          disabled={busy}
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
