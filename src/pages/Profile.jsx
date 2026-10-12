import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../api.js";
import "./Profile.css";

export default function Profiles() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/registrations/published/`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to load profiles.");
        setProfiles(Array.isArray(data) ? data : data.results || []);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="profiles-page">
      <div className="profiles-header">
        <h1>Verified Matrimony Profiles</h1>
        <p>Browse profiles approved and published by our team.</p>
      </div>

      {loading ? <p role="status">Loading published profiles…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && profiles.length === 0 ? <p>No published profiles are available yet.</p> : null}

      <div className="profiles-grid">
        {profiles.map((profile) => (
          <article className="profile-card" key={profile.id}>
            <ProfilePhoto url={profile.profile_photo_url} name={profile.full_name} />
            <div className="profile-content">
              <span className="profile-id">{profile.matrimony_id || "Verified profile"}</span>
              <h3>{profile.full_name}</h3>
              {profile.age ? <p>{profile.age} Years</p> : null}
              <p>{profile.religion}</p>
              <p>{profile.occupation || profile.education}</p>
              <p>{[profile.city, profile.district, profile.state].filter(Boolean).join(", ")}</p>
              <Link to={`/profiles/${profile.id}`} className="view-btn">View Profile</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProfilePhoto({ url, name }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className="profile-image profile-image-placeholder" aria-label="No profile photo">{name?.charAt(0)?.toUpperCase() || "?"}</div>;
  }
  return <img src={url} alt={name} className="profile-image" onError={() => setFailed(true)} />;
}
