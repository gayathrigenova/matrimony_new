import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Registration.css";

export default function Registration() {
  const navigate = useNavigate();
  const location = useLocation();

  const prefill = location.state || {};

  const [formData, setFormData] = useState({
    name: prefill.name || "",
    gender: prefill.gender || "",
    date_of_birth: "",
    maritalStatus: "",
    caste: "",
    email: "",
    password: "",
    source: "",
  });

  // =========================
  // HANDLE INPUT CHANGE
  // =========================
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // =========================
  // HANDLE SUBMIT
  // =========================
  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate DOB
    if (!formData.date_of_birth) {
      alert("Please select your complete date of birth.");
      return;
    }

    // Registration data
    const registrationData = {
      full_name: formData.name.trim(),
      gender: formData.gender,
      date_of_birth: formData.date_of_birth,
      marital_status: formData.maritalStatus,
      caste: formData.caste,
      source: formData.source,
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
    };

    console.log("Step 1 Data:", registrationData);

    // Go to Step 2
    navigate("/registration-details", {
      state: {
        registration: registrationData,
      },
    });
  };

  const minDateOfBirth = "1980-01-01";
  const maxDateOfBirth = "2010-12-31";

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

                <option value="Thiyya">
                  Thiyya
                </option>

                <option value="Nair">
                  Nair
                </option>

                <option value="Ezhava">
                  Ezhava
                </option>

                <option value="Brahmin">
                  Brahmin
                </option>

                <option value="Muslim">
                  Muslim
                </option>

                <option value="Christian">
                  Christian
                </option>

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

              <label>
                User Email *
              </label>

              <input
                type="email"
                name="email"
                placeholder="Enter Email"
                value={formData.email}
                onChange={handleChange}
                required
              />

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

            {/* SUBMIT */}
            <button
              type="submit"
              className="registration-submit-btn"
            >
              ENTER
            </button>

          </form>

        </div>

      </section>

    </div>
  );
}
