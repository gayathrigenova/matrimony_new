import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { BIRTH_STAR_OPTIONS, CASTE_OPTIONS } from "../constants.js";
import "./Registration.css";
import "../components/CommonPageBanner.css";

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
    source: previousFormData.source || "",
  });

  const [fieldErrors, setFieldErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.date_of_birth) {
      setFieldErrors((prev) => ({
        ...prev,
        date_of_birth: "Please select your date of birth.",
      }));
      return;
    }

    // Build the partial registration object — credentials collected in Step 3
    const registrationData = {
      full_name: formData.name.trim(),
      gender: formData.gender,
      date_of_birth: formData.date_of_birth,
      birth_star: formData.birth_star,
      marital_status: formData.maritalStatus,
      caste: formData.caste,
      source: formData.source,
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

  const minDateOfBirth = "1980-01-01";
  const maxDateOfBirth = "2010-12-31";

  return (
    <div className="registration-page-wrapper">

      {/* BANNER */}
      <section className="registration-banner common-page-banner">
        <div className="registration-banner-overlay">
          <h1>Find Your Perfect Match</h1>
          <p>
            Join thousands of happy couples who found their
            life partner through Matrimony.
          </p>
        </div>
      </section>

      {/* STEP PROGRESS */}
      <div className="registration-step-bar">
        <div className="registration-step-item">
          <div className="registration-step-circle active">1</div>
          <span className="registration-step-label">Basic Info</span>
        </div>
        <div className="registration-step-line"></div>
        <div className="registration-step-item">
          <div className="registration-step-circle">2</div>
          <span className="registration-step-label">Education</span>
        </div>
        <div className="registration-step-line"></div>
        <div className="registration-step-item">
          <div className="registration-step-circle">3</div>
          <span className="registration-step-label">Family</span>
        </div>
      </div>

      {/* FORM SECTION */}
      <section className="registration-form-section">
        <div className="registration-form-container">
          <form onSubmit={handleSubmit}>

            {/* NAME */}
            <div className="registration-form-group">
              <label>Name of Bride/Groom *</label>
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
              <label>Gender *</label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            {/* DATE OF BIRTH */}
            <div className="registration-form-group">
              <label>Date of Birth *</label>
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
              {fieldErrors.date_of_birth && (
                <small className="registration-field-error" role="alert">
                  {fieldErrors.date_of_birth}
                </small>
              )}
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
              <label>Marital Status *</label>
              <select
                name="maritalStatus"
                value={formData.maritalStatus}
                onChange={handleChange}
                required
              >
                <option value="">Select</option>
                <option value="Unmarried">Unmarried</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
            </div>

            {/* CASTE */}
            <div className="registration-form-group">
              <label>Caste *</label>
              <select
                name="caste"
                value={formData.caste}
                onChange={handleChange}
                required
              >
                <option value="">Select Caste</option>
                {CASTE_OPTIONS.map((caste) => (
                  <option key={caste} value={caste}>{caste}</option>
                ))}
              </select>
            </div>

            {/* SOURCE */}
            <h2 className="registration-section-title">
              How did you know about Keralakaramatrimony?
            </h2>
            <div className="registration-form-group">
              <label>Source *</label>
              <select
                name="source"
                value={formData.source}
                onChange={handleChange}
                required
              >
                <option value="">Select</option>
                <option value="Google Search">Google Search</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="Friend">Friend</option>
                <option value="Advertisement">Advertisement</option>
              </select>
            </div>

            <button type="submit" className="registration-submit-btn">
              CONTINUE
            </button>

          </form>
        </div>
      </section>

    </div>
  );
}
