import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  MessageCircle,
  Phone,
  MessageCircleMore
} from "lucide-react";

import { TERMS_TEXT, PRIVACY_TEXT } from "../data/legalTexts";
import './Home.css';
import homeBannerImage from "../assets/Slider.png";
import {
  API_URL,
  hasAuthenticatedSession,
  readApiResponse,
} from "../api.js";

export default function Home() {
  const [gender, setGender] = useState('male');
  const [activeFilter, setActiveFilter] = useState('all');
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(hasAuthenticatedSession);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    let requestInProgress = false;
    let requestController;

    const fetchProfiles = async () => {
      if (requestInProgress) return;
      requestInProgress = true;
      requestController = new AbortController();

      try {
        const response = await fetch(`${API_URL}/registrations/featured/`, {
          cache: "no-store",
          signal: requestController.signal,
        });
        const data = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(data.detail || "Unable to load profiles.");
        }

        const results = Array.isArray(data) ? data : data.results;
        if (!Array.isArray(results)) {
          throw new Error("The profiles response was invalid.");
        }

        if (active) {
          setProfiles(results);
          setProfilesError("");
        }
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setProfilesError(error.message || "Unable to load profiles.");
        }
      } finally {
        requestInProgress = false;
        if (active) setProfilesLoading(false);
      }
    };

    fetchProfiles();
    const refreshTimer = window.setInterval(fetchProfiles, 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") fetchProfiles();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      requestController?.abort();
    };
  }, []);

  useEffect(() => {
    const refreshAuthStatus = () => {
      setIsAuthenticated(hasAuthenticatedSession());
    };
    window.addEventListener('auth-change', refreshAuthStatus);
    window.addEventListener('storage', refreshAuthStatus);
    return () => {
      window.removeEventListener('auth-change', refreshAuthStatus);
      window.removeEventListener('storage', refreshAuthStatus);
    };
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
  });
  const [phoneError, setPhoneError] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setLegalModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (e.target.name === "phone") setPhoneError("");
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setPhoneError("");
    setCheckingPhone(true);
    try {
      const response = await fetch(`${API_URL}/registrations/availability/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formData.phone }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.detail || "Could not verify this number. Please try again.");
      if (result.errors?.phone) { setPhoneError(result.errors.phone); return; }
    } catch (error) {
      setPhoneError(error.message || "Could not verify this number. Please try again.");
      return;
    } finally { setCheckingPhone(false); }
    navigate('/registration', {
      state: {
        name: formData.name,
        phone: formData.phone,
        age: formData.age,
        gender: gender === 'male' ? 'Male' : 'Female',
      }
    });
  };

  const visibleProfiles = profiles.filter((profile) =>
    activeFilter === 'all' || profile.gender?.toLowerCase() === activeFilter
  );

  return (
    <div>
      <div className="home-hero">
        <img className="home-hero-image" src={homeBannerImage} alt="Keralakkara Matrimony home banner" />
        <div className="hero-overlay"></div>
        <div className="hero-content-wrapper">
          
          {!isAuthenticated && <div className="hero-form-card">
            <div className="hero-form-header">
              <h3>Find Your Partner From Profiles</h3>
            </div>
            <form onSubmit={handleRegisterSubmit}>
              <div className="hero-form-row">
                <div className="hero-input-wrapper">
                  <input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleFormChange} required />
                </div>
                <div className="phone-input-group">
                  <span className="country-code">🇮🇳 +91</span>
                  <input type="tel" name="phone" placeholder="Mobile Number" value={formData.phone} onChange={handleFormChange} required />
                </div>
              </div>
              {phoneError && <p className="registration-field-error" role="alert">{phoneError}</p>}

              <div className="hero-form-row">
                <div
                  className={`gender-option ${gender === 'male' ? 'active' : ''}`}
                  onClick={() => setGender('male')}
                >
                  <span>👤</span> Male
                </div>

                <div
                  className={`gender-option ${gender === 'female' ? 'active' : ''}`}
                  onClick={() => setGender('female')}
                >
                  <span>👤</span> Female
                </div>

                <div className="hero-input-wrapper">
                  <input 
                    type="number" 
                    name="age" 
                    placeholder="Age" 
                    min="18" 
                    max="60" 
                    value={formData.age} 
                    onChange={handleFormChange} 
                    required 
                  />
                </div>
              </div>

              <div className="terms-row">
                <input type="checkbox" id="terms" required />
                <label htmlFor="terms">
                I have read and agree to the <button type="button" className="hero-legal-link" onClick={() => setLegalModal('terms')}>Terms of Use</button> &{" "}
                <button type="button" className="hero-legal-link" onClick={() => setLegalModal('privacy')}>Privacy Policy</button>
                </label>
              </div>
                
              <button type="submit" className="hero-register-btn" disabled={checkingPhone}>
                {checkingPhone ? "Checking..." : "Register Free"}
              </button>
            </form>
          </div>}
        </div>
      </div>

      <div className="section-container">
        <h2 className="section-title1">Featured Matches</h2>
        <p className="section-subtitle">Handpicked potential profiles matching high compatibility standards</p>
        <div className="featured-filter-tabs">
          <button
            className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-tab ${activeFilter === 'female' ? 'active' : ''}`}
            onClick={() => setActiveFilter('female')}
          >
            Female
          </button>
          <button
            className={`filter-tab ${activeFilter === 'male' ? 'active' : ''}`}
            onClick={() => setActiveFilter('male')}
          >
            Male
          </button>
        </div>

        {profilesLoading && <p className="section-subtitle" role="status">Loading profiles...</p>}
        {profilesError && <p className="section-subtitle" role="alert">{profilesError}</p>}
        {!profilesLoading && !profilesError && visibleProfiles.length === 0 && (
          <p className="section-subtitle" role="status">No profiles available at the moment.</p>
        )}

        <div className="profiles-grid">
          {visibleProfiles.map((profile) => (
            <Link
              key={profile.id}
              className="profile-card"
              to={`/profiles/${profile.id}`}
              aria-label={`View ${profile.full_name}'s profile`}
            >
              {profile.profile_photo_url ? (
                <img src={profile.profile_photo_url} alt={profile.full_name} className="profile-img" />
              ) : (
                <div className="profile-img profile-img-placeholder" role="img" aria-label="Profile photo unavailable" />
              )}
              <div className="profile-info">
                <h3>
                  {profile.full_name || "Profile"}
                  {profile.matrimony_id ? ` (${profile.matrimony_id})` : ""}
                </h3>
                <p>
                  {[
                    profile.age != null ? `${profile.age} Yrs` : "",
                    profile.occupation || profile.occupation_level,
                    profile.caste,
                  ].filter(Boolean).join(", ") || "Profile details unavailable"}
                </p>
                <p>
                  {[profile.district, profile.state].filter(Boolean).join(", ") || "Location not specified"}
                </p>
                <div className="home-profile-actions">
                  <span className="home-view-profile-btn">
                    View Profile
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title3345" style={{ marginBottom: '1rem', textAlign: 'center' }}>Why Choose KeralakaraMatrimony?</h2>
        <p className="section-subtitle">We guarantee security and trusted matches for a lifelong commitment.</p>
        
        <div className="features-grid">
          <div className="feature-box">
            <h3>100% Verified</h3>
            <p>Every single profile is manually screened and verified via government ID checks.</p>
          </div>
          <div className="feature-box">
            <h3>Privacy Control</h3>
            <p>Keep your contact details hidden. Share photos and info only with those you trust.</p>
          </div>
          <div className="feature-box">
            <h3>Smart Matchmaking</h3>
            <p>Our intelligent algorithm matches preferences for horoscope, profession, and lifestyle.</p>
          </div>
        </div>
      </div>
      
      <div className="support-section">
        <div className="support-item">
          <Mail size={22} />
          <div>
            <h4>Support Request</h4>
            <a href="https://wa.me/917559080005" target="_blank" rel="noreferrer">
              Raise a support ticket
            </a>
          </div>
        </div>

        <div className="support-item">
          <MessageCircle size={22} />
          <div>
            <h4>Chat For Assistance</h4>
            <p>We're here to help</p>
          </div>
        </div>

        <div className="support-item">
          <Phone size={22} />
          <div>
            <h4>Call Us</h4>
            <a href="tel:+917559080005">+91 755 908 0005</a>
          </div>
        </div>

        <div className="support-item">
          <MessageCircleMore size={22} />
          <div>
            <h4>WhatsApp</h4>
            <a
              href="https://wa.me/917559080005"
              target="_blank"
              rel="noreferrer"
            >
              +91 755 908 0005
            </a>
          </div>
        </div>
      </div>

      {legalModal && (
        <div className="hero-legal-backdrop" onClick={() => setLegalModal(null)}>
          <div className="hero-legal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hero-legal-header">
              <h2>{legalModal === 'terms' ? "Terms of Use – Keralakkara Matrimony" : "Privacy Policy – Keralakkara Matrimony"}</h2>
              <span className="hero-legal-updated">Last Updated: January 1, 2025</span>
              <button className="hero-legal-close" onClick={() => setLegalModal(null)} aria-label="Close">&times;</button>
            </div>
            <div className="hero-legal-content">
              <pre>{legalModal === 'terms' ? TERMS_TEXT : PRIVACY_TEXT}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
