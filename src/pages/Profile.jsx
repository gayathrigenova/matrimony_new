import React from "react";
import { Link } from "react-router-dom";
import "./Profile.css";

export default function Profiles() {
  const profiles = [
    {
      id: "WN100001",
      name: "Anjali",
      age: 24,
      religion: "Hindu",
      profession: "Software Engineer",
      location: "Kochi",
      image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8cG9ydHJhaXR8ZW58MHx8MHx8fDA%3D",
    },
    {
      id: "WN100002",
      name: "Athira",
      age: 25,
      religion: "Christian",
      profession: "Doctor",
      location: "Calicut",
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: "WN100003",
      name: "Meera",
      age: 23,
      religion: "Hindu",
      profession: "Teacher",
      location: "Thrissur",
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjB8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: "WN100004",
      name: "Hari",
      age: 26,
      religion: "Hindu",
      profession: "Architect",
      location: "Kannur",
      image: "https://images.unsplash.com/photo-1596075780750-81249df16d19?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDF8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: "WN100005",
      name: "kiran",
      age: 27,
      religion: "Hindu",
      profession: "HR Manager",
      location: "Malappuram",
      image: "https://images.unsplash.com/photo-1611695434398-4f4b330623e6?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTB8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
    {
      id: "WN100006",
      name: "Manu",
      age: 24,
      religion: "Christian",
      profession: "Nurse",
      location: "Kottayam",
      image: "https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NjR8fHBvcnRyYWl0fGVufDB8fDB8fHww",
    },
  ];

  return (
    <div className="profiles-page">

      <div className="profiles-header">
        <h1>Verified Matrimony Profiles</h1>
        <p>
          Find your perfect life partner from our verified profiles.
        </p>
      </div>

      <div className="profiles-grid">
        {profiles.map((profile) => (
          <div className="profile-card" key={profile.id}>

            <img
              src={profile.image}
              alt={profile.name}
              className="profile-image"
            />

            <div className="profile-content">

              <span className="profile-id">
                {profile.id}
              </span>

              <h3>{profile.name}</h3>

              <p>
                {profile.age} Years
              </p>

              <p>{profile.religion}</p>

              <p>{profile.profession}</p>

              <p>{profile.location}</p>

              <Link
                to={`/profiles/${profile.id}`}
                className="view-btn"
              >
                View Profile
              </Link>

            </div>

          </div>
        ))}
      </div>

    </div>
  );
}