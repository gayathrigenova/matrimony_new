import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../api.js";
import './Membership.css';
import '../components/CommonPageBanner.css';

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
    name: "Diamond Plan", price: "₹2,999", period: "/6 months",
    features: ["50 Contact Numbers", "Dedicated Relationship Manager", "Top Priority Placement", "Premium Membership Badge", "Unlimited Messaging"],
    btn: "Choose Diamond Plan", featured: false,
    badge: "Premium",
  },
];

export default function Membership() {
  const navigate = useNavigate();
  const [purchaseState, setPurchaseState] = useState({ type: "", message: "" });
  const [purchasing, setPurchasing] = useState(false);
  const [purchasingPlan, setPurchasingPlan] = useState("");

  const handlePlanPurchase = async (planKey, description, contacts) => {
    if (!localStorage.getItem("access_token")) {
      navigate("/login", { state: { returnTo: "/membership" } });
      return;
    }

    setPurchasing(true);
    setPurchasingPlan(planKey);
    setPurchaseState({ type: "", message: "" });

    try {
      const orderResponse = await fetchWithTokenRefresh(
        `${API_URL}/memberships/razorpay/orders/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planKey }),
        },
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
        description,
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
            setPurchasingPlan("");
          }
        },
        modal: {
          ondismiss: () => { setPurchasing(false); setPurchasingPlan(""); },
        },
      });

      checkout.on("payment.failed", (payment) => {
        setPurchaseState({
          type: "error",
          message: payment.error?.description || "Payment failed. Please try again.",
        });
        setPurchasing(false);
        setPurchasingPlan("");
      });
      checkout.open();
    } catch (purchaseError) {
      setPurchaseState({
        type: "error",
        message: purchaseError.message || "Unable to start membership checkout.",
      });
      setPurchasing(false);
      setPurchasingPlan("");
    }
  };

  const handleGoldPurchase = () => handlePlanPurchase("gold", "Gold Plan — 20 contact credits", 20);
  const handleDiamondPurchase = () => handlePlanPurchase("diamond", "Diamond Plan — 50 contact credits", 50);

  return (
    <>
      {/* Banner */}
      <div className="mem-banner common-page-banner">
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
                onClick={
                  plan.name === "Gold Plan" ? handleGoldPurchase
                  : plan.name === "Diamond Plan" ? handleDiamondPurchase
                  : undefined
                }
                disabled={plan.name === "Free Plan" || (purchasing && purchasingPlan !== (plan.name === "Gold Plan" ? "gold" : "diamond"))}
              >
                {purchasing && purchasingPlan === "gold" && plan.name === "Gold Plan" ? "Starting checkout…"
                  : purchasing && purchasingPlan === "diamond" && plan.name === "Diamond Plan" ? "Starting checkout…"
                  : plan.name === "Free Plan" ? plan.btn
                  : plan.btn}
              </button>
            </div>
          ))}
        </div>
      </div>

     
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
