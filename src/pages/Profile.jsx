import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../api.js";
import "./Profile.css";

export default function Profiles() {
  const [searchParams] = useSearchParams();
  const birthStar = searchParams.get("birth_star") || "";
  const matrimonyId = (searchParams.get("matrimony_id") || "").replace(/\s+/g, "");
  const searchKey = new URLSearchParams({ birthStar, matrimonyId }).toString();
  const [result, setResult] = useState(null);
  const loading = !result || result.key !== searchKey;
  const profiles = result?.key === searchKey ? result.profiles : [];
  const error = result?.key === searchKey ? result.error : "";
  const [pendingAction, setPendingAction] = useState(null);
  const [sentInterestIds, setSentInterestIds] = useState(() => new Set());
  const [shortlistedProfileIds, setShortlistedProfileIds] = useState(() => new Set());
  const [actionFeedback, setActionFeedback] = useState({ id: null, type: "", text: "" });

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    let endpoint;
    if (matrimonyId) {
      query.set("matrimony_id", matrimonyId);
      endpoint = `${API_URL}/registrations/published/by-matrimony-id/?${query.toString()}`;
    } else {
      if (birthStar) query.set("birth_star", birthStar);
      const queryString = query.toString();
      endpoint = `${API_URL}/registrations/published/${queryString ? `?${queryString}` : ""}`;
    }

    fetchWithTokenRefresh(endpoint)
      .then(async (response) => {
        const data = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(data.detail || "Unable to load profiles.");
        }
        if (active) {
          setResult({
            key: searchKey,
            profiles: matrimonyId ? [data] : Array.isArray(data) ? data : data.results || [],
            error: "",
          });
        }
      })
      .catch((requestError) => {
        if (active) {
          setResult({
            key: searchKey,
            profiles: [],
            error: requestError.message || "Unable to load profiles.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [birthStar, matrimonyId, searchKey]);

  const handleProfileAction = async (profileId, action) => {
    const token = localStorage.getItem("access_token");
    const actionName = action === "interest" ? "Interest" : "Shortlist";
    setPendingAction({ id: profileId, action });
    setActionFeedback({ id: null, type: "", text: "" });

    try {
      const response = await fetchWithTokenRefresh(`${API_URL}/registrations/${profileId}/${action}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(data.detail || "Unable to send interest.");
      }

      if (action === "interest") {
        setSentInterestIds((currentIds) => new Set(currentIds).add(profileId));
      } else {
        setShortlistedProfileIds((currentIds) => new Set(currentIds).add(profileId));
      }
      setActionFeedback({
        id: profileId,
        type: "success",
        text: action === "interest"
          ? "Interest sent successfully."
          : "Profile added to shortlist.",
      });
    } catch (requestError) {
      setActionFeedback({
        id: profileId,
        type: "error",
        text: requestError.message || (
          action === "interest"
            ? "Unable to send interest."
            : `Unable to add profile to ${actionName.toLowerCase()}.`
        ),
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="profiles-page">
      <div className="profiles-header">
        <h1>{matrimonyId ? "Matrimony ID Search" : "Verified Matrimony Profiles"}</h1>
        <p>{matrimonyId ? `Search result for ${matrimonyId}` : "Browse profiles approved and published by our team."}</p>
      </div>

      {loading ? <p role="status">Loading published profiles…</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && profiles.length === 0 ? (
        <p>{matrimonyId ? "No profile found for this Matrimony ID." : "No published profiles are available yet."}</p>
      ) : null}

      <div className="profiles-grid">
        {profiles.map((profile) => (
          <article className="profile-card" key={profile.id}>
            <ProfilePhoto url={profile.profile_photo_url} name={profile.full_name} />
            <div className="profile-content">
              <h3>{profile.full_name || "Profile"}</h3>
              <span className="profile-id">{profile.matrimony_id || "Verified profile"}</span>
              {profile.age ? <p><strong>Age:</strong> {profile.age} years</p> : null}
              {profile.occupation ? <p><strong>Job:</strong> {profile.occupation}</p> : null}
              {profile.state ? <p><strong>State:</strong> {profile.state}</p> : null}
              {profile.birth_star ? <p><strong>Birth Star:</strong> {profile.birth_star}</p> : null}
              {actionFeedback.id === profile.id ? (
                <p className={`profile-action-feedback ${actionFeedback.type}`} role={actionFeedback.type === "error" ? "alert" : "status"}>
                  {actionFeedback.text}
                </p>
              ) : null}
              <div className="profile-card-actions">
                <Link to={`/profiles/${profile.id}`} className="view-btn">View Profile</Link>
                <button
                  type="button"
                  className="interest-btn"
                  onClick={() => handleProfileAction(profile.id, "interest")}
                  disabled={pendingAction !== null || sentInterestIds.has(profile.id)}
                >
                  {sentInterestIds.has(profile.id)
                    ? "Interest Sent"
                    : pendingAction?.id === profile.id && pendingAction.action === "interest"
                      ? "Sending…"
                      : "Send Interest"}
                </button>
                <button
                  type="button"
                  className="shortlist-btn"
                  onClick={() => handleProfileAction(profile.id, "shortlist")}
                  disabled={pendingAction !== null || shortlistedProfileIds.has(profile.id)}
                >
                  {shortlistedProfileIds.has(profile.id)
                    ? "Shortlisted"
                    : pendingAction?.id === profile.id && pendingAction.action === "shortlist"
                      ? "Adding…"
                      : "Shortlist"}
                </button>
              </div>
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
