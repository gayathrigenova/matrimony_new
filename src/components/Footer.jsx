import { Phone, MessageCircle } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="km-footer">
      <div className="km-footer-inner">
        <div className="km-footer-left">
          <img
            src="https://randomuser.me/api/portraits/women/68.jpg"
            alt="Customer Care Executive"
            className="km-footer-lady"
          />
          <div className="km-footer-text">
            <h3 className="km-footer-heading">Customer Care Executive</h3>
            <p className="km-footer-sub">We're here to help you!</p>
          </div>
        </div>

        <div className="km-footer-divider" />

        <div className="km-footer-contact">
          <a href="https://wa.me/917559080005" target="_blank" rel="noreferrer" className="km-footer-contact-row">
            <MessageCircle size={22} className="km-footer-icon km-footer-icon-wa" />
            <span>+91 755 908 0005</span>
          </a>
          <a href="tel:+917559080005" className="km-footer-contact-row">
            <Phone size={22} className="km-footer-icon km-footer-icon-phone" />
            <span>+91 755 908 0005</span>
          </a>
        </div>
      </div>

      <div className="km-footer-curve">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,60 C360,120 1080,0 1440,60 L1440,120 L0,120 Z" fill="#063b2a" />
          <path d="M0,60 C360,120 1080,0 1440,60" fill="none" stroke="#d4af37" strokeWidth="3" />
        </svg>
      </div>

      <div className="km-footer-bottom">
        <p>© 2026 Genova Technologies Pvt Ltd. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
