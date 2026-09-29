import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  MessageCircle,
  Phone,
  MessageCircleMore
} from "lucide-react";

import './Home.css';

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

const dummyProfiles = [
  { id: 1, name: 'Ananya Sharma', age: 25, profession: 'Software Engineer', location: 'Bangalore', img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80', gender: 'female', profileId: 'WN10293', caste: 'Brahmin' },
  { id: 2, name: 'Rahul Verma', age: 28, profession: 'Investment Banker', location: 'Mumbai', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80', gender: 'male', profileId: 'WN10294', caste: 'Kshatriya' },
  { id: 3, name: 'Priya Nair', age: 26, profession: 'Doctor', location: 'Kochi', img: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=500&q=80', gender: 'female', profileId: 'WN10295', caste: 'Nair' },
  { id: 4, name: 'Karthik Menon', age: 29, profession: 'Architect', location: 'Chennai', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=500&q=80', gender: 'male', profileId: 'WN10296', caste: 'Menon' },
  { id: 5, name: 'Sneha Patel', age: 24, profession: 'UX Designer', location: 'Pune', img: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80', gender: 'female', profileId: 'WN10297', caste: 'Patel' },
  { id: 6, name: 'Arjun Krishnan', age: 30, profession: 'IAS Officer', location: 'Delhi', img: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80', gender: 'male', profileId: 'WN10298', caste: 'Nair' },
  { id: 7, name: 'Meera Pillai', age: 27, profession: 'CA', location: 'Trivandrum', img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=500&q=80', gender: 'female', profileId: 'WN10299', caste: 'Pillai' },
  { id: 8, name: 'Vishnu Das', age: 31, profession: 'Civil Engineer', location: 'Thrissur', img: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=500&q=80', gender: 'male', profileId: 'WN10300', caste: 'Ezhava' },
  { id: 9, name: 'Lakshmi Raj', age: 25, profession: 'Teacher', location: 'Kozhikode', img: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?auto=format&fit=crop&w=500&q=80', gender: 'female', profileId: 'WN10301', caste: 'Vishwakarma' },
  { id: 10, name: 'Arun Kumar', age: 28, profession: 'Entrepreneur', location: 'Hyderabad', img: 'https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=crop&w=500&q=80', gender: 'male', profileId: 'WN10302', caste: 'Mudaliar' },
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [gender, setGender] = useState('male');
  const [activeFilter, setActiveFilter] = useState('all');
  const navigate = useNavigate();

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

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    navigate('/registration', {
      state: {
        name: formData.name,
        phone: formData.phone,
        age: formData.age,
        gender: gender === 'male' ? 'Male' : 'Female',
      }
    });
  };

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

          <div className="hero-form-card">
            <div className="hero-form-header">
              <h3>Find Your Partner From <span className="highlight-text">2 Lakh+</span> Profiles</h3>
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
                
              <button type="submit" className="hero-register-btn">
                Register Free
              </button>

              <div className="hero-form-footer">
                <span>🎧 Support</span>
                <span>💬 Chat for assistance</span>
              </div>
            </form>
          </div>
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

        <div className="profiles-grid">
          {dummyProfiles
            .filter((profile) => activeFilter === 'all' || profile.gender === activeFilter)
            .map((profile) => (
              <div key={profile.id} className="profile-card">
                <img src={profile.img} alt={profile.name} className="profile-img" />
                <div className="profile-info">
                  <h3>{profile.name}</h3>
                  <p className="profile-id">{profile.profileId}</p>
                  <p>{profile.age} yrs, {profile.profession}</p>
                  <p>{profile.caste} • {profile.location}</p>
                  <button 
                    className="view-profile-btn" 
                    onClick={() => alert(`Connect request sent to ${profile.name}!`)}
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