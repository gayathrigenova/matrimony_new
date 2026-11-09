import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../api.js";
import './Membership.css';

const plans = [
  {
    name: "Free Plan", price: "₹0", period: "",
    features: ["Create Profile", "View Matches", "Basic Search", "✗ Send Messages", "✗ View Contacts"],
    btn: "Current Plan", featured: false,
  },
  {
    name: "Gold Plan", price: "₹1499", period: "/3 months",
    features: ["View 20 Contact Numbers", "Unlimited Messaging", "Highlight Profile", "Priority Search", "✗ Dedicated Manager"],
    btn: "Choose Gold", featured: true,
    badge: "Most Popular",
  },
  {
    name: "Diamond Plan", price: "₹2999", period: "/6 months",
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
  const navigate = useNavigate();
  const [purchaseState, setPurchaseState] = useState({ type: "", message: "" });
  const [purchasing, setPurchasing] = useState(false);

  const handleGoldPurchase = async () => {
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { state: { returnTo: "/membership" } });
      return;
    }

    setPurchasing(true);
    setPurchaseState({ type: "", message: "" });

    try {
      const orderResponse = await fetchWithTokenRefresh(
        `${API_URL}/memberships/razorpay/orders/`,
        { method: "POST" },
      );
      const order = await readApiResponse(orderResponse);
      if (!orderResponse.ok) {
        throw new Error(order.detail || "Unable to start membership checkout.");
      }

      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Matrimony",
        description: "Gold Plan — 20 contact credits",
        order_id: order.order_id,
        handler: async (payment) => {
          try {
            const verifyResponse = await fetchWithTokenRefresh(
              `${API_URL}/memberships/razorpay/verify/`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payment),
              },
            );
            const result = await readApiResponse(verifyResponse);
            if (!verifyResponse.ok) {
              throw new Error(result.detail || "Payment could not be confirmed.");
            }

            setPurchaseState({
              type: "success",
              message: `${result.message} ${result.contacts_remaining} Contacts Remaining.`,
            });
          } catch (verificationError) {
            setPurchaseState({
              type: "error",
              message: verificationError.message || "Payment could not be confirmed. Contact support if you were charged.",
            });
          } finally {
            setPurchasing(false);
          }
        },
        modal: {
          ondismiss: () => setPurchasing(false),
        },
      });

      checkout.on("payment.failed", (payment) => {
        setPurchaseState({
          type: "error",
          message: payment.error?.description || "Payment failed. Please try again.",
        });
        setPurchasing(false);
      });
      checkout.open();
    } catch (purchaseError) {
      setPurchaseState({
        type: "error",
        message: purchaseError.message || "Unable to start membership checkout.",
      });
      setPurchasing(false);
    }
  };

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
        {purchaseState.message ? (
          <p className={`mem-purchase-message ${purchaseState.type}`} role={purchaseState.type === "error" ? "alert" : "status"}>
            {purchaseState.message}
          </p>
        ) : null}
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
              <button
                type="button"
                className={plan.featured ? 'mem-btn-primary' : 'mem-btn-outline'}
                onClick={plan.featured ? handleGoldPurchase : undefined}
                disabled={!plan.featured || purchasing}
              >
                {plan.featured && purchasing ? "Starting checkout…" : plan.featured ? plan.btn : plan.name === "Free Plan" ? plan.btn : "Coming Soon"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Trust Stats */}
      {/* <div className="mem-stats-section">
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
      </div> */}

      {/* Benefits with Image */}
      {/* <div className="mem-benefits-section">
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
      </div> */}

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

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load secure payment checkout."));
    document.body.appendChild(script);
  });
}
