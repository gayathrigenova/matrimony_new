import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Search.css';

export default function Search() {
  const [nestId, setNestId] = useState('');
  const navigate = useNavigate();

  return (
    <>
      {/* Banner */}
      <div className="search-banner">
        <button className="search-back-btn" onClick={() => navigate(-1)}>&#8592; Back</button>
        <div className="search-banner-content">
          <h1>Search Your Partner Here</h1>
          <p>Find your perfect partner from 5 Lakh+ profiles</p>
          <div className="search-nest-bar">
            <input
              type="text"
              placeholder="Search by Nest ID"
              value={nestId}
              onChange={(e) => setNestId(e.target.value)}
            />
            <button className="nest-search-btn">&#128269;</button>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="search-filter-section">
        <div className="search-filter-card">
          <div className="filter-row">
            <div className="filter-group">
              <label>I'm looking for a</label>
              <select>
                <option>Bride</option>
                <option>Groom</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Religion</label>
              <select>
                <option value="">Select Religion</option>
                <option>Hindu</option>
                <option>Muslim</option>
                <option>Christian</option>
                <option>Sikh</option>
                <option>Jain</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Caste</label>
              <select>
                <option value="">Selected (0)</option>
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Height in cm</label>
              <div className="range-row">
                <select>
                  {["4'1 (124cm)","4'5 (135cm)","5'0 (152cm)","5'5 (165cm)","5'10 (178cm)"].map(h => <option key={h}>{h}</option>)}
                </select>
                <span>To</span>
                <select defaultValue="6'8 (203cm)">
                  {["5'5 (165cm)","5'10 (178cm)","6'0 (183cm)","6'4 (193cm)","6'8 (203cm)"].map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div className="filter-group">
              <label>Age Between (Years)</label>
              <div className="range-row">
                <select defaultValue="18">
                  {Array.from({length:43},(_,i)=>i+18).map(a=><option key={a}>{a}</option>)}
                </select>
                <span>To</span>
                <select defaultValue="60">
                  {Array.from({length:43},(_,i)=>i+18).map(a=><option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="filter-group">
              <label>Matching Stars</label>
              <select>
                <option value="">Selected (0)</option>
                <option>6+ Stars</option>
                <option>8+ Stars</option>
                <option>10+ Stars</option>
              </select>
            </div>
          </div>

          <div className="filter-more-link">
            <a href="#">More Filters</a>
          </div>

          <button className="search-submit-btn">Search</button>
        </div>
      </div>

      {/* Why Choose Us */}
      <div className="search-why-section">
        <h2>Why Search With Us?</h2>
        <p className="section-sub">Trusted by millions of families across India</p>
        <div className="why-cards">
          {[
            { img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80", title: "Verified Profiles", desc: "Every profile is manually verified for authenticity and trust." },
            { img: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=400&q=80", title: "Smart Matching", desc: "AI-powered matching based on your preferences and horoscope." },
            { img: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&q=80", title: "Privacy First", desc: "Your contact details are shared only with your consent." },
          ].map(c => (
            <div className="why-card" key={c.title}>
              <img src={c.img} alt={c.title} />
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Success Stories Banner */}
      <div className="search-success-banner">
        <div className="success-overlay">
          <h2>💑 Over 10,000 Successful Marriages</h2>
          <p>Join the growing family of happy couples who found their match here.</p>
          <a href="/register" className="success-cta">Create Free Profile</a>
        </div>
      </div>

      {/* Featured Profiles */}
      <div className="search-featured-section">
        <h2>Featured Profiles</h2>
        <p className="section-sub">Handpicked profiles for you</p>
        <div className="featured-profiles">
          {[
            { img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&q=80", name: "Priya S.", age: 26, loc: "Bangalore", prof: "Software Engineer" },
            { img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80", name: "Arjun M.", age: 29, loc: "Chennai", prof: "Doctor" },
            { img: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&q=80", name: "Sneha R.", age: 25, loc: "Mumbai", prof: "CA" },
            { img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&q=80", name: "Rahul K.", age: 31, loc: "Delhi", prof: "IAS Officer" },
          ].map(p => (
            <div className="profile-card" key={p.name}>
              <img src={p.img} alt={p.name} />
              <div className="profile-info">
                <h4>{p.name}, {p.age}</h4>
                <span>{p.prof}</span>
                <span>📍 {p.loc}</span>
                <button>View Profile</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
