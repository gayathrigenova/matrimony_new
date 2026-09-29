import React from "react";
import { useParams, Link } from "react-router-dom";
import "./ProfileDetails.css";

export default function ProfileDetails() {
  const { id } = useParams();

const profiles = [
  {
    id: "WN100001",
    name: "Anjali",
    age: 24,
    height: "5'4\"",
    religion: "Hindu",
    caste: "Nair",
    education: "MBA",
    profession: "Software Engineer",
    income: "₹8 LPA",
    location: "Kochi, Kerala",
    maritalStatus: "Never Married",
    motherTongue: "Malayalam",
    image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&auto=format&fit=crop&q=60",
    about: "I am a simple, caring and family-oriented person.",
    family: {
      father: "Business",
      mother: "Homemaker",
      brother: "1 Married Brother",
      sister: "No Sister",
    },
    partnerPreference: {
      age: "24 - 30 Years",
      height: "5'3\" - 6'0\"",
      religion: "Any",
      education: "Graduate / Post Graduate",
      location: "Kerala Preferred",
    },
  },

  {
    id: "WN100002",
    name: "Athira",
    age: 25,
    height: "5'5\"",
    religion: "Christian",
    caste: "Latin Catholic",
    education: "MBBS",
    profession: "Doctor",
    income: "₹12 LPA",
    location: "Calicut, Kerala",
    maritalStatus: "Never Married",
    motherTongue: "Malayalam",
    image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=60",
    about: "Doctor working in a private hospital.",
    family: {
      father: "Teacher",
      mother: "Nurse",
      brother: "No Brother",
      sister: "1 Sister",
    },
    partnerPreference: {
      age: "26 - 32 Years",
      height: "5'6\" - 6'1\"",
      religion: "Christian",
      education: "Professional Degree",
      location: "Kerala",
    },
  },

  // WN100003, WN100004 ... similarly
];

const profile = profiles.find((item) => item.id === id);

if (!profile) {
  return <h2>Profile Not Found</h2>;
}

  return (
    <div className="profile-details-page">

      <div className="breadcrumb">
        <Link to="/profiles">← Back to Profiles</Link>
      </div>

      <div className="profile-top">

        <div className="profile-image-box">
          <img src={profile.image} alt={profile.name} />
        </div>

        <div className="profile-info">

          <span className="profile-id">{profile.id}</span>

          <h1>{profile.name}</h1>

          <div className="info-grid">

            <div>
              <strong>Age</strong>
              <p>{profile.age} Years</p>
            </div>

            <div>
              <strong>Height</strong>
              <p>{profile.height}</p>
            </div>

            <div>
              <strong>Religion</strong>
              <p>{profile.religion}</p>
            </div>

            <div>
              <strong>Caste</strong>
              <p>{profile.caste}</p>
            </div>

            <div>
              <strong>Education</strong>
              <p>{profile.education}</p>
            </div>

            <div>
              <strong>Profession</strong>
              <p>{profile.profession}</p>
            </div>

            <div>
              <strong>Income</strong>
              <p>{profile.income}</p>
            </div>

            <div>
              <strong>Location</strong>
              <p>{profile.location}</p>
            </div>

            <div>
              <strong>Marital Status</strong>
              <p>{profile.maritalStatus}</p>
            </div>

            <div>
              <strong>Mother Tongue</strong>
              <p>{profile.motherTongue}</p>
            </div>

          </div>

          <div className="profile-buttons">
            <button className="interest-btn">
              ❤️ Express Interest
            </button>

            <button className="shortlist-btn">
              ⭐ Shortlist
            </button>
          </div>

        </div>

      </div>

      <div className="details-section">

        <div className="card">

          <h2>About</h2>

          <p>{profile.about}</p>

        </div>

        <div className="card">

          <h2>Family Details</h2>

          <ul>
            <li><strong>Father :</strong> {profile.family.father}</li>
            <li><strong>Mother :</strong> {profile.family.mother}</li>
            <li><strong>Brother :</strong> {profile.family.brother}</li>
            <li><strong>Sister :</strong> {profile.family.sister}</li>
          </ul>

        </div>

        <div className="card">

          <h2>Partner Preferences</h2>

          <ul>
            <li><strong>Age :</strong> {profile.partnerPreference.age}</li>
            <li><strong>Height :</strong> {profile.partnerPreference.height}</li>
            <li><strong>Religion :</strong> {profile.partnerPreference.religion}</li>
            <li><strong>Education :</strong> {profile.partnerPreference.education}</li>
            <li><strong>Location :</strong> {profile.partnerPreference.location}</li>
          </ul>

        </div>

      </div>

    </div>
  );
}