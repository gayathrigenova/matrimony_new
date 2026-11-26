import React, { useRef, useState } from 'react';
import './Contact.css';
import { API_URL, readApiResponse } from '../api.js';
import { Clock3, Mail, MapPin, Phone } from 'lucide-react';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submissionInProgress = useRef(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setSubmitError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submissionInProgress.current) return;

    submissionInProgress.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch(`${API_URL}/enquiries/contact/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(result.detail || 'We could not send your message right now. Please try again.');
      }
      setSubmitted(true);
    } catch {
      setSubmitError('We could not send your message right now. Please try again.');
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
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
          { icon: MapPin, title: "Our Office", lines: ["westhill", "kozhikode Kerala "] },
          { icon: Phone, title: "Phone Support", lines: ["+91 755 908 0005"] },
          { icon: Mail, title: "Email Us", lines: ["keralakkaramatrimony@gmail.com"] },
          { icon: Clock3, title: "Working Hours", lines: ["Mon – Sat: 9:00 AM – 8:00 PM", "Sunday: 10:00 AM – 4:00 PM"] },
        ].map(c => (
          <div className="contact-info-card" key={c.title}>
            <div className="contact-info-icon"><c.icon aria-hidden="true" size={30} strokeWidth={1.8} /></div>
            <h3>{c.title}</h3>
            {c.lines.map(l => (
              <p key={l}>
                {c.title === "Phone Support" ? <a href={`tel:${l.replace(/[^+\d]/g, "")}`}>{l}</a>
                  : c.title === "Email Us" ? <a href={`mailto:${l}`}>{l}</a>
                    : l}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Contact Form */}
      <div className="contact-main-section">
        <div className="contact-form-card">
          <h2>Send Us a Message</h2>
          <p>Fill out the form and our team will get back to you shortly.</p>

          {submitted ? (
            <div className="contact-success">
              <div className="contact-success-icon">✓</div>
              <h3>Thank You, {formData.name}!</h3>
              <p>Your message has been received. We'll contact you soon.</p>
              <button onClick={() => { setSubmitted(false); setSubmitError(''); setFormData({ name: '', email: '', phone: '', subject: '', message: '' }); }}>
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
              {submitError && <p className="contact-submit-error" role="alert">{submitError}</p>}
              <button type="submit" className="cf-submit-btn" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Message →'}
              </button>
            </form>
          )}
        </div>

      </div>

    </>
  );
}
