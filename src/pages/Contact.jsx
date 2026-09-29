import React, { useState } from 'react';
import './Contact.css';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* Banner */}
      <div className="contact-banner">
        <div className="contact-banner-content">
          <span className="contact-tag">We're Here to Help</span>
          <h1>Get in Touch With Us</h1>
          <p>Have questions about profiles, memberships, or need assistance? We're available 24/7.</p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="contact-info-strip">
        {[
          { icon: "📍", title: "Our Office", lines: ["MG Road, Near Jos Junction", "Ernakulam, Kochi, Kerala 682016"] },
          { icon: "📞", title: "Phone Support", lines: ["+91 (000) 235-0000", "+91 90000 10005 (Toll Free)"] },
          { icon: "✉️", title: "Email Us", lines: ["info@keralakara.com", "help@keralakara.com"] },
          { icon: "⏰", title: "Working Hours", lines: ["Mon – Sat: 9:00 AM – 8:00 PM", "Sunday: 10:00 AM – 4:00 PM"] },
        ].map(c => (
          <div className="contact-info-card" key={c.title}>
            <div className="contact-info-icon">{c.icon}</div>
            <h3>{c.title}</h3>
            {c.lines.map(l => <p key={l}>{l}</p>)}
          </div>
        ))}
      </div>

      {/* Form + Map Section */}
      <div className="contact-main-section">
        {/* Form */}
        <div className="contact-form-card">
          <h2>Send Us a Message</h2>
          <p>Fill out the form and our team will get back to you shortly.</p>

          {submitted ? (
            <div className="contact-success">
              <div className="contact-success-icon">✓</div>
              <h3>Thank You, {formData.name}!</h3>
              <p>Your message has been received. We'll contact you soon.</p>
              <button onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', phone: '', subject: '', message: '' }); }}>
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="cf-row">
                <div className="cf-group">
                  <label>Full Name</label>
                  <input type="text" name="name" placeholder="Your full name" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="cf-group">
                  <label>Mobile Number</label>
                  <input type="tel" name="phone" placeholder="Your mobile number" value={formData.phone} onChange={handleChange} required />
                </div>
              </div>
              <div className="cf-group">
                <label>Email Address</label>
                <input type="email" name="email" placeholder="Your email address" value={formData.email} onChange={handleChange} required />
              </div>
              <div className="cf-group">
                <label>Subject</label>
                <input type="text" name="subject" placeholder="e.g. Membership, Profile Verification" value={formData.subject} onChange={handleChange} required />
              </div>
              <div className="cf-group">
                <label>Message</label>
                <textarea name="message" rows="5" placeholder="Write your message here..." value={formData.message} onChange={handleChange} required />
              </div>
              <button type="submit" className="cf-submit-btn">Send Message →</button>
            </form>
          )}
        </div>

        {/* Side Image + Social */}
        <div className="contact-side">
          <img src="https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&q=80" alt="Contact" />
          <div className="contact-social-card">
            <h3>Follow Us</h3>
            <div className="contact-socials">
              {[
                { icon: "📘", label: "Facebook", handle: "@KeralakaraMatrimony" },
                { icon: "📸", label: "Instagram", handle: "@Keralakara.Matrimony" },
                { icon: "🐦", label: "Twitter", handle: "@KeralakaraMatrimony" },
              ].map(s => (
                <div className="social-item" key={s.label}>
                  <span>{s.icon}</span>
                  <div>
                    <strong>{s.label}</strong>
                    <small>{s.handle}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="contact-map">
        <iframe
          title="KM Location"
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3929.0!2d76.2673!3d9.9816!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTDCsDU4JzUzLjgiTiA3NsKwMTYnMDIuMyJF!5e0!3m2!1sen!2sin!4v1234567890"
          allowFullScreen=""
          loading="lazy"
        />
      </div>
    </>
  );
}
