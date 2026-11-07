import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  MessageCircle,
  Phone,
  MessageCircleMore
} from "lucide-react";

import './Home.css';
import { API_URL, hasAuthenticatedSession, readApiResponse } from "../api.js";

const sliderContent = [
  {
    image: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1600&q=80',
    title: <>Trust Begins With<br />Verified Malayali<br />Profiles</>,
  },
  {
    image: 'https://images.unsplash.com/photo-1727430256509-0f897d6f4765?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDV8fHdlZGRkaW5nfGVufDB8fDB8fHww',
    title: <>Find Your Perfect<br />Match With<br />Complete Security</>,
  },
  {
    image: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1600&q=80',
    title: <>Begin Your Happy<br />Lifelong Journey<br />With Us</>,
  }
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
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
        const response = await fetch(`${API_URL}/registrations/published/`, {
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
          setProfiles(results.filter((profile) => profile.status === "PUBLISHED"));
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
    const refreshAuthStatus = () => setIsAuthenticated(hasAuthenticatedSession());
    window.addEventListener('auth-change', refreshAuthStatus);
    window.addEventListener('storage', refreshAuthStatus);
    return () => {
      window.removeEventListener('auth-change', refreshAuthStatus);
      window.removeEventListener('storage', refreshAuthStatus);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % sliderContent.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
  });
  const [phoneError, setPhoneError] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);

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
      <div 
        className="hero-slider" 
        style={{ backgroundImage: `url(${sliderContent[currentSlide].image})` }}
      >
        <div className="hero-overlay"></div>
        <div className="hero-content-wrapper">
          
          <div className="hero-text-side">
            <h1>
              {sliderContent[currentSlide].title}
            </h1>
            <p>
              {sliderContent[currentSlide].description}
            </p>
          </div>

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
                  I have read and agree to the <a href="#terms">Terms of Use</a> &{" "}
                  <a href="#privacy">Privacy Policy</a>
                </label>
              </div>
                
              <button type="submit" className="hero-register-btn" disabled={checkingPhone}>
                {checkingPhone ? "Checking..." : "Register Free"}
              </button>

              <div className="hero-form-footer">
                <span>🎧 Support</span>
                <a href="https://wa.me/917559080005" target="_blank" rel="noreferrer">
                  💬 Chat for assistance
                </a>
              </div>
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
              <div key={profile.id} className="profile-card">
                {profile.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt={profile.full_name} className="profile-img" />
                ) : (
                  <div className="profile-img profile-img-placeholder" role="img" aria-label="Profile photo unavailable" />
                )}
                <div className="profile-info">
                  <h3>{profile.full_name}</h3>
                  <p className="profile-id">{profile.matrimony_id || "Profile ID unavailable"}</p>
                  <p>
                    {profile.age != null ? `${profile.age} yrs` : "Age unavailable"}
                    {profile.occupation || profile.occupation_level
                      ? `, ${profile.occupation || profile.occupation_level}`
                      : ""}
                  </p>
                  <p>
                    {[profile.religion, profile.caste].filter(Boolean).join(" • ") || "Religion/community not specified"}
                  </p>
                  <p>
                    {[profile.city, profile.district, profile.state].filter(Boolean).join(", ") || "Location not specified"}
                  </p>
                  <button 
                    className="view-profile-btn" 
                    onClick={() => alert(`Connect request sent to ${profile.full_name}!`)}
                  >
                    Connect Me
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="features-section">
        <h2 className="section-title3345" style={{ marginBottom: '1rem' }}>Why Choose KeralakaraMatrimony?</h2>
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
            <p>Raise a support ticket</p>
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
            <a href="tel:+919000000000">9000000000</a>
          </div>
        </div>

        <div className="support-item">
          <MessageCircleMore size={22} />
          <div>
            <h4>WhatsApp</h4>
            <a
              href="https://wa.me/919000000000"
              target="_blank"
              rel="noreferrer"
            >
              9000000000
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
