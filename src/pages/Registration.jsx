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
  const [startingChannel, setStartingChannel] = useState(null);
  const [verification, setVerification] = useState(null);
  const [verificationToken, setVerificationToken] = useState(
    prefill.registration?.verification_token || "",
  );
  const [emailOtp, setEmailOtp] = useState("");
  const [mobileOtp, setMobileOtp] = useState("");
  const [verifyingChannel, setVerifyingChannel] = useState(null);
  const [resendingChannel, setResendingChannel] = useState(null);
  const [channelMessages, setChannelMessages] = useState({ email: null, mobile: null });
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
      setMobileOtp("");
      setChannelMessages({ email: null, mobile: null });
      setResendMessages({ email: null, mobile: null });
      setVerificationMessage({
        type: "info",
        text: "Your contact details changed. Request new email and mobile verification codes.",
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
          : "Your email and mobile are verified. Re-enter your password to continue registration.",
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
      || !verification?.mobileVerified
      || !verificationToken
    ) {
      setVerificationMessage({
        type: "error",
        text: "Verify both your email address and mobile number before continuing.",
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

  const handleStartVerification = async (channel) => {
    if (!channel || startingChannel) return;
    setStartingChannel(channel);
    setFieldErrors((prev) => ({
      ...prev,
      [channel === "email" ? "email" : "phone"]: "",
    }));
    setChannelMessages((current) => ({ ...current, [channel]: null }));
    setResendMessages((current) => ({ ...current, [channel]: null }));
    setVerificationMessage({ type: "", text: "" });
    try {
      const response = await fetch(`${API_URL}/registrations/verification/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          ...(
            verification?.challengeId && !allCodesExpired
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
      if (channel === "email") setEmailOtp("");
      else setMobileOtp("");

      const delivery = channel === "email" ? result.email_delivery : result.mobile_delivery;
      const channelName = channel === "email" ? "Email" : "Mobile";
      const message = delivery === "console"
        ? "Development mode: the email code is in the backend console; no email was sent."
        : delivery === "restored"
          ? `A ${channelName.toLowerCase()} verification code is already active.`
          : `${channelName} OTP sent.`;
      setChannelMessages((current) => ({
        ...current,
        [channel]: { type: delivery === "sent" ? "success" : "info", text: message },
      }));
    } catch (error) {
      setChannelMessages((current) => ({
        ...current,
        [channel]: {
          type: "error",
          text: error.message || `Could not send the ${channel} verification code. Please try again.`,
        },
      }));
    } finally {
      setStartingChannel(null);
    }
  };

  const handleVerifyChannel = async (channel) => {
    if (!verification?.challengeId || verifyingChannel) return;
    setVerifyingChannel(channel);
    setVerificationMessage({ type: "", text: "" });
    try {
      const otp = channel === "email" ? emailOtp : mobileOtp;
      const response = await fetch(`${API_URL}/registrations/verification/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel,
          ...(channel === "mobile" ? { phone: formData.phone.trim() } : {}),
          otp,
        }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.detail || "The code could not be verified.");
      setVerification((current) => ({
        ...current,
        emailVerified: result.email_verified,
        mobileVerified: result.mobile_verified,
      }));
      const token = result.verification_token || "";
      setVerificationToken(token);
      setChannelMessages((current) => ({
        ...current,
        [channel]: {
          type: "success",
          text: `${channel === "email" ? "Email" : "Mobile number"} verified successfully.`,
        },
      }));
    } catch (error) {
      setChannelMessages((current) => ({
        ...current,
        [channel]: {
          type: "error",
          text: error.message || `The ${channel} code could not be verified.`,
        },
      }));
    } finally {
      setVerifyingChannel(null);
    }
  };

  const handleResendChannel = async (channel) => {
    if (!verification?.challengeId || resendingChannel) return;
    setResendingChannel(channel);
    setResendMessages((current) => ({ ...current, [channel]: null }));
    setVerificationMessage({ type: "", text: "" });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API_URL}/registrations/verification/resend/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: verification.challengeId,
          channel,
        }),
        signal: controller.signal,
      });
      const result = await readApiResponse(response);
      if (!response.ok) {
        if (Number.isFinite(result.resend_after) && result.resend_after > 0) {
          setVerification((current) => ({
            ...current,
            [`${channel}ResendAfter`]: Date.now() + result.resend_after * 1000,
          }));
        }
        throw new Error(result.detail || "Could not resend the verification code.");
      }
      const now = Date.now();
      setVerification((current) => {
        const channelExpiry = typeof result.channel_expires_in === "object"
          ? result.channel_expires_in?.[channel]
          : result.channel_expires_in ?? result.expires_in;
        const channelResendAfter = typeof result.resend_after === "object"
          ? result.resend_after?.[channel]
          : result.resend_after;
        return {
          ...current,
          [`${channel}Verified`]: false,
          [`${channel}ExpiresAt`]: now + channelExpiry * 1000,
          [`${channel}ResendAfter`]: now + channelResendAfter * 1000,
        };
      });
      setVerificationToken("");
      setChannelMessages((current) => ({ ...current, [channel]: null }));
      if (channel === "email") setEmailOtp("");
      else setMobileOtp("");
      setResendMessages((current) => ({
        ...current,
        [channel]: {
          type: result.delivery === "console" ? "info" : "success",
          text: result.message || `The ${channel} verification code was resent.`,
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
      setResendingChannel(null);
    }
  };

  const minDateOfBirth = "1980-01-01";
  const maxDateOfBirth = "2010-12-31";
  const emailSecondsLeft = verification
    ? Math.max(0, Math.ceil((verification.emailExpiresAt - currentTime) / 1000))
    : 0;
  const mobileSecondsLeft = verification
    ? Math.max(0, Math.ceil((verification.mobileExpiresAt - currentTime) / 1000))
    : 0;
  const emailExpired = verification
    ? emailSecondsLeft === 0
    : false;
  const mobileExpired = verification
    ? mobileSecondsLeft === 0
    : false;
  const allCodesExpired = Boolean(verification) && emailExpired && mobileExpired;
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
              <div className="registration-contact-field">
                <div className="registration-contact-control">
                  <input
                    id="registration-phone"
                    type="tel"
                    name="phone"
                    placeholder="Enter Mobile Number"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="registration-verify-contact-btn"
                    onClick={() => handleStartVerification("mobile")}
                    disabled={
                      startingChannel !== null
                      || !formData.phone.trim()
                      || (verification?.mobileStarted && !allCodesExpired)
                    }
                  >
                    {startingChannel === "mobile" ? "Sending..." : "Send Mobile OTP"}
                  </button>
                </div>
              </div>
              {fieldErrors.phone && <small className="registration-field-error" role="alert">{fieldErrors.phone}</small>}
              <p className={`registration-channel-status ${verification?.mobileVerified ? "verified" : ""}`}>
                Mobile: {verification?.mobileVerified ? "Verified" : "Not Verified"}
              </p>
              {channelMessages.mobile && (
                <small
                  className={`registration-resend-message ${channelMessages.mobile.type}`}
                  role={channelMessages.mobile.type === "error" ? "alert" : "status"}
                >
                  {channelMessages.mobile.text}
                </small>
              )}
              {verification?.challengeId
                && verification.mobileStarted
                && !verification.mobileVerified && (
                <div className="registration-channel-otp">
                  <label htmlFor="registration-mobile-otp">Mobile OTP</label>
                  <p className="registration-otp-countdown" role="timer">
                    {mobileExpired
                      ? "Mobile code expired."
                      : `Mobile code expires in ${formatCountdown(mobileSecondsLeft)}.`}
                  </p>
                  <div className="registration-contact-control">
                    <input
                      id="registration-mobile-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="Enter 6-digit mobile OTP"
                      value={mobileOtp}
                      onChange={(event) => setMobileOtp(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )}
                      disabled={mobileExpired}
                    />
                    <button
                      type="button"
                      className="registration-verify-contact-btn"
                      onClick={() => handleVerifyChannel("mobile")}
                      disabled={verifyingChannel !== null || mobileExpired}
                    >
                      {verifyingChannel === "mobile" ? "Verifying..." : "Verify OTP"}
                    </button>
                    <button
                      type="button"
                      className="registration-resend-btn"
                      onClick={() => handleResendChannel("mobile")}
                      disabled={
                        resendingChannel !== null
                        || verification.mobileResendAfter > currentTime
                      }
                    >
                      {resendingChannel === "mobile"
                        ? "Sending..."
                        : verification.mobileResendAfter > currentTime
                          ? `Resend in ${formatCountdown(Math.ceil((verification.mobileResendAfter - currentTime) / 1000))}`
                          : "Resend Mobile OTP"}
                    </button>
                  </div>
                  {mobileExpired && <small className="registration-field-error">This code has expired. Request a new code.</small>}
                  {resendMessages.mobile && (
                    <small className={`registration-resend-message ${resendMessages.mobile.type}`}>
                      {resendMessages.mobile.text}
                    </small>
                  )}
                </div>
              )}
            </div>

            {/* EMAIL */}
            <div className="registration-form-group">

              <label htmlFor="registration-email">
                <span>User Email *</span>
              </label>

              <div className="registration-contact-field">
                <div className="registration-contact-control">
                  <input
                    type="email"
                    id="registration-email"
                    name="email"
                    placeholder="Enter Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                  <button
                    type="button"
                    className="registration-verify-contact-btn"
                    onClick={() => handleStartVerification("email")}
                    disabled={
                      startingChannel !== null
                      || !formData.email.trim()
                      || (verification?.emailStarted && !allCodesExpired)
                    }
                  >
                    {startingChannel === "email" ? "Sending..." : "Send Email OTP"}
                  </button>
                </div>
                {fieldErrors.email && <small className="registration-field-error" role="alert">{fieldErrors.email}</small>}
                <p className={`registration-channel-status ${verification?.emailVerified ? "verified" : ""}`}>
                  Email: {verification?.emailVerified ? "Verified" : "Not Verified"}
                </p>
                {channelMessages.email && (
                  <small
                    className={`registration-resend-message ${channelMessages.email.type}`}
                    role={channelMessages.email.type === "error" ? "alert" : "status"}
                  >
                    {channelMessages.email.text}
                  </small>
                )}
                {verification?.challengeId
                  && verification.emailStarted
                  && !verification.emailVerified && (
                  <div className="registration-channel-otp">
                    <label htmlFor="registration-email-otp">Email OTP</label>
                    <p className="registration-otp-countdown" role="timer">
                      {emailExpired
                        ? "Email code expired."
                        : `Email code expires in ${formatCountdown(emailSecondsLeft)}.`}
                    </p>
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
                        onClick={() => handleVerifyChannel("email")}
                        disabled={verifyingChannel !== null || emailExpired}
                      >
                        {verifyingChannel === "email" ? "Verifying..." : "Verify OTP"}
                      </button>
                      <button
                        type="button"
                        className="registration-resend-btn"
                        onClick={() => handleResendChannel("email")}
                        disabled={
                          resendingChannel !== null
                          || verification.emailResendAfter > currentTime
                        }
                      >
                        {resendingChannel === "email"
                          ? "Sending..."
                          : verification.emailResendAfter > currentTime
                            ? `Resend in ${formatCountdown(Math.ceil((verification.emailResendAfter - currentTime) / 1000))}`
                            : "Resend Email OTP"}
                      </button>
                    </div>
                    {emailExpired && <small className="registration-field-error">This code has expired. Request a new code.</small>}
                    {resendMessages.email && (
                      <small className={`registration-resend-message ${resendMessages.email.type}`}>
                        {resendMessages.email.text}
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
