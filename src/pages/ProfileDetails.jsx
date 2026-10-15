import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL } from "../api.js";
import "./ProfileDetails.css";

export default function ProfileDetails() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loadedId, setLoadedId] = useState(null);
  const [photoFailureFor, setPhotoFailureFor] = useState(null);
  const loading = loadedId !== id;
  const photoFailed = photoFailureFor === id;

  useEffect(() => {
    fetch(`${API_URL}/registrations/published/${id}/`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Published profile not found.");
        setError("");
        setProfile(data);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoadedId(id));
  }, [id]);

  if (loading) return <main className="profile-details-page"><p role="status">Loading profile…</p></main>;
  if (error || !profile) return <main className="profile-details-page"><p role="alert">{error || "Published profile not found."}</p><Link to="/profiles">Back to profiles</Link></main>;

  const location = [profile.city, profile.district, profile.state].filter(Boolean).join(", ");
  const details = [
    ["Age", profile.age ? `${profile.age} years` : ""], ["Height", profile.height],
    ["Religion", profile.religion], ["Caste", profile.caste], ["Marital status", profile.marital_status],
    ["Education", profile.highest_education || profile.education || profile.education_level],
    ["Occupation", profile.occupation], ["Location", location],
  ].filter(([, value]) => value);

  return (
    <main className="profile-details-page">
      <div className="breadcrumb"><Link to="/profiles">← Back to Profiles</Link></div>
      <div className="profile-top">
        <div className="profile-image-box">
          {profile.profile_photo_url && !photoFailed ? (
            <img src={profile.profile_photo_url} alt={profile.full_name} onError={() => setPhotoFailureFor(id)} />
          ) : (
            <div className="profile-image-placeholder" aria-label="No profile photo">{profile.full_name?.charAt(0)?.toUpperCase() || "?"}</div>
          )}
        </div>
        <div className="profile-info">
          <span className="profile-id">{profile.matrimony_id}</span>
          <h1>{profile.full_name}</h1>
          <div className="info-grid">
            {details.map(([label, value]) => <div key={label}><strong>{label}</strong><p>{value}</p></div>)}
          </div>
          {profile.about ? <section><h2>About</h2><p>{profile.about}</p></section> : null}
          {profile.about_family ? <section><h2>Family</h2><p>{profile.about_family}</p></section> : null}
        </div>
      </div>
    </main>
  );
}
