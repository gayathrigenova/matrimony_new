import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./RegistrationDetails1.css";

export default function RegistrationDetails1() {
  const navigate = useNavigate();
  const location = useLocation();

  const registration = location.state?.registration || null;

  const [formData, setFormData] = useState({
    educationLevel: "",
    education: "",
    highestEducation: "",
    occupationLevel: "",
    occupation: "",
    annualIncome: "",
    workLocation: "",
    workingPlace: "",
    height: "",
    disability: "No",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!registration) {
      alert("Registration data is missing. Please start again.");
      navigate("/registration");
      return;
    }

    if (
      !formData.education ||
      !formData.highestEducation ||
      !formData.occupationLevel ||
      !formData.occupation ||
      !formData.annualIncome ||
      !formData.workLocation ||
      !formData.workingPlace ||
      !formData.height
    ) {
      alert("Please fill all required fields.");
      return;
    }

    const updatedRegistration = {
      ...registration,

      // Education
      education_level: formData.educationLevel,
      education: formData.education,
      highest_education: formData.highestEducation,

      // Occupation
      occupation_level: formData.occupationLevel,
      occupation: formData.occupation,
      income: formData.annualIncome,
      work_location: formData.workLocation,
      working_place: formData.workingPlace,

      // Other Details
      height: formData.height,
      disability: formData.disability,
    };

    console.log("Step 1 + Step 2 Data:", updatedRegistration);

    navigate("/registration-details3", {
      state: {
        registration: updatedRegistration,
      },
    });
  };

  return (
    <>
      {/* Banner */}
      <section className="rd1-banner">
        <div className="rd1-banner-content">
          <h1>Find Your Perfect Match</h1>
          <p>
            Join thousands of happy couples who found their life
            partner through Matrimony.
          </p>
        </div>
      </section>

      {/* Step Bar */}
      <div className="rd1-step-bar">
        <div className="rd1-step-item">
          <div className="rd1-step-circle completed">1</div>
          <span className="rd1-step-label">Basic Info</span>
        </div>

        <div className="rd1-step-line active"></div>

        <div className="rd1-step-item">
          <div className="rd1-step-circle active">2</div>
          <span className="rd1-step-label">Education</span>
        </div>

        <div className="rd1-step-line"></div>

        <div className="rd1-step-item">
          <div className="rd1-step-circle">3</div>
          <span className="rd1-step-label">Family</span>
        </div>
      </div>

      {/* Registration Form */}
      <div className="rd1-page">
        <div className="rd1-container">
          <form className="rd1-form" onSubmit={handleSubmit}>
            <div className="rd1-form-heading">
              <span className="rd1-eyebrow">STEP 2 OF 3</span>
              <h2>Education &amp; Career Details</h2>
              <p>Share a few details about your education, work and lifestyle.</p>
            </div>

            {/* Education Level */}
            <div className="rd1-field">
              <label htmlFor="educationLevel">Education Level</label>

              <select
                id="educationLevel"
                name="educationLevel"
                value={formData.educationLevel}
                onChange={handleChange}
              >
                <option value="">Select Education Level</option>
                <option value="School">School</option>
                <option value="Higher Secondary">Higher Secondary</option>
                <option value="Diploma">Diploma</option>
                <option value="Undergraduate">Undergraduate</option>
                <option value="Postgraduate">Postgraduate</option>
                <option value="Doctorate">Doctorate</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Education */}
            <div className="rd1-field">
              <label htmlFor="education">Education <span>*</span></label>

              <input
                type="text"
                id="education"
                name="education"
                placeholder="Enter Education"
                value={formData.education}
                onChange={handleChange}
                required
              />
            </div>

            {/* Highest Education */}
            <div className="rd1-field">
              <label htmlFor="highestEducation">Highest Education <span>*</span></label>

              <input
                type="text"
                id="highestEducation"
                name="highestEducation"
                placeholder="Enter Highest Education"
                value={formData.highestEducation}
                onChange={handleChange}
                required
              />
            </div>

            {/* Occupation Level */}
            <div className="rd1-field">
              <label htmlFor="occupationLevel">Occupation Level <span>*</span></label>

              <select
                id="occupationLevel"
                name="occupationLevel"
                value={formData.occupationLevel}
                onChange={handleChange}
                required
              >
                <option value="">Select Occupation Level</option>
                <option value="Student">Student</option>
                <option value="Private">Private</option>
                <option value="Government">Government</option>
                <option value="Business">Business</option>
                <option value="Self Employed">Self Employed</option>
                <option value="Not Working">Not Working</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Occupation */}
            <div className="rd1-field">
              <label htmlFor="occupation">Occupation <span>*</span></label>

              <input
                type="text"
                id="occupation"
                name="occupation"
                placeholder="Enter Occupation"
                value={formData.occupation}
                onChange={handleChange}
                required
              />
            </div>

            {/* Annual Income */}
            <div className="rd1-field">
              <label htmlFor="annualIncome">Annual Income <span>*</span></label>

              <input
                type="text"
                id="annualIncome"
                name="annualIncome"
                placeholder="Enter Annual Income"
                value={formData.annualIncome}
                onChange={handleChange}
                required
              />
            </div>

            {/* Work Location */}
            <div className="rd1-field">
              <label htmlFor="workLocation">Work Location <span>*</span></label>

              <select
                id="workLocation"
                name="workLocation"
                value={formData.workLocation}
                onChange={handleChange}
                required
              >
                <option value="">Select Work Location</option>
                <option value="India">India</option>
                <option value="UAE">UAE</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
                <option value="Qatar">Qatar</option>
                <option value="Kuwait">Kuwait</option>
                <option value="Oman">Oman</option>
                <option value="Bahrain">Bahrain</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Working Place */}
            <div className="rd1-field">
              <label htmlFor="workingPlace">Working Place <span>*</span></label>

              <input
                type="text"
                id="workingPlace"
                name="workingPlace"
                placeholder="Enter Working Place"
                value={formData.workingPlace}
                onChange={handleChange}
                required
              />
            </div>

            {/* Height */}
            <div className="rd1-field">
              <label htmlFor="height">Height <span>*</span></label>

              <input
                type="text"
                id="height"
                name="height"
                placeholder="Example: 5'5&quot;"
                value={formData.height}
                onChange={handleChange}
                required
              />
            </div>

            {/* Disability */}
            <div className="rd1-field">
              <label htmlFor="disability">Any Disability</label>

              <select
                id="disability"
                name="disability"
                value={formData.disability}
                onChange={handleChange}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="rd1-actions">
              <button
                type="button"
                className="rd1-back-btn"
                onClick={() =>
                  navigate("/registration", {
                    state: {
                      name: registration?.full_name || "",
                      gender: registration?.gender || "",
                    },
                  })
                }
              >
                BACK
              </button>

              <button type="submit" className="rd1-next-btn">
                NEXT
              </button>
            </div>

          </form>
        </div>
      </div>
    </>
  );
}