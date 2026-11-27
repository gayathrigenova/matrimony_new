import { API_URL, readApiResponse } from "../api.js";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./RegistrationD3.css";
import { TERMS_TEXT, PRIVACY_TEXT } from "../data/legalTexts";
import { INDIAN_STATES, STATE_CITIES } from "../data/indianStatesCities";

const KERALA_DISTRICTS = [
  "Thiruvananthapuram",
  "Kollam",
  "Pathanamthitta",
  "Alappuzha",
  "Kottayam",
  "Idukki",
  "Ernakulam",
  "Thrissur",
  "Palakkad",
  "Malappuram",
  "Kozhikode",
  "Wayanad",
  "Kannur",
  "Kasaragod",
];

export default function RegistrationStep3() {
  const navigate = useNavigate();
  const location = useLocation();

  // Step 1 + Step 2 data
  const registration = location.state?.registration || null;

  const [legalModal, setLegalModal] = useState(null);
  const [formData, setFormData] = useState({
    // Family Details
    fatherName: "",
    fatherOccupation: "",
    motherName: "",
    motherOccupation: "",
    brothers: "0",
    marriedBrothers: "0",
    sisters: "0",
    marriedSisters: "0",
    financialLevel: "",
    aboutFamily: "",

    // Permanent / Native Address
    place: "",
    city: "",
    houseName: "",
    busStop: "",
    postOffice: "",
    district: "",
    village: "",

    // Contact Details
    contactName: "",
    relationship: "",
    countryCode: "+91",
    phone: "",
    extraPhone: "",

    // Terms
    acceptTerms: false,
    ...location.state?.step3FormData,
  });

  // =========================
  // LOGIN DETAILS STATE
  // =========================
  const savedLogin = location.state?.loginFormData || {};
  const [loginData, setLoginData] = useState({
    loginCountryCode: savedLogin.loginCountryCode || "+91",
    loginPhone: savedLogin.loginPhone || "",
    loginEmail: savedLogin.loginEmail || "",
    loginPassword: savedLogin.loginPassword || "",
    loginConfirmPassword: savedLogin.loginConfirmPassword || "",
  });
  const [loginErrors, setLoginErrors] = useState({});
  const [verification, setVerification] = useState(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [mobileOtp, setMobileOtp] = useState("");
  const [startingChannel, setStartingChannel] = useState(null);
  const [verifyingChannel, setVerifyingChannel] = useState(null);
  const [resendingChannel, setResendingChannel] = useState(null);
  const [channelMessages, setChannelMessages] = useState({ email: null, mobile: null });
  const [resendMessages, setResendMessages] = useState({ email: null, mobile: null });
  const [otpErrors, setOtpErrors] = useState({ email: "", mobile: "" });
  const [verificationMessage, setVerificationMessage] = useState({ type: "", text: "" });
  const [currentTime, setCurrentTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!verification?.challengeId) return undefined;
    setCurrentTime(Date.now());
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verification?.challengeId]);

  const emailSecondsLeft = verification
    ? Math.max(0, Math.ceil((verification.emailExpiresAt - currentTime) / 1000))
    : 0;
  const mobileSecondsLeft = verification
    ? Math.max(0, Math.ceil((verification.mobileExpiresAt - currentTime) / 1000))
    : 0;
  const emailExpired = Boolean(verification) && emailSecondsLeft === 0;
  const mobileExpired = Boolean(verification) && mobileSecondsLeft === 0;
  const allCodesExpired = Boolean(verification) && emailExpired && mobileExpired;

  const isIndian = loginData.loginCountryCode === "+91";
  const phoneDigits = loginData.loginPhone.replace(/\D/g, "");
  const phoneValid = isIndian ? phoneDigits.length === 10 : loginData.loginPhone.trim().length >= 5;

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    let next = value;
    if (name === "loginPhone") {
      next = value.replace(/[^0-9]/g, "");
      if (isIndian) next = next.slice(0, 10);
    }
    setLoginData((prev) => ({ ...prev, [name]: next }));
    setLoginErrors((prev) => ({ ...prev, [name]: "" }));
    if ((name === "loginEmail" || name === "loginPhone") && (verification || verificationToken)) {
      setVerification(null);
      setVerificationToken("");
      setEmailOtp("");
      setMobileOtp("");
      setChannelMessages({ email: null, mobile: null });
      setResendMessages({ email: null, mobile: null });
      setOtpErrors({ email: "", mobile: "" });
      setVerificationMessage({ type: "info", text: "Contact details changed. Request new verification codes." });
    }
    if (name === "loginCountryCode" && (verification || verificationToken)) {
      setVerification(null);
      setVerificationToken("");
      setMobileOtp("");
      setChannelMessages((c) => ({ ...c, mobile: null }));
      setResendMessages((c) => ({ ...c, mobile: null }));
      setOtpErrors((c) => ({ ...c, mobile: "" }));
    }
  };

  const handleStartVerification = async (channel) => {
    if (!channel || startingChannel) return;
    if (channel === "mobile" && !phoneValid) {
      setLoginErrors((prev) => ({ ...prev, loginPhone: isIndian ? "Enter a valid 10-digit mobile number." : "Enter a valid mobile number." }));
      return;
    }
    setStartingChannel(channel);
    setChannelMessages((c) => ({ ...c, [channel]: null }));
    setResendMessages((c) => ({ ...c, [channel]: null }));
    setOtpErrors((c) => ({ ...c, [channel]: "" }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const body = {
        channel,
        email: loginData.loginEmail.trim().toLowerCase(),
        phone: loginData.loginPhone.trim(),
        ...(verification?.challengeId && !allCodesExpired ? { challenge_id: verification.challengeId } : {}),
      };
      const response = await fetch(`${API_URL}/registrations/verification/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        const deliveryErrors = result.delivery_errors?.map((i) => i.detail).filter(Boolean).join(" ");
        throw new Error(deliveryErrors || result.detail || "Could not send verification code.");
      }
      setVerification(createVerificationState(result, Date.now()));
      setVerificationToken(result.verification_token || "");
      if (channel === "email") setEmailOtp(""); else setMobileOtp("");
      const delivery = channel === "email" ? result.email_delivery : result.mobile_delivery;
      const label = channel === "email" ? "Email" : "Mobile";
      const msg = delivery === "console"
        ? "Dev mode: check backend console for the code."
        : delivery === "restored"
          ? `A ${label.toLowerCase()} verification code is already active.`
          : `${label} OTP sent.`;
      setChannelMessages((c) => ({ ...c, [channel]: { type: delivery === "sent" ? "success" : "info", text: msg } }));
    } catch (err) {
      setChannelMessages((c) => ({ ...c, [channel]: { type: "error", text: err.message || `Could not send the ${channel} verification code.` } }));
    } finally {
      setStartingChannel(null);
    }
  };

  const handleVerifyChannel = async (channel) => {
    if (!verification?.challengeId || verifyingChannel) return;
    setVerifyingChannel(channel);
    setOtpErrors((c) => ({ ...c, [channel]: "" }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const otp = channel === "email" ? emailOtp : mobileOtp;
      const response = await fetch(`${API_URL}/registrations/verification/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel,
          ...(channel === "mobile" ? { phone: loginData.loginPhone.trim() } : {}),
          otp,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.detail || "incorrect");
      setVerification((cur) => ({ ...cur, emailVerified: result.email_verified, mobileVerified: result.mobile_verified }));
      setVerificationToken(result.verification_token || "");
      setChannelMessages((c) => ({ ...c, [channel]: { type: "success", text: `${channel === "email" ? "Email" : "Mobile number"} verified successfully.` } }));
    } catch (err) {
      const msg = /incorrect|invalid|wrong|code/i.test(err.message) ? "The verification code is incorrect." : err.message || "The verification code is incorrect.";
      setOtpErrors((c) => ({ ...c, [channel]: msg }));
    } finally {
      setVerifyingChannel(null);
    }
  };

  const handleResendChannel = async (channel) => {
    if (!verification?.challengeId || resendingChannel) return;
    setResendingChannel(channel);
    setResendMessages((c) => ({ ...c, [channel]: null }));
    setOtpErrors((c) => ({ ...c, [channel]: "" }));
    setVerificationMessage({ type: "", text: "" });
    const controller = new AbortController();
    const tid = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API_URL}/registrations/verification/resend/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: verification.challengeId, channel }),
        signal: controller.signal,
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        if (Number.isFinite(result.resend_after) && result.resend_after > 0) {
          setVerification((cur) => ({ ...cur, [`${channel}ResendAfter`]: Date.now() + result.resend_after * 1000 }));
        }
        throw new Error(result.detail || "Could not resend the verification code.");
      }
      const now = Date.now();
      setVerification((cur) => {
        const expiry = typeof result.channel_expires_in === "object" ? result.channel_expires_in?.[channel] : result.channel_expires_in ?? result.expires_in;
        const resendAfter = typeof result.resend_after === "object" ? result.resend_after?.[channel] : result.resend_after;
        return { ...cur, [`${channel}Verified`]: false, [`${channel}ExpiresAt`]: now + expiry * 1000, [`${channel}ResendAfter`]: now + resendAfter * 1000 };
      });
      setVerificationToken("");
      setChannelMessages((c) => ({ ...c, [channel]: null }));
      if (channel === "email") setEmailOtp(""); else setMobileOtp("");
      setResendMessages((c) => ({ ...c, [channel]: { type: result.delivery === "console" ? "info" : "success", text: result.message || `The ${channel} verification code was resent.` } }));
    } catch (err) {
      setResendMessages((c) => ({ ...c, [channel]: { type: "error", text: err.name === "AbortError" ? "Resend timed out. Try again after the cooldown." : err.message || `Could not resend the ${channel} code.` } }));
    } finally {
      window.clearTimeout(tid);
      setResendingChannel(null);
    }
  };

  // =========================
  // HANDLE INPUT CHANGE
  // =========================
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "place" ? { city: "" } : {}),
    }));
  };

  // =========================
  // SUBMIT REGISTRATION
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!registration) {
      alert("Registration data is missing. Please start again.");
      navigate("/registration");
      return;
    }

    if (!formData.acceptTerms) {
      alert("Please accept the Terms & Conditions.");
      return;
    }

    // Inline validation for login fields
    const errors = {};
    if (!loginData.loginPhone.trim()) errors.loginPhone = "Mobile number is required.";
    else if (isIndian && phoneDigits.length !== 10) errors.loginPhone = "Enter a valid 10-digit mobile number.";
    if (!loginData.loginEmail.trim()) errors.loginEmail = "Email is required.";
    if (!loginData.loginPassword) errors.loginPassword = "Password is required.";
    if (loginData.loginPassword !== loginData.loginConfirmPassword) errors.loginConfirmPassword = "Passwords do not match.";
    if (Object.keys(errors).length > 0) { setLoginErrors(errors); return; }

    if (!verification?.emailVerified || !verification?.mobileVerified || !verificationToken) {
      setVerificationMessage({ type: "error", text: "Verify both your email address and mobile number before submitting." });
      return;
    }

    setSubmitting(true);
    setVerificationMessage({ type: "", text: "" });
    try {
      // Availability check
      const availRes = await fetch(`${API_URL}/registrations/availability/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginData.loginEmail.trim().toLowerCase(), phone: loginData.loginPhone.trim() }),
      });
      const avail = await readApiResponse(availRes);
      if (avail.errors?.email || avail.errors?.phone) {
        setLoginErrors((prev) => ({ ...prev, loginEmail: avail.errors.email || "", loginPhone: avail.errors.phone || "" }));
        return;
      }
      if (!availRes.ok) throw new Error(avail.detail || "Could not check contact details.");

      const finalData = {
        ...registration,
        // Login credentials
        email: loginData.loginEmail.trim().toLowerCase(),
        phone: loginData.loginPhone.trim(),
        password: loginData.loginPassword,
        verification_token: verificationToken,
        // Family Details
        father_name: formData.fatherName,
        father_occupation: formData.fatherOccupation,
        mother_name: formData.motherName,
        mother_occupation: formData.motherOccupation,
        brothers: Number(formData.brothers),
        married_brothers: Number(formData.marriedBrothers),
        sisters: Number(formData.sisters),
        married_sisters: Number(formData.marriedSisters),
        financial_level: formData.financialLevel,
        about_family: formData.aboutFamily,
        // Permanent Address
        place: formData.place,
        state: formData.place,
        city: formData.city,
        house_name: formData.houseName,
        bus_stop: formData.busStop,
        post_office: formData.postOffice,
        district: formData.district,
        village: formData.village,
        // Contact Details
        contact_name: formData.contactName,
        relationship: formData.relationship,
        country_code: formData.countryCode,
        contact_phone: formData.phone,
        extra_phone: formData.extraPhone,
      };

      const response = await fetch(`${API_URL}/registrations/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData),
      });
      const result = await readApiResponse(response);

      if (!response.ok) {
        if (result.verification_token) {
          const verificationError = Array.isArray(result.verification_token)
            ? result.verification_token.join(" ")
            : String(result.verification_token);
          if (/expired/i.test(verificationError)) {
            // Reset verification state on Step 3 — do not redirect to Step 1
            setVerification(null);
            setVerificationToken("");
            setEmailOtp("");
            setMobileOtp("");
            setChannelMessages({ email: null, mobile: null });
            setResendMessages({ email: null, mobile: null });
            setOtpErrors({ email: "", mobile: "" });
            setVerificationMessage({ type: "error", text: "Your verification expired. Please verify your email and mobile number again." });
            return;
          }
          alert(verificationError);
          return;
        }
        console.error("Registration Error:", result);
        alert("Registration failed.\n\n" + JSON.stringify(result, null, 2));
        return;
      }

      alert(`Registration submitted successfully!\n\nMatrimony ID: ${result.matrimony_id}\n\nYour profile is now waiting for admin verification.`);
      navigate("/login");
    } catch (error) {
      console.error("Connection Error:", error);
      setVerificationMessage({ type: "error", text: error.message || "Unable to connect to the server. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* =====================================
          BANNER
      ====================================== */}
      <div className="reg3-banner">
        <div className="reg3-banner-content">
          <h1>Family & Contact Details</h1>

          <p>
            Almost done! Fill in your family and address details
            to complete registration.
          </p>
        </div>
      </div>

      {/* =====================================
          STEP PROGRESS
      ====================================== */}
      <div className="reg3-step-bar">

        {/* Step 1 */}
        <div className="reg3-step-item">
          <div className="reg3-step-circle completed">
            &#10003;
          </div>

          <span className="reg3-step-label">
            Basic Info
          </span>
        </div>

        <div className="reg3-step-line done"></div>

        {/* Step 2 */}
        <div className="reg3-step-item">
          <div className="reg3-step-circle completed">
            &#10003;
          </div>

          <span className="reg3-step-label">
            Education
          </span>
        </div>

        <div className="reg3-step-line done"></div>

        {/* Step 3 */}
        <div className="reg3-step-item">
          <div className="reg3-step-circle active">
            3
          </div>

          <span className="reg3-step-label">
            Family
          </span>
        </div>
      </div>

      {/* =====================================
          REGISTRATION PAGE
      ====================================== */}
      <div className="reg3-page">
        <div className="reg3-container">

          <form onSubmit={handleSubmit}>

            {/* =================================
                FAMILY DETAILS
            ================================== */}
            <h2 className="reg3-section-title">
              Family Details
            </h2>

            {/* Father's Name */}
            <div className="reg3-form-group">
              <label>
                Father's Name <span>*</span>
              </label>

              <input
                type="text"
                name="fatherName"
                value={formData.fatherName}
                onChange={handleChange}
                required
              />
            </div>

            {/* Father's Occupation */}
            <div className="reg3-form-group">
              <label>
                Father's Status / Occupation <span>*</span>
              </label>

              <input
                type="text"
                name="fatherOccupation"
                value={formData.fatherOccupation}
                onChange={handleChange}
                required
              />
            </div>

            {/* Mother's Name */}
            <div className="reg3-form-group">
              <label>
                Mother's Name <span>*</span>
              </label>

              <input
                type="text"
                name="motherName"
                value={formData.motherName}
                onChange={handleChange}
                required
              />
            </div>

            {/* Mother's Occupation */}
            <div className="reg3-form-group">
              <label>
                Mother's Status / Occupation <span>*</span>
              </label>

              <input
                type="text"
                name="motherOccupation"
                value={formData.motherOccupation}
                onChange={handleChange}
                required
              />
            </div>

            {/* Brothers */}
            <div className="reg3-form-group">
              <label>
                No of Brothers <span>*</span>
              </label>

              <select
                name="brothers"
                value={formData.brothers}
                onChange={handleChange}
                required
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Married Brothers */}
            <div className="reg3-form-group">
              <label>
                No of Brothers Married <span>*</span>
              </label>

              <select
                name="marriedBrothers"
                value={formData.marriedBrothers}
                onChange={handleChange}
                required
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Sisters */}
            <div className="reg3-form-group">
              <label>
                No of Sisters <span>*</span>
              </label>

              <select
                name="sisters"
                value={formData.sisters}
                onChange={handleChange}
                required
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Married Sisters */}
            <div className="reg3-form-group">
              <label>
                No of Sisters Married <span>*</span>
              </label>

              <select
                name="marriedSisters"
                value={formData.marriedSisters}
                onChange={handleChange}
                required
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Level */}
            <div className="reg3-form-group">
              <label>
                Family Financial Level <span>*</span>
              </label>

              <select
                name="financialLevel"
                value={formData.financialLevel}
                onChange={handleChange}
                required
              >
                <option value="">
                  --SELECT--
                </option>

                <option value="Middle Class">
                  Middle Class
                </option>

                <option value="Upper Middle Class">
                  Upper Middle Class
                </option>

                <option value="Rich">
                  Rich
                </option>
              </select>
            </div>

            {/* About Family */}
            <div className="reg3-form-group">
              <label>
                About You & Family
              </label>

              <textarea
                rows="4"
                name="aboutFamily"
                placeholder="Maximum 150 words"
                value={formData.aboutFamily}
                onChange={handleChange}
              />
            </div>

            <hr className="reg3-section-divider" />

            {/* =================================
                PERMANENT ADDRESS
            ================================== */}
            <h2 className="reg3-section-title">
              Permanent / Native Address
            </h2>

            {/* State */}
            <div className="reg3-form-group">
              <label>
                State <span>*</span>
              </label>

              <select
                name="place"
                value={formData.place}
                onChange={handleChange}
                required
              >
                <option value="">
                  --SELECT--
                </option>

                {INDIAN_STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            {/* City */}
            <div className="reg3-form-group">
              <label>
                City <span>*</span>
              </label>

              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                disabled={!formData.place}
              >
                <option value="">
                  {formData.place ? "--SELECT--" : "Select State first"}
                </option>

                {(STATE_CITIES[formData.place] || []).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* House Name */}
            <div className="reg3-form-group">
              <label>
                House Name / Flat Name & No.{" "}
                <span>*</span>
              </label>

              <input
                type="text"
                name="houseName"
                value={formData.houseName}
                onChange={handleChange}
                required
              />
            </div>

            {/* Bus Stop */}
            <div className="reg3-form-group">
              <label>
                Place / Bus Stop <span>*</span>
              </label>

              <input
                type="text"
                name="busStop"
                value={formData.busStop}
                onChange={handleChange}
                required
              />
            </div>

            {/* Post Office */}
            <div className="reg3-form-group">
              <label>
                Post Office / Pin Code <span>*</span>
              </label>

              <input
                type="text"
                name="postOffice"
                value={formData.postOffice}
                onChange={handleChange}
                required
              />
            </div>

            {/* Village */}
            <div className="reg3-form-group">
              <label>
                Village <span>*</span>
              </label>

              <input
                type="text"
                name="village"
                value={formData.village}
                onChange={handleChange}
                placeholder="Enter village"
                required
              />
            </div>

            <hr className="reg3-section-divider" />

            {/* =================================
                CONTACT DETAILS
            ================================== */}
            <h2 className="reg3-section-title">
              Guardian / Parent Details
            </h2>

            {/* Contact Person */}
            <div className="reg3-form-group">
              <label>
                Contact Person Name <span>*</span>
              </label>

              <input
                type="text"
                name="contactName"
                value={formData.contactName}
                onChange={handleChange}
                required
              />
            </div>

            {/* Relationship */}
            <div className="reg3-form-group">
              <label>
                Relationship <span>*</span>
              </label>

              <input
                type="text"
                name="relationship"
                value={formData.relationship}
                onChange={handleChange}
                required
              />
            </div>

            {/* Phone */}
            <div className="reg3-form-group">
              <label>
                Phone Number <span>*</span>
              </label>

              <div className="reg3-phone-row">

                <select
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleChange}
                  required
                >
                  <option value="+91">+91</option>
                  <option value="+971">+971</option>
                  <option value="+966">+966</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>

                <input
                  type="tel"
                  name="phone"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Additional Phone */}
            <div className="reg3-form-group">
              <label>
                Additional Contact Number
              </label>

              <input
                type="tel"
                name="extraPhone"
                placeholder="Optional"
                value={formData.extraPhone}
                onChange={handleChange}
              />
            </div>

            {/* =================================
                FOR MATRIMONY LOGIN
            ================================== */}
            <hr className="reg3-section-divider" />
            <h2 className="reg3-section-title">For Matrimony Login</h2>

            {/* MOBILE NUMBER */}
            <div className="reg3-form-group">
              <label>Phone Number <span>*</span></label>
              <div className="reg3-login-contact-field">
                <div className="reg3-login-phone-row">
                  <select
                    name="loginCountryCode"
                    value={loginData.loginCountryCode}
                    onChange={handleLoginChange}
                  >
                    <option value="+91">+91 India</option>
                    <option value="+971">+971 UAE</option>
                    <option value="+966">+966 Saudi</option>
                    <option value="+1">+1 USA</option>
                    <option value="+44">+44 UK</option>
                  </select>
                  <input
                    type="tel"
                    name="loginPhone"
                    placeholder={isIndian ? "10-digit mobile number" : "Mobile number"}
                    value={loginData.loginPhone}
                    onChange={handleLoginChange}
                    inputMode="numeric"
                    maxLength={isIndian ? 10 : 15}
                    required
                  />
                  <button
                    type="button"
                    className="reg3-otp-send-btn"
                    onClick={() => handleStartVerification("mobile")}
                    disabled={startingChannel !== null || !phoneValid || (verification?.mobileStarted && !allCodesExpired)}
                  >
                    {startingChannel === "mobile" ? "Sending..." : "Send OTP"}
                  </button>
                </div>
                {loginErrors.loginPhone && <small className="reg3-field-error" role="alert">{loginErrors.loginPhone}</small>}
                <p className={`reg3-channel-status${verification?.mobileVerified ? " verified" : ""}`}>
                  Mobile: {verification?.mobileVerified ? "Verified ✓" : "Not Verified"}
                </p>
                {channelMessages.mobile && (
                  <small className={`reg3-channel-msg ${channelMessages.mobile.type}`} role={channelMessages.mobile.type === "error" ? "alert" : "status"}>
                    {channelMessages.mobile.text}
                  </small>
                )}
                {verification?.challengeId && verification.mobileStarted && !verification.mobileVerified && (
                  <div className="reg3-otp-block">
                    <p className="reg3-otp-countdown" role="timer">
                      {mobileExpired ? "Mobile code expired." : `Expires in ${formatCountdown(mobileSecondsLeft)}`}
                    </p>
                    <div className="reg3-otp-input-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6-digit mobile OTP"
                        value={mobileOtp}
                        onChange={(ev) => { setMobileOtp(ev.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErrors((c) => ({ ...c, mobile: "" })); }}
                        disabled={mobileExpired}
                      />
                      <button type="button" className="reg3-otp-send-btn" onClick={() => handleVerifyChannel("mobile")} disabled={verifyingChannel !== null || mobileExpired}>
                        {verifyingChannel === "mobile" ? "Verifying..." : "Verify OTP"}
                      </button>
                      <button type="button" className="reg3-otp-resend-btn" onClick={() => handleResendChannel("mobile")} disabled={resendingChannel !== null || verification.mobileResendAfter > currentTime}>
                        {resendingChannel === "mobile" ? "Sending..." : verification.mobileResendAfter > currentTime ? `Resend in ${formatCountdown(Math.ceil((verification.mobileResendAfter - currentTime) / 1000))}` : "Resend OTP"}
                      </button>
                    </div>
                    {otpErrors.mobile && <small className="reg3-field-error" role="alert">{otpErrors.mobile}</small>}
                    {mobileExpired && <small className="reg3-field-error">Code expired. Request a new one.</small>}
                    {resendMessages.mobile && <small className={`reg3-channel-msg ${resendMessages.mobile.type}`}>{resendMessages.mobile.text}</small>}
                  </div>
                )}
              </div>
            </div>

            {/* EMAIL */}
            <div className="reg3-form-group">
              <label>User Email <span>*</span></label>
              <div className="reg3-login-contact-field">
                <div className="reg3-login-email-row">
                  <input
                    type="email"
                    name="loginEmail"
                    placeholder="Enter email address"
                    value={loginData.loginEmail}
                    onChange={handleLoginChange}
                    required
                  />
                  <button
                    type="button"
                    className="reg3-otp-send-btn"
                    onClick={() => handleStartVerification("email")}
                    disabled={startingChannel !== null || !loginData.loginEmail.trim() || (verification?.emailStarted && !allCodesExpired)}
                  >
                    {startingChannel === "email" ? "Sending..." : "Send OTP"}
                  </button>
                </div>
                {loginErrors.loginEmail && <small className="reg3-field-error" role="alert">{loginErrors.loginEmail}</small>}
                <p className={`reg3-channel-status${verification?.emailVerified ? " verified" : ""}`}>
                  Email: {verification?.emailVerified ? "Verified ✓" : "Not Verified"}
                </p>
                {channelMessages.email && (
                  <small className={`reg3-channel-msg ${channelMessages.email.type}`} role={channelMessages.email.type === "error" ? "alert" : "status"}>
                    {channelMessages.email.text}
                  </small>
                )}
                {verification?.challengeId && verification.emailStarted && !verification.emailVerified && (
                  <div className="reg3-otp-block">
                    <p className="reg3-otp-countdown" role="timer">
                      {emailExpired ? "Email code expired." : `Expires in ${formatCountdown(emailSecondsLeft)}`}
                    </p>
                    <div className="reg3-otp-input-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6-digit email OTP"
                        value={emailOtp}
                        onChange={(ev) => { setEmailOtp(ev.target.value.replace(/\D/g, "").slice(0, 6)); setOtpErrors((c) => ({ ...c, email: "" })); }}
                        disabled={emailExpired}
                      />
                      <button type="button" className="reg3-otp-send-btn" onClick={() => handleVerifyChannel("email")} disabled={verifyingChannel !== null || emailExpired}>
                        {verifyingChannel === "email" ? "Verifying..." : "Verify OTP"}
                      </button>
                      <button type="button" className="reg3-otp-resend-btn" onClick={() => handleResendChannel("email")} disabled={resendingChannel !== null || verification.emailResendAfter > currentTime}>
                        {resendingChannel === "email" ? "Sending..." : verification.emailResendAfter > currentTime ? `Resend in ${formatCountdown(Math.ceil((verification.emailResendAfter - currentTime) / 1000))}` : "Resend OTP"}
                      </button>
                    </div>
                    {otpErrors.email && <small className="reg3-field-error" role="alert">{otpErrors.email}</small>}
                    {emailExpired && <small className="reg3-field-error">Code expired. Request a new one.</small>}
                    {resendMessages.email && <small className={`reg3-channel-msg ${resendMessages.email.type}`}>{resendMessages.email.text}</small>}
                  </div>
                )}
              </div>
            </div>

            {/* PASSWORD */}
            <div className="reg3-form-group">
              <label>Password <span>*</span></label>
              <div>
                <input
                  type="password"
                  name="loginPassword"
                  placeholder="Enter password"
                  value={loginData.loginPassword}
                  onChange={handleLoginChange}
                  required
                />
                {loginErrors.loginPassword && <small className="reg3-field-error" role="alert">{loginErrors.loginPassword}</small>}
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div className="reg3-form-group">
              <label>Confirm Password <span>*</span></label>
              <div>
                <input
                  type="password"
                  name="loginConfirmPassword"
                  placeholder="Re-enter password"
                  value={loginData.loginConfirmPassword}
                  onChange={handleLoginChange}
                  required
                />
                {loginErrors.loginConfirmPassword && <small className="reg3-field-error" role="alert">{loginErrors.loginConfirmPassword}</small>}
              </div>
            </div>

            {verificationMessage.text && (
              <p className={`reg3-verification-msg ${verificationMessage.type}`} role={verificationMessage.type === "error" ? "alert" : "status"}>
                {verificationMessage.text}
              </p>
            )}

            {/* =================================
                TERMS
            ================================== */}
            <div className="reg3-checkbox-row">
              <input
                type="checkbox"
                name="acceptTerms"
                id="acceptTerms"
                checked={formData.acceptTerms}
                onChange={handleChange}
                required
              />

               <label htmlFor="acceptTerms">
                 I agree to the
                 <button type="button" className="reg3-legal-link" onClick={() => setLegalModal('terms')}>
                   {" "}Terms &amp; Conditions{" "}
                 </button>
                 and
                 <button type="button" className="reg3-legal-link" onClick={() => setLegalModal('privacy')}>
                   {" "}Privacy Policy
                 </button>
                 .
               </label>
            </div>

            {/* =================================
                REGISTER BUTTON
            ================================== */}
            <div className="reg3-actions">
              <button
                type="button"
                className="reg3-back-btn"
                onClick={() => navigate("/registration-details", {
                  state: {
                    registration,
                    step1FormData: location.state?.step1FormData,
                    step2FormData: location.state?.step2FormData,
                    step3FormData: formData,
                    loginFormData: loginData,
                  },
                })}
              >
                BACK
              </button>
              <button type="submit" className="reg3-register-btn" disabled={submitting}>
                {submitting ? "Submitting..." : "REGISTER NOW"}
              </button>
            </div>

          </form>
        </div>
      </div>

      {legalModal && (
        <div className="reg3-legal-overlay" onClick={() => setLegalModal(null)}>
          <div className="reg3-legal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reg3-legal-header">
              <h2>{legalModal === "terms" ? "Terms of Use – Keralakkara Matrimony" : "Privacy Policy – Keralakkara Matrimony"}</h2>
              <span className="reg3-legal-updated">Last Updated: January 1, 2025</span>
              <button className="reg3-legal-close" onClick={() => setLegalModal(null)} aria-label="Close">&times;</button>
            </div>
            <div className="reg3-legal-content">
              <pre>{legalModal === "terms" ? TERMS_TEXT : PRIVACY_TEXT}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function createVerificationState(result, now) {
  const emailExpiry = result.channel_expires_in?.email ?? result.expires_in;
  const mobileExpiry = result.channel_expires_in?.mobile ?? result.expires_in;
  const emailResendAfter = result.resend_after?.email ?? result.resend_after;
  const mobileResendAfter = result.resend_after?.mobile ?? result.resend_after;
  return {
    challengeId: result.challenge_id,
    emailVerified: Boolean(result.email_verified),
    mobileVerified: Boolean(result.mobile_verified),
    emailStarted: Boolean(result.email_started),
    mobileStarted: Boolean(result.mobile_started),
    emailDelivery: result.email_delivery,
    mobileDelivery: result.mobile_delivery,
    emailResendAfter: now + emailResendAfter * 1000,
    mobileResendAfter: now + mobileResendAfter * 1000,
    emailExpiresAt: now + emailExpiry * 1000,
    mobileExpiresAt: now + mobileExpiry * 1000,
  };
}

function formatCountdown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
