import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL, readApiResponse } from "../api.js";
import { BIRTH_STAR_OPTIONS, CASTE_OPTIONS } from "../constants.js";
import "./Registration.css";

const PENDING_VERIFICATION_KEY = "matrimony.pendingRegistrationVerification";

export default function Registration() {
  const navigate = useNavigate();
  const location = useLocation();

  const prefill = location.state || {};
  const previousFormData = prefill.step1FormData || {};
  const [savedVerification] = useState(readPendingVerification);

  const [formData, setFormData] = useState({
    name: previousFormData.name || prefill.name || prefill.registration?.full_name || "",
    gender: previousFormData.gender || prefill.gender || prefill.registration?.gender || "",
    date_of_birth: previousFormData.date_of_birth || "",
    birth_star: previousFormData.birth_star || prefill.registration?.birth_star || "",
    maritalStatus: previousFormData.maritalStatus || "",
    caste: previousFormData.caste || "",
    phone: previousFormData.phone || prefill.phone || prefill.registration?.phone || "",
    email: previousFormData.email || prefill.registration?.email || "",
    password: previousFormData.password || prefill.registration?.password || "",
    confirmPassword: previousFormData.confirmPassword || prefill.registration?.password || "",
    source: previousFormData.source || "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [verification, setVerification] = useState(null);
  const [verificationToken, setVerificationToken] = useState(
    prefill.registration?.verification_token || "",
  );
  const [otpValues, setOtpValues] = useState({ email: "", mobile: "" });
  const [verifying, setVerifying] = useState({ email: false, mobile: false });
  const [resending, setResending] = useState({ email: false, mobile: false });
  const [resendMessages, setResendMessages] = useState({ email: null, mobile: null });
  const [verificationMessage, setVerificationMessage] = useState(
    prefill.verificationExpired
      ? {
          type: "info",
          text: "Your verification expired before registration was submitted. Verify your email and mobile number again.",
        }
      : { type: "", text: "" },
  );
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!verification?.challengeId) return undefined;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [verification?.challengeId]);

  // =========================
  // HANDLE INPUT CHANGE
  // =========================
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    if (
      (name === "email" || name === "phone")
      && (verification || verificationToken || savedVerification)
    ) {
      sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
      setVerification(null);
      setVerificationToken("");
      setOtpValues({ email: "", mobile: "" });
      setVerificationMessage({
        type: "info",
        text: "Your contact details changed. Request new verification codes.",
      });
    }
  };

  const continueRegistration = (token) => {
    if (!formData.password || formData.password !== formData.confirmPassword) {
      setVerificationToken(token);
      setVerificationMessage({
        type: "error",
        text: formData.password
          ? "Passwords do not match."
          : "Your contacts are verified. Re-enter your password to continue registration.",
      });
      return;
    }

    const registrationData = {
      full_name: formData.name.trim(),
      gender: formData.gender,
      date_of_birth: formData.date_of_birth,
      birth_star: formData.birth_star,
      marital_status: formData.maritalStatus,
      caste: formData.caste,
      source: formData.source,
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      phone: formData.phone.trim(),
    };

    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
    navigate("/registration-details", {
      state: {
        registration: registrationData,
        step1FormData: formData,
        step2FormData: prefill.step2FormData,
        step3FormData: prefill.step3FormData,
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date_of_birth) {
      setFieldErrors((prev) => ({ ...prev, date_of_birth: "Please select your complete date of birth." }));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: "Passwords do not match." }));
      return;
    }

    setCheckingEmail(true);
    setFieldErrors((prev) => ({ ...prev, email: "", phone: "" }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const availabilityResponse = await fetch(`${API_URL}/registrations/availability/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, phone: formData.phone }),
      });
      const availability = await readApiResponse(availabilityResponse);
      if (availability.errors?.email || availability.errors?.phone) {
        setFieldErrors((prev) => ({
          ...prev,
          email: availability.errors.email || "",
          phone: availability.errors.phone || "",
        }));
        return;
      }
      if (!availabilityResponse.ok) {
        throw new Error(availability.detail || "Could not check these contact details.");
      }

      continueRegistration("");
    } catch (error) {
      setVerificationMessage({
        type: "error",
        text: error.message || "Could not send verification codes. Please try again.",
      });
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleVerify = async (channel) => {
    if (!verification?.challengeId || verifying[channel]) return;
    setVerifying((prev) => ({ ...prev, [channel]: true }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const response = await fetch(`${API_URL}/registrations/verification/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel,
          otp: otpValues[channel],
          ...(channel === "mobile" ? { phone: formData.phone.trim() } : {}),
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.detail || "The code could not be verified.");
      setVerification((current) => ({
        ...current,
        emailVerified: result.email_verified,
        mobileVerified: result.mobile_verified,
      }));
      if (result.verification_token) {
        setVerificationToken(result.verification_token);
        setVerificationMessage({
          type: "success",
          text: "Email and mobile number verified. Continuing registration...",
        });
        continueRegistration(result.verification_token);
      } else {
        setVerificationMessage({
          type: "success",
          text: `${channel === "email" ? "Email" : "Mobile number"} verified successfully.`,
        });
      }
    } catch (error) {
      setVerificationMessage({
        type: "error",
        text: error.message || "The code could not be verified.",
      });
    } finally {
      setVerifying((prev) => ({ ...prev, [channel]: false }));
    }
  };

  const handleResend = async (channel) => {
    if (!verification?.challengeId || resending[channel]) return;
    setResending((current) => ({ ...current, [channel]: true }));
    setResendMessages((current) => ({ ...current, [channel]: null }));
    setVerificationMessage({ type: "", text: "" });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
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
          setVerification((current) => ({
            ...current,
            resendAfter: {
              ...current.resendAfter,
              [channel]: Date.now() + result.resend_after * 1000,
            },
          }));
        }
        throw new Error(result.detail || "Could not resend the verification code.");
      }
      const now = Date.now();
      setVerification((current) => ({
        ...current,
        emailVerified: channel === "email" ? false : current.emailVerified,
        mobileVerified: channel === "mobile" ? false : current.mobileVerified,
        expiresAt: {
          ...current.expiresAt,
          [channel]: now
            + (
              result.channel_expires_in?.[channel]
              ?? result.channel_expires_in
              ?? result.expires_in
            ) * 1000,
        },
        resendAfter: {
          ...current.resendAfter,
          [channel]: now + result.resend_after * 1000,
        },
      }));
      setVerificationToken("");
      setOtpValues((current) => ({ ...current, [channel]: "" }));
      setResendMessages((current) => ({
        ...current,
        [channel]: {
          type: "success",
          text: result.message || "The code was generated, but delivery status is unavailable.",
        },
      }));
    } catch (error) {
      setResendMessages((current) => ({
        ...current,
        [channel]: {
          type: "error",
          text: error.name === "AbortError"
            ? "The resend request timed out. Please try again after the cooldown."
            : error.message || `Could not resend the ${channel} verification code.`,
        },
      }));
    } finally {
      window.clearTimeout(timeoutId);
      setResending((current) => ({ ...current, [channel]: false }));
    }
  };

  const minDateOfBirth = "1980-01-01";
  const maxDateOfBirth = "2010-12-31";
  const channelExpiryRemaining = (channel) => Math.max(
    0,
    Math.ceil((verification.expiresAt[channel] - currentTime) / 1000),
  );
  const emailExpired = verification
    ? channelExpiryRemaining("email") === 0
    : false;
  const mobileExpired = verification
    ? channelExpiryRemaining("mobile") === 0
    : false;
  return (
    <div className="registration-page-wrapper">

      {/* =========================
          BANNER
      ========================= */}
      <section className="registration-banner">

        <div className="registration-banner-overlay">

          <h1>
            Find Your Perfect Match
          </h1>

          <p>
            Join thousands of happy couples who found their
            life partner through Matrimony.
          </p>

        </div>

      </section>

      {/* =========================
          STEP PROGRESS
      ========================= */}
      <div className="registration-step-bar">

        {/* STEP 1 */}
        <div className="registration-step-item">

          <div className="registration-step-circle active">
            1
          </div>

          <span className="registration-step-label">
            Basic Info
          </span>

        </div>

        <div className="registration-step-line"></div>

        {/* STEP 2 */}
        <div className="registration-step-item">

          <div className="registration-step-circle">
            2
          </div>

          <span className="registration-step-label">
            Education
          </span>

        </div>

        <div className="registration-step-line"></div>

        {/* STEP 3 */}
        <div className="registration-step-item">

          <div className="registration-step-circle">
            3
          </div>

          <span className="registration-step-label">
            Family
          </span>

        </div>

      </div>

      {/* =========================
          FORM SECTION
      ========================= */}
      <section className="registration-form-section">

        <div className="registration-form-container">

          <form onSubmit={handleSubmit}>

            {/* NAME */}
            <div className="registration-form-group">

              <label>
                Name of Bride/Groom *
              </label>

              <input
                type="text"
                name="name"
                placeholder="Enter Name"
                value={formData.name}
                onChange={handleChange}
                required
              />

            </div>

            {/* GENDER */}
            <div className="registration-form-group">

              <label>
                Gender *
              </label>

              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select Gender
                </option>

                <option value="Male">
                  Male
                </option>

                <option value="Female">
                  Female
                </option>

              </select>

            </div>

            {/* DATE OF BIRTH */}
            <div className="registration-form-group">

              <label>
                Date of Birth *
              </label>

              <div className="registration-dob">
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  min={minDateOfBirth}
                  max={maxDateOfBirth}
                  required
                />
              </div>

            </div>

            {/* BIRTH STAR */}
            <div className="registration-form-group">
              <label htmlFor="birth_star">Birth Star</label>
              <select
                id="birth_star"
                name="birth_star"
                value={formData.birth_star}
                onChange={handleChange}
              >
                <option value="">Select Birth Star</option>
                {BIRTH_STAR_OPTIONS.map((star) => (
                  <option key={star} value={star}>{star}</option>
                ))}
              </select>
            </div>

            {/* MARITAL STATUS */}
            <div className="registration-form-group">

              <label>
                Marital Status *
              </label>

              <select
                name="maritalStatus"
                value={formData.maritalStatus}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                <option value="Unmarried">
                  Unmarried
                </option>

                <option value="Divorced">
                  Divorced
                </option>

                <option value="Widowed">
                  Widowed
                </option>

              </select>

            </div>

            {/* CASTE */}
            <div className="registration-form-group">

              <label>
                Caste *
              </label>

              <select
                name="caste"
                value={formData.caste}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select Caste
                </option>

                {CASTE_OPTIONS.map((caste) => (
                  <option key={caste} value={caste}>
                    {caste}
                  </option>
                ))}
              </select>

            </div>

            {/* =========================
                LOGIN DETAILS
            ========================= */}

            <h2 className="registration-section-title">
              For Matrimony Login
            </h2>

            {/* EMAIL */}
            <div className="registration-form-group">
              <label>Phone Number *</label>
              <input
                type="tel"
                name="phone"
                placeholder="Enter Mobile Number"
                value={formData.phone}
                onChange={handleChange}
                disabled={checkingEmail && Boolean(savedVerification?.challengeId)}
                required
              />
              {fieldErrors.phone && <small className="registration-field-error" role="alert">{fieldErrors.phone}</small>}
            </div>

            <div className="registration-form-group">

              <label>
                User Email *
              </label>

              <input
                type="email"
                name="email"
                placeholder="Enter Email"
                value={formData.email}
                onChange={handleChange}
                disabled={checkingEmail && Boolean(savedVerification?.challengeId)}
                required
              />
              {fieldErrors.email && <small className="registration-field-error" role="alert">{fieldErrors.email}</small>}

            </div>

            {/* PASSWORD */}
            <div className="registration-form-group">

              <label>
                Password *
              </label>

              <input
                type="password"
                name="password"
                placeholder="Enter Password"
                value={formData.password}
                onChange={handleChange}
                required
              />

            </div>

            <div className="registration-form-group">
              <label>Confirm Password *</label>
              <input
                type="password"
                name="confirmPassword"
                placeholder="Re-enter Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
              {fieldErrors.confirmPassword && <small className="registration-field-error" role="alert">{fieldErrors.confirmPassword}</small>}
            </div>

            {/* =========================
                SOURCE
            ========================= */}

            <h2 className="registration-section-title">
              How did you know about Keralakaramatrimony?
            </h2>

            <div className="registration-form-group">

              <label>
                Source *
              </label>

              <select
                name="source"
                value={formData.source}
                onChange={handleChange}
                required
              >

                <option value="">
                  Select
                </option>

                <option value="Google Search">
                  Google Search
                </option>

                <option value="Facebook">
                  Facebook
                </option>

                <option value="Instagram">
                  Instagram
                </option>

                <option value="Friend">
                  Friend
                </option>

                <option value="Advertisement">
                  Advertisement
                </option>

              </select>

            </div>

            {verificationMessage.text && (
              <p
                className={`registration-verification-message ${verificationMessage.type}`}
                role={verificationMessage.type === "error" ? "alert" : "status"}
              >
                {verificationMessage.text}
              </p>
            )}

            {/* SUBMIT */}
            <button
              type="submit"
              className="registration-submit-btn"
              disabled={checkingEmail}
            >
              {checkingEmail ? "Checking details..." : "CONTINUE"}
            </button>

          </form>

        </div>

      </section>

    </div>
  );
}

function readPendingVerification() {
  try {
    const pending = JSON.parse(
      sessionStorage.getItem(PENDING_VERIFICATION_KEY) || "null",
    );
    if (
      !pending
      || typeof pending.challengeId !== "string"
      || !pending.formData?.email
      || !pending.formData?.phone
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

function persistPendingVerification(challengeId, formData) {
  sessionStorage.setItem(
    PENDING_VERIFICATION_KEY,
    JSON.stringify({
      challengeId,
      formData: {
        ...formData,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: "",
        confirmPassword: "",
      },
    }),
  );
}

function createVerificationState(result, now) {
  const channelExpiry = result.channel_expires_in || {};
  return {
    challengeId: result.challenge_id,
    emailVerified: Boolean(result.email_verified),
    mobileVerified: Boolean(result.mobile_verified),
    mobileDelivery: result.mobile_delivery,
    emailDelivery: result.email_delivery,
    resendAfter: {
      email: now + result.resend_after.email * 1000,
      mobile: now + result.resend_after.mobile * 1000,
    },
    expiresAt: {
      email: now + (channelExpiry.email ?? result.expires_in) * 1000,
      mobile: now + (channelExpiry.mobile ?? result.expires_in) * 1000,
    },
  };
}

function formatCountdown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
