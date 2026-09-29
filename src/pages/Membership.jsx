import React from 'react';
import './Membership.css';

const plans = [
  {
    name: "Free Plan", price: "₹0", period: "",
    features: ["Create Profile", "View Matches", "Basic Search", "✗ Send Messages", "✗ View Contacts"],
    btn: "Current Plan", featured: false,
  },
  {
    name: "Gold Plan", price: "₹2,999", period: "/3 months",
    features: ["View 50 Contact Numbers", "Unlimited Messaging", "Highlight Profile", "Priority Search", "✗ Dedicated Manager"],
    btn: "Choose Gold", featured: true,
    badge: "Most Popular",
  },
  {
    name: "Diamond Plan", price: "₹4,999", period: "/6 months",
    features: ["Unlimited Contacts", "Dedicated Relationship Manager", "Top Priority Placement", "Profile Verification Badge", "Personalised Matches"],
    btn: "Choose Diamond", featured: false,
  },
];

const testimonials = [
  { img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&q=80", names: "Ananya & Vikram", text: "We found each other through the Gold plan. Best decision ever!", stars: 5 },
  { img: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=300&q=80", names: "Priya & Arjun", text: "The Diamond plan's relationship manager made everything so easy.", stars: 5 },
  { img: "https://images.unsplash.com/photo-1519741497674-611481863552?w=300&q=80", names: "Meera & Rohan", text: "Verified profiles gave us the confidence to connect. Happily married!", stars: 5 },
];

export default function Membership() {
  return (
    <>
      {/* Banner */}
      <div className="mem-banner">
        <div className="mem-banner-content">
          <span className="mem-tag">Premium Membership</span>
          <h1>Choose Your Perfect Membership</h1>
          <p>Unlock premium features, connect with verified profiles, and find your life partner faster.</p>
        </div>
      </div>

      {/* Plans */}
      <div className="mem-plans-section">
        <h2>Upgrade Your Membership Plan</h2>
        <p className="mem-sub">Unlock direct contact numbers, unlimited messaging, and priority listing.</p>
        <div className="mem-plans-grid">
          {plans.map(plan => (
            <div className={`mem-plan-card ${plan.featured ? 'mem-featured' : ''}`} key={plan.name}>
              {plan.badge && <span className="mem-badge">{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <div className="mem-price">{plan.price}<span>{plan.period}</span></div>
              <ul>
                {plan.features.map(f => (
                  <li key={f} className={f.startsWith('✗') ? 'mem-no' : ''}>{f.startsWith('✗') ? f.slice(2) : `✓ ${f}`}</li>
                ))}
              </ul>
              <button className={plan.featured ? 'mem-btn-primary' : 'mem-btn-outline'}>{plan.btn}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Trust Stats */}
      <div className="mem-stats-section">
        {[
          { num: "5 Lakh+", label: "Registered Profiles" },
          { num: "10,000+", label: "Successful Marriages" },
          { num: "98%", label: "Verified Profiles" },
          { num: "4.8★", label: "Average Rating" },
        ].map(s => (
          <div className="mem-stat" key={s.label}>
            <h3>{s.num}</h3>
            <p>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Benefits with Image */}
      <div className="mem-benefits-section">
        <div className="mem-benefits-img">
          <img src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=600&q=80" alt="Happy Couple" />
        </div>
        <div className="mem-benefits-text">
          <h2>Why Upgrade to Premium?</h2>
          <p>Premium members get 5x more profile views and connect with their partner 3x faster.</p>
          {["Access verified contact numbers directly", "Get featured at the top of search results", "Dedicated relationship manager support", "Advanced horoscope matching", "Unlimited profile views & messaging"].map(b => (
            <div className="mem-benefit-item" key={b}>
              <span className="mem-check">✓</span> {b}
            </div>
          ))}
          <button className="mem-btn-primary" style={{marginTop:'1.5rem', width:'auto', padding:'0.8rem 2rem'}}>Get Premium Now</button>
        </div>
      </div>

      {/* Testimonials */}
      {/* <div className="mem-testimonials-section">
        <h2>Success Stories</h2>
        <p className="mem-sub">Real couples who found love through our platform</p>
        <div className="mem-testimonials-grid">
          {testimonials.map(t => (
            <div className="mem-testimonial-card" key={t.names}>
              <img src={t.img} alt={t.names} />
              <div className="mem-stars">{'★'.repeat(t.stars)}</div>
              <p>"{t.text}"</p>
              <h4>{t.names}</h4>
            </div>
          ))}
        </div>
      </div> */}
    </>
  );
}
