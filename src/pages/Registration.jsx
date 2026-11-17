import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL, readApiResponse } from "../api.js";
import { BIRTH_STAR_OPTIONS, CASTE_OPTIONS } from "../constants.js";
import "./Registration.css";

export default function Registration() {
  const navigate = useNavigate();
  const location = useLocation();

  const prefill = location.state || {};
  const previousFormData = prefill.step1FormData || {};

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
  const [startingVerification, setStartingVerification] = useState(false);
  const [verification, setVerification] = useState(null);
  const [verificationToken, setVerificationToken] = useState(
    prefill.registration?.verification_token || "",
  );
  const [emailOtp, setEmailOtp] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResendMessage, setEmailResendMessage] = useState(null);
  const [verificationMessage, setVerificationMessage] = useState(
    prefill.verificationExpired
      ? {
          type: "info",
          text: "Your email verification expired before registration was submitted. Verify your email again.",
        }
      : { type: "", text: "" },
  );
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!verification?.challengeId) return undefined;
    setCurrentTime(Date.now());
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
      && value !== formData[name]
      && (verification || verificationToken)
    ) {
      setVerification(null);
      setVerificationToken("");
      setEmailOtp("");
      setVerificationMessage({
        type: "info",
        text: "Your contact details changed. Request a new email verification code.",
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
          : "Your email is verified. Re-enter your password to continue registration.",
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
      verification_token: token,
    };

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
    if (
      !verification?.emailVerified
      || !verificationToken
    ) {
      setVerificationMessage({
        type: "error",
        text: "Verify your email address before continuing.",
      });
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

      continueRegistration(verificationToken);
    } catch (error) {
      setVerificationMessage({
        type: "error",
        text: error.message || "Could not send verification codes. Please try again.",
      });
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleStartVerification = async (startFresh = false) => {
    if (startingVerification) return;
    setStartingVerification(true);
    setFieldErrors((prev) => ({ ...prev, email: "", phone: "" }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const response = await fetch(`${API_URL}/registrations/verification/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "email",
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          ...(
            verification?.challengeId && !startFresh && !allCodesExpired
              ? { challenge_id: verification.challengeId }
              : {}
          ),
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        const deliveryErrors = result.delivery_errors
          ?.map((item) => item.detail)
          .filter(Boolean)
          .join(" ");
        throw new Error(deliveryErrors || result.detail || "Could not send verification codes.");
      }

      setVerification(createVerificationState(result, Date.now()));
      setVerificationToken(result.verification_token || "");
      setEmailOtp("");

      const deliveryNotes = [];
      const delivery = result.email_delivery;
      if (delivery === "sent") {
        deliveryNotes.push("Email OTP sent.");
      } else if (delivery === "console") {
        deliveryNotes.push("Development mode: the email code is in the backend console; no email was sent.");
      } else if (delivery === "restored") {
        deliveryNotes.push("An email verification code is already active.");
      }
      setVerificationMessage({
        type: delivery === "sent" ? "success" : "info",
        text: deliveryNotes.join(" "),
      });
    } catch (error) {
      setVerificationMessage({
        type: "error",
        text: error.message || "Could not send verification codes. Please try again.",
      });
    } finally {
      setStartingVerification(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verification?.challengeId || verifyingEmail) return;
    setVerifyingEmail(true);
    setVerificationMessage({ type: "", text: "" });
    try {
      const response = await fetch(`${API_URL}/registrations/verification/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel: "email",
          otp: emailOtp,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.detail || "The code could not be verified.");
      setVerification((current) => ({
        ...current,
        emailVerified: result.email_verified,
      }));
      const token = result.verification_token
        || (result.email_verified ? verification.challengeId : "");
      setVerificationToken(token);
      setVerificationMessage({
        type: "success",
        text: "Email verified successfully. You can continue to the next step.",
      });
    } catch (error) {
      setVerificationMessage({
        type: "error",
        text: error.message || "The code could not be verified.",
      });
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleResendEmail = async () => {
    if (!verification?.challengeId || resendingEmail) return;
    setResendingEmail(true);
    setEmailResendMessage(null);
    setVerificationMessage({ type: "", text: "" });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API_URL}/registrations/verification/resend/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel: "email",
        }),
        signal: controller.signal,
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        if (Number.isFinite(result.resend_after) && result.resend_after > 0) {
          setVerification((current) => ({
            ...current,
            resendAfter: Date.now() + result.resend_after * 1000,
          }));
        }
        throw new Error(result.detail || "Could not resend the verification code.");
      }
      const now = Date.now();
      setVerification((current) => ({
        ...current,
        emailVerified: false,
        expiresAt: now
          + (
            result.channel_expires_in?.email
            ?? result.channel_expires_in
            ?? result.expires_in
          ) * 1000,
        resendAfter: now + result.resend_after * 1000,
      }));
      setVerificationToken("");
      setEmailOtp("");
      setEmailResendMessage({
        type: result.delivery === "console" ? "info" : "success",
        text: result.message || "The email verification code was resent.",
      });
    } catch (error) {
      setEmailResendMessage({
        type: "error",
        text: error.name === "AbortError"
          ? "The resend request timed out. Please try again after the cooldown."
          : error.message || "Could not resend the email verification code.",
      });
    } finally {
      window.clearTimeout(timeoutId);
      setResendingEmail(false);
    }
  };

  const minDateOfBirth = "1980-01-01";
  const maxDateOfBirth = "2010-12-31";
  const emailExpired = verification
    ? Math.max(0, Math.ceil((verification.expiresAt - currentTime) / 1000)) === 0
    : false;
  const allCodesExpired = emailExpired;
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

            {/* PHONE */}
            <div className="registration-form-group">
              <label htmlFor="registration-phone">Phone Number *</label>
              <input
                id="registration-phone"
                type="tel"
                name="phone"
                placeholder="Enter Mobile Number"
                value={formData.phone}
                onChange={handleChange}
                required
              />
              {fieldErrors.phone && <small className="registration-field-error" role="alert">{fieldErrors.phone}</small>}
            </div>

            {/* EMAIL */}
            <div className="registration-form-group">

              <label>
                <span>User Email *</span>
              </label>

              <div className="registration-contact-field">
                <div className="registration-contact-control">
                  <input
                    type="email"
                    name="email"
                    placeholder="Enter Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="registration-verify-contact-btn"
                    onClick={() => handleStartVerification()}
                    disabled={
                      startingVerification
                      || (verification?.emailVerified && !allCodesExpired)
                    }
                  >
                    {startingVerification ? "Sending..." : "Verify Email"}
                  </button>
                </div>
                {fieldErrors.email && <small className="registration-field-error" role="alert">{fieldErrors.email}</small>}
                <p className={`registration-channel-status ${verification?.emailVerified ? "verified" : ""}`}>
                  Email: {verification?.emailVerified ? "Verified" : "Not Verified"}
                </p>
                {verification?.challengeId
                  && verification.emailStarted
                  && !verification.emailVerified && (
                  <div className="registration-channel-otp">
                    <label htmlFor="registration-email-otp">Email OTP</label>
                    <div className="registration-contact-control">
                      <input
                        id="registration-email-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="Enter 6-digit email OTP"
                        value={emailOtp}
                        onChange={(event) => setEmailOtp(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )}
                        disabled={emailExpired}
                      />
                      <button
                        type="button"
                        className="registration-verify-contact-btn"
                        onClick={handleVerifyEmail}
                        disabled={verifyingEmail || emailExpired}
                      >
                        {verifyingEmail ? "Verifying..." : "Verify OTP"}
                      </button>
                      <button
                        type="button"
                        className="registration-resend-btn"
                        onClick={handleResendEmail}
                        disabled={
                          resendingEmail
                          || verification.resendAfter > currentTime
                        }
                      >
                        {resendingEmail
                          ? "Sending..."
                          : verification.resendAfter > currentTime
                            ? `Resend in ${formatCountdown(Math.ceil((verification.resendAfter - currentTime) / 1000))}`
                            : "Resend Email OTP"}
                      </button>
                    </div>
                    {emailExpired && <small className="registration-field-error">This code has expired. Request a new code.</small>}
                    {emailResendMessage && (
                      <small className={`registration-resend-message ${emailResendMessage.type}`}>
                        {emailResendMessage.text}
                      </small>
                    )}
                  </div>
                )}
              </div>

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
            {allCodesExpired && (
              <button
                type="button"
                className="registration-resend-btn registration-new-codes-btn"
                onClick={() => handleStartVerification(true)}
                disabled={startingVerification}
              >
                {startingVerification ? "Sending..." : "Request a new email verification code"}
              </button>
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
  const channelExpiry = result.channel_expires_in?.email
    ?? result.channel_expires_in
    ?? result.expires_in;
  const resendAfter = result.resend_after?.email ?? result.resend_after;
  return {
    challengeId: result.challenge_id,
    emailVerified: Boolean(result.email_verified),
    emailStarted: Boolean(result.email_started),
    emailDelivery: result.email_delivery,
    resendAfter: now + resendAfter * 1000,
    expiresAt: now + channelExpiry * 1000,
  };
}

function formatCountdown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
