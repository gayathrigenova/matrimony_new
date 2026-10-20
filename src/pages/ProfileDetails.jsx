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

  if (loading) {
    return (
      <main className="public-profile-page">
        <p className="public-profile-state" role="status">Loading profile…</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="public-profile-page">
        <div className="public-profile-state">
          <p className="public-profile-error" role="alert">
            {error || "Published profile not found."}
          </p>
          <Link to="/profiles">Back to profiles</Link>
        </div>
      </main>
    );
  }

  const location = [profile.city, profile.district, profile.state]
    .filter(Boolean)
    .join(", ");
  const summaryDetails = [
    ["Age", profile.age ? `${profile.age} years` : ""],
    ["Gender", profile.gender],
    ["Height", profile.height],
    ["Marital status", profile.marital_status],
    ["Religion", profile.religion],
    ["Caste", profile.caste],
    ["Location", location],
  ];
  const personalDetails = [
    ["Date of birth", profile.date_of_birth],
    [
      "Disability",
      profile.disability && String(profile.disability).toLowerCase() !== "no"
        ? profile.disability
        : "",
    ],
  ];
  const educationDetails = [
    ["Education level", profile.education_level],
    ["Education", profile.education],
    ["Highest education", profile.highest_education],
    ["Occupation level", profile.occupation_level],
    ["Occupation", profile.occupation],
    ["Company", profile.company],
    ["Income", profile.income],
    ["Work location", profile.work_location || profile.working_place],
  ];
  const familyDetails = [
    ["Father's name", profile.father_name],
    ["Father's occupation", profile.father_occupation],
    ["Mother's name", profile.mother_name],
    ["Mother's occupation", profile.mother_occupation],
    ["Brothers", profile.brothers],
    ["Married brothers", profile.married_brothers],
    ["Sisters", profile.sisters],
    ["Married sisters", profile.married_sisters],
    ["Family financial level", profile.financial_level],
  ];
  const hometownDetails = [["Native place", profile.place]];

  return (
    <main className="public-profile-page">
      <div className="public-profile-breadcrumb">
        <Link to="/profiles">← Back to Profiles</Link>
      </div>
      <div className="public-profile-card">
        <div className="public-profile-image">
          {profile.profile_photo_url && !photoFailed ? (
            <img
              src={profile.profile_photo_url}
              alt={profile.full_name || "Profile"}
              onError={() => setPhotoFailureFor(id)}
            />
          ) : (
            <div className="public-profile-image-fallback" aria-label="No profile photo">
              {profile.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
        </div>
        <div className="public-profile-info">
          {profile.matrimony_id ? (
            <span className="public-profile-id">{profile.matrimony_id}</span>
          ) : null}
          <h1>{profile.full_name || "Profile"}</h1>
          <ProfileDetailGrid details={summaryDetails} />
        </div>
      </div>
      <div className="public-profile-sections">
        {personalDetails.some(([, value]) => hasProfileValue(value)) ? (
          <ProfileSection title="Personal Details" details={personalDetails} />
        ) : null}
        {educationDetails.some(([, value]) => hasProfileValue(value)) ? (
          <ProfileSection title="Education & Career" details={educationDetails} />
        ) : null}
        {familyDetails.some(([, value]) => hasProfileValue(value)) || profile.about_family ? (
          <section className="public-profile-section-card">
            <h2>Family Details</h2>
            <ProfileDetailGrid details={familyDetails} />
            {profile.about_family ? <p className="public-profile-description">{profile.about_family}</p> : null}
          </section>
        ) : null}
        {hometownDetails.some(([, value]) => hasProfileValue(value)) ? (
          <ProfileSection title="Native Place" details={hometownDetails} />
        ) : null}
        {profile.about ? (
          <section className="public-profile-section-card">
            <h2>About</h2>
            <p className="public-profile-description">{profile.about}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ProfileSection({ title, details }) {
  return (
    <section className="public-profile-section-card">
      <h2>{title}</h2>
      <ProfileDetailGrid details={details} />
    </section>
  );
}

function ProfileDetailGrid({ details }) {
  const populatedDetails = details.filter(([, value]) => hasProfileValue(value));
  if (!populatedDetails.length) return null;

  return (
    <div className="public-profile-details">
      {populatedDetails.map(([label, value]) => (
        <div className="public-profile-detail" key={label}>
          <strong>{label}</strong>
          <p>{value}</p>
        </div>
      ))}
    </div>
  );
}

function hasProfileValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}
