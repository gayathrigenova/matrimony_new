import { API_URL } from "../../api.js";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import ProtectedImage from "../../components/ProtectedImage";
import ProtectedFileLink from "../../components/ProtectedFileLink";
import "./EditProfile.css";


export default function EditProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [review, setReview] = useState({ status: "PENDING", correction: "", rejection: "", profilePhoto: "", identityDocument: "", additionalDocument: "" });
  const [uploads, setUploads] = useState({ profile_photo: null, identity_document: null, additional_document: null });

  const [formData, setFormData] = useState({
    full_name: "",
    gender: "",
    date_of_birth: "",
    religion: "",
    caste: "",
    marital_status: "",
    height: "",
    disability: "No",
    address: "",
    city: "",
    district: "",
    state: "Kerala",
    education_level: "",
    education: "",
    highest_education: "",
    occupation_level: "",
    occupation: "",
    company: "",
    income: "",
    work_location: "",
    working_place: "",
    phone: "",
    alternate_phone: "",
    about: "",
    father_name: "",
    father_occupation: "",
    mother_name: "",
    mother_occupation: "",
    brothers: 0,
    married_brothers: 0,
    sisters: 0,
    married_sisters: 0,
    financial_level: "",
    about_family: "",
    place: "",
    house_name: "",
    bus_stop: "",
    post_office: "",
    taluk: "",
    village: "",
    contact_name: "",
    relationship: "",
    country_code: "+91",
    contact_phone: "",
    extra_phone: "",
  });

  const token = localStorage.getItem("access_token");

  useEffect(() => () => {
    if (profilePhotoPreview.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreview);
  }, [profilePhotoPreview]);

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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            localStorage.clear();
            window.dispatchEvent(new Event("auth-change"));
            navigate("/login");
            return;
          }
          if (res.status === 404) {
            setMessage({
              type: "info",
              text: "No saved profile was found. Complete these details and click Save Changes to create your profile for this account.",
            });
            return null;
          }
          throw new Error(data.detail || "Failed to fetch profile");
        }
        return data;
      })
      .then((data) => {
        if (!data) return;
        setReview({
          status: data.status || "PENDING",
          correction: data.correction_reason || "",
          rejection: data.rejection_reason || "",
          profilePhoto: data.pending_profile_photo_url || data.profile_photo_url || "",
          identityDocument: data.pending_identity_document_url || data.identity_document_url || "",
          additionalDocument: data.pending_additional_document_url || data.additional_document_url || "",
        });
        setFormData((current) => ({
          ...current,
          full_name: data.full_name || "",
          gender: data.gender || "",
          date_of_birth: data.date_of_birth || "",
          religion: data.religion || "",
          caste: data.caste || "",
          marital_status: data.marital_status || "",
          height: data.height || "",
          disability: data.disability || "No",
          address: data.address || "",
          city: data.city || "",
          district: data.district || "",
          state: data.state || "Kerala",
          education_level: data.education_level || "",
          education: data.education || "",
          highest_education: data.highest_education || "",
          occupation_level: data.occupation_level || "",
          occupation: data.occupation || "",
          company: data.company || "",
          income: data.income || "",
          work_location: data.work_location || "",
          working_place: data.working_place || "",
          phone: data.phone || "",
          alternate_phone: data.alternate_phone || "",
          about: data.about || "",
          father_name: data.father_name || "",
          father_occupation: data.father_occupation || "",
          mother_name: data.mother_name || "",
          mother_occupation: data.mother_occupation || "",
          brothers: data.brothers ?? 0,
          married_brothers: data.married_brothers ?? 0,
          sisters: data.sisters ?? 0,
          married_sisters: data.married_sisters ?? 0,
          financial_level: data.financial_level || "",
          about_family: data.about_family || "",
          place: data.place || "",
          house_name: data.house_name || "",
          bus_stop: data.bus_stop || "",
          post_office: data.post_office || "",
          taluk: data.taluk || "",
          village: data.village || "",
          contact_name: data.contact_name || "",
          relationship: data.relationship || "",
          country_code: data.country_code || "+91",
          contact_phone: data.contact_phone || "",
          extra_phone: data.extra_phone || "",
          ...Object.fromEntries(Object.entries(data.pending_data || {}).filter(([key]) => key in current)),
        }));
      })
      .catch((err) => {
        setMessage({ type: "error", text: err.message || "Error loading profile data." });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleUploadSelected = (event) => {
    const { name, files } = event.target;
    const file = files?.[0] || null;
    setUploads((current) => ({ ...current, [name]: file }));
    if (name === "profile_photo") {
      setProfilePhotoPreview(file ? URL.createObjectURL(file) : "");
      setProfilePhotoFailed(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const payload = new FormData();
    Object.entries(formData).forEach(([key, value]) => payload.append(key, value));
    Object.entries(uploads).forEach(([key, file]) => { if (file) payload.append(key, file); });
    try {
      const response = await fetchWithTokenRefresh(`${API_URL}/registrations/my-profile/`, {
        method: "PATCH",
        headers: {},
        body: payload,
      });
      const result = await readApiResponse(response);
      if (result?.nonJsonResponse) {
        throw new Error(getApiErrorMessage(result, response.status));
      }
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Your login session has expired. Please sign in again, then upload the image once more.");
        }
        throw new Error(getApiErrorMessage(result, response.status));
      }
      navigate("/profile?view=1", { state: { success: "Profile and uploads saved successfully." } });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to update profile." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading profile form...</p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="edit-profile-container">
        <div className="edit-profile-header">
          <div>
            <h1>Edit Profile</h1>
            <p>Update your personal, educational, family and contact information.</p>
          </div>
          <button className="btn-cancel" type="button" onClick={() => navigate("/profile?view=1")}>
            View Profile
          </button>
        </div>

        <div className="workflow-notice">
          ℹ️ <strong>Admin Verification Rule:</strong> If your profile is already published, modifying major details will place your profile under admin review for verification before changes are published.
        </div>

        <div className="workflow-notice" role="status">
          Verification status: <strong>{review.status.replaceAll("_", " ")}</strong>
          {review.correction && <p>Correction requested: {review.correction}</p>}
          {review.rejection && <p>Admin decision: {review.rejection}</p>}
        </div>

        {message.text && (
          <div className={`alert-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="edit-form-card">
            <h3 className="edit-form-title">Profile photo and documents</h3>
            <div className="profile-upload-preview">
              {profilePhotoPreview ? (
                <img
                src={profilePhotoPreview}
                alt="Selected profile photo preview"
                  onError={() => setProfilePhotoFailed(true)}
                />
              ) : review.profilePhoto?.includes("/pending-files/profile-photo/") ? (
                <ProtectedImage src={review.profilePhoto} alt="Pending profile photo" />
              ) : review.profilePhoto && !profilePhotoFailed ? (
                <img src={review.profilePhoto} alt="Current profile photo" onError={() => setProfilePhotoFailed(true)} />
              ) : (
                <div className="edit-profile-photo-placeholder" aria-label="No profile photo">
                  {formData.full_name?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )}
            </div>
            <div className="form-grid">
              <FileField label="Profile photo" name="profile_photo" accept="image/*" uploads={uploads} setUploads={setUploads} onChange={handleUploadSelected} />
              <FileField label="Identity document" name="identity_document" accept=".pdf,image/*" uploads={uploads} setUploads={setUploads} />
              <FileField label="Additional document" name="additional_document" accept=".pdf,image/*" uploads={uploads} setUploads={setUploads} />
            </div>
            <div className="details-grid">
              {review.identityDocument && <p>Identity document saved: <ProtectedFileLink href={review.identityDocument}>View document</ProtectedFileLink></p>}
              {review.additionalDocument && <p>Additional document saved: <ProtectedFileLink href={review.additionalDocument}>View document</ProtectedFileLink></p>}
            </div>
            <p>Manage multiple profile photos from <button type="button" className="btn-cancel" onClick={() => navigate("/photos")}>My Photos</button>.</p>
          </div>
          {/* PERSONAL INFORMATION */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">👤 Personal Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Gender *</label>
                <select name="gender" value={formData.gender} onChange={handleChange} required>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="form-group">
                <label>Date of Birth *</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Religion</label>
                <input
                  type="text"
                  name="religion"
                  value={formData.religion}
                  onChange={handleChange}
                  placeholder="e.g. Hindu, Christian, Muslim"
                />
              </div>

              <div className="form-group">
                <label>Caste</label>
                <input
                  type="text"
                  name="caste"
                  value={formData.caste}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Marital Status</label>
                <select name="marital_status" value={formData.marital_status} onChange={handleChange}>
                  <option value="">Select Status</option>
                  <option value="Single / Never Married">Single / Never Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>

              <div className="form-group">
                <label>Height</label>
                <input
                  type="text"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  placeholder="e.g. 5 ft 8 in / 172 cm"
                />
              </div>

              <div className="form-group">
                <label>Disability</label>
                <select name="disability" value={formData.disability} onChange={handleChange}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          {/* ABOUT ME */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">✍️ About Profile</h3>
            <div className="form-group full-width">
              <label>Write about yourself, interests & expectations</label>
              <textarea
                name="about"
                value={formData.about}
                onChange={handleChange}
                rows={4}
                placeholder="Describe your personality, hobbies, background..."
              />
            </div>
          </div>

          {/* LOCATION & ADDRESS */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">📍 Location Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>City</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>District</label>
                <input type="text" name="district" value={formData.district} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>State</label>
                <input type="text" name="state" value={formData.state} onChange={handleChange} />
              </div>

              <div className="form-group full-width">
                <label>Address</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Native Place</label>
                <input type="text" name="place" value={formData.place} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>House Name</label>
                <input type="text" name="house_name" value={formData.house_name} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* EDUCATION & CAREER */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">🎓 Education & Occupation</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Education Level</label>
                <input type="text" name="education_level" value={formData.education_level} onChange={handleChange} placeholder="e.g. Bachelor's, Master's" />
              </div>

              <div className="form-group">
                <label>Education Course / Degree</label>
                <input type="text" name="education" value={formData.education} onChange={handleChange} placeholder="e.g. B.Tech Computer Science" />
              </div>

              <div className="form-group">
                <label>Occupation</label>
                <input type="text" name="occupation" value={formData.occupation} onChange={handleChange} placeholder="e.g. Software Engineer" />
              </div>

              <div className="form-group">
                <label>Company / Organization</label>
                <input type="text" name="company" value={formData.company} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Annual Income</label>
                <input type="text" name="income" value={formData.income} onChange={handleChange} placeholder="e.g. 6 - 8 Lakhs PA" />
              </div>

              <div className="form-group">
                <label>Work Location</label>
                <input type="text" name="work_location" value={formData.work_location} onChange={handleChange} placeholder="e.g. Kochi / Bangalore" />
              </div>
            </div>
          </div>

          {/* FAMILY DETAILS */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">👨‍👩‍👧‍👦 Family Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Father's Name</label>
                <input type="text" name="father_name" value={formData.father_name} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Father's Occupation</label>
                <input type="text" name="father_occupation" value={formData.father_occupation} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Mother's Name</label>
                <input type="text" name="mother_name" value={formData.mother_name} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Mother's Occupation</label>
                <input type="text" name="mother_occupation" value={formData.mother_occupation} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>No. of Brothers</label>
                <input type="number" min="0" name="brothers" value={formData.brothers} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Married Brothers</label>
                <input type="number" min="0" name="married_brothers" value={formData.married_brothers} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>No. of Sisters</label>
                <input type="number" min="0" name="sisters" value={formData.sisters} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Married Sisters</label>
                <input type="number" min="0" name="married_sisters" value={formData.married_sisters} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Financial Level</label>
                <input type="text" name="financial_level" value={formData.financial_level} onChange={handleChange} placeholder="e.g. Middle Class, Upper Middle Class" />
              </div>
            </div>
          </div>

          {/* CONTACT DETAILS */}
          <div className="edit-form-card">
            <h3 className="edit-form-title">📞 Contact Person Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Phone Number</label>
                <input type="text" name="phone" value={formData.phone} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Alternate Phone</label>
                <input type="text" name="alternate_phone" value={formData.alternate_phone} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Contact Person Name</label>
                <input type="text" name="contact_name" value={formData.contact_name} onChange={handleChange} />
              </div>

              <div className="form-group">
                <label>Relationship with Member</label>
                <input type="text" name="relationship" value={formData.relationship} onChange={handleChange} placeholder="e.g. Self, Father, Brother" />
              </div>

              <div className="form-group">
                <label>Contact Person Phone</label>
                <input type="text" name="contact_phone" value={formData.contact_phone} onChange={handleChange} />
              </div>
            </div>

            <div className="edit-form-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => navigate("/profile")}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn-save" disabled={saving} aria-busy={saving}>
                {saving ? (uploads.profile_photo ? "Uploading image and saving..." : "Saving Changes...") : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ClientLayout>
  );
}

async function readApiResponse(response) {
  const responseText = await response.text();
  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return { nonJsonResponse: true };
  }
}

async function fetchWithTokenRefresh(url, options) {
  const accessToken = localStorage.getItem("access_token");
  const sendRequest = (token) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let response = await sendRequest(accessToken);
  if (response.status !== 401) return response;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return response;

  const refreshResponse = await fetch(`${API_URL}/accounts/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  const refreshed = await readApiResponse(refreshResponse);
  if (!refreshResponse.ok || !refreshed?.access) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    return response;
  }

  localStorage.setItem("access_token", refreshed.access);
  return sendRequest(refreshed.access);
}

function getApiErrorMessage(result, status) {
  if (result?.detail) return result.detail;
  if (result?.message) return result.message;
  if (result?.nonJsonResponse) {
    if (status === 413) return "The uploaded file is too large. Choose a smaller image or document and try again.";
    return `The server returned an unexpected response (HTTP ${status}). Your changes may not have been saved; please try again.`;
  }
  return "Failed to update profile.";
}

function FileField({ label, name, accept, uploads, setUploads, onChange }) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <input id={name} type="file" accept={accept} onChange={onChange || ((event) => setUploads((current) => ({ ...current, [name]: event.target.files?.[0] || null })))} />
      {uploads[name] && <small>{uploads[name].name}</small>}
    </div>
  );
}
