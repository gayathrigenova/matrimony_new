import React from 'react';
import './Footer.css';
import logo from '../assets/logo_km1.png';

export default function Footer() {
  return (
    <footer className="eb-footer">
      <div className="eb-footer-content">
        
        <div className="eb-footer-section">
<div className="footer-logo">
  <img src={logo} alt="km Logo" className="footer-logo-img" />
</div>
          <p>
            A trusted matrimony platform dedicated to helping members of our
            community find their perfect life partner through secure and verified
            profiles.
          </p>
        </div>

        <div className="eb-footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/Search">Search</a></li>
            <li><a href="/membership">Membership </a></li>
            <li><a href="/registration">Register</a></li>
            <li><a href="profiles">Profile</a></li>
            <li><a href="/contact">Contact Us</a></li>
          </ul>
        </div>

        <div className="eb-footer-section">
          <h4>Our Community</h4>
          <ul>
            <li><a href="#profiles">Verified Profiles</a></li>
            <li><a href="#success">Success Stories</a></li>
            <li><a href="#safety">Safety Tips</a></li>
            <li><a href="#faq">FAQs</a></li>
          </ul>
        </div>

      </div>

      <div className="eb-footer-bottom">
        <p>&copy; 2026 Genova Technologies Pvt Ltd. All Rights Reserved.</p>
      </div>
    </footer>
  );
}