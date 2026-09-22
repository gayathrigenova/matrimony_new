import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./RegistrationD3.css";

export default function RegistrationStep3() {
  const navigate = useNavigate();
  const location = useLocation();

  // Step 1 + Step 2 data
  const registration = location.state?.registration || null;

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
    houseName: "",
    busStop: "",
    postOffice: "",
    taluk: "",
    village: "",

    // Contact Details
    contactName: "",
    relationship: "",
    countryCode: "+91",
    phone: "",
    extraPhone: "",

    // Terms
    acceptTerms: false,
  });

  // =========================
  // HANDLE INPUT CHANGE
  // =========================
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // =========================
  // SUBMIT REGISTRATION
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Step 1 / Step 2 data missing
    if (!registration) {
      alert("Registration data is missing. Please start again.");
      navigate("/registration");
      return;
    }

    // Terms validation
    if (!formData.acceptTerms) {
      alert("Please accept the Terms & Conditions.");
      return;
    }

    // =========================
    // FINAL REGISTRATION DATA
    // =========================
    const finalData = {
      ...registration,

      // -------------------------
      // Family Details
      // -------------------------
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

      // -------------------------
      // Permanent Address
      // -------------------------
      place: formData.place,
      house_name: formData.houseName,
      bus_stop: formData.busStop,
      post_office: formData.postOffice,
      taluk: formData.taluk,
      village: formData.village,

      // -------------------------
      // Contact Details
      // -------------------------
      contact_name: formData.contactName,
      relationship: formData.relationship,
      country_code: formData.countryCode,
      contact_phone: formData.phone,
      extra_phone: formData.extraPhone,
    };

    console.log("=================================");
    console.log("FINAL REGISTRATION DATA");
    console.log("=================================");
    console.log(finalData);

    try {
      // =========================
      // SEND TO DJANGO BACKEND
      // =========================
      const response = await fetch(
        "http://127.0.0.1:8000/api/registrations/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(finalData),
        }
      );

      const result = await response.json();

      console.log("=================================");
      console.log("REGISTRATION RESPONSE");
      console.log("=================================");
      console.log(result);

      // =========================
      // ERROR RESPONSE
      // =========================
      if (!response.ok) {
        console.error("Registration Error:", result);

        alert(
          "Registration failed.\n\n" +
            JSON.stringify(result, null, 2)
        );

        return;
      }

      // =========================
      // SUCCESS
      // =========================
      alert(
        `Registration submitted successfully!\n\n` +
          `Matrimony ID: ${result.matrimony_id}\n\n` +
          `Your profile is now waiting for admin verification.`
      );

      // Go to login
      navigate("/login");
    } catch (error) {
      console.error("Connection Error:", error);

      alert(
        "Unable to connect to backend server.\n\n" +
          "Please make sure Django server is running."
      );
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
      <div className="reg-step-bar">

        {/* Step 1 */}
        <div className="reg-step-item">
          <div className="reg-step-circle completed">
            ✓
          </div>

          <span className="reg-step-label">
            Basic Info
          </span>
        </div>

        <div className="reg-step-line done"></div>

        {/* Step 2 */}
        <div className="reg-step-item">
          <div className="reg-step-circle completed">
            ✓
          </div>

          <span className="reg-step-label">
            Education
          </span>
        </div>

        <div className="reg-step-line done"></div>

        {/* Step 3 */}
        <div className="reg-step-item">
          <div className="reg-step-circle active">
            3
          </div>

          <span className="reg-step-label">
            Family
          </span>
        </div>
      </div>

      {/* =====================================
          REGISTRATION PAGE
      ====================================== */}
      <div className="registration3-page">
        <div className="registration3-container">

          <form onSubmit={handleSubmit}>

            {/* =================================
                FAMILY DETAILS
            ================================== */}
            <h2 className="section-title">
              Family Details
            </h2>

            {/* Father's Name */}
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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

            {/* Auto Fill */}
            <div className="autofill">
              <label>
                <input
                  type="checkbox"
                  name="autoFill"
                />

                Help me to fill about details
                (Auto filling)
              </label>
            </div>

            <hr className="section-divider" />

            {/* =================================
                PERMANENT ADDRESS
            ================================== */}
            <h2 className="section-title">
              Permanent / Native Address
            </h2>

            {/* Place */}
            <div className="form-group">
              <label>
                Place <span>*</span>
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

                <option value="Kerala">
                  Kerala
                </option>

                <option value="Tamil Nadu">
                  Tamil Nadu
                </option>

                <option value="Karnataka">
                  Karnataka
                </option>
              </select>
            </div>

            {/* House Name */}
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
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

            {/* Taluk */}
            <div className="form-group">
              <label>
                Taluk <span>*</span>
              </label>

              <select
                name="taluk"
                value={formData.taluk}
                onChange={handleChange}
                required
              >
                <option value="">
                  --SELECT--
                </option>

                <option value="Kozhikode">
                  Kozhikode
                </option>

                <option value="Kannur">
                  Kannur
                </option>

                <option value="Malappuram">
                  Malappuram
                </option>

                <option value="Thrissur">
                  Thrissur
                </option>

                <option value="Ernakulam">
                  Ernakulam
                </option>
              </select>
            </div>

            {/* Village */}
            <div className="form-group">
              <label>
                Village <span>*</span>
              </label>

              <select
                name="village"
                value={formData.village}
                onChange={handleChange}
                required
              >
                <option value="">
                  --SELECT--
                </option>

                <option value="Village 1">
                  Village 1
                </option>

                <option value="Village 2">
                  Village 2
                </option>

                <option value="Village 3">
                  Village 3
                </option>
              </select>
            </div>

            <hr className="section-divider" />

            {/* =================================
                CONTACT DETAILS
            ================================== */}
            <h2 className="section-title">
              Contact Details
            </h2>

            {/* Contact Person */}
            <div className="form-group">
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
            <div className="form-group">
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
            <div className="form-group">
              <label>
                Phone Number <span>*</span>
              </label>

              <div className="phone-row">

                <select
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleChange}
                  required
                >
                  <option value="+91">
                    🇮🇳 +91
                  </option>

                  <option value="+971">
                    🇦🇪 +971
                  </option>

                  <option value="+966">
                    🇸🇦 +966
                  </option>

                  <option value="+1">
                    🇺🇸 +1
                  </option>

                  <option value="+44">
                    🇬🇧 +44
                  </option>
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
            <div className="form-group">
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
                TERMS
            ================================== */}
            <div className="checkbox-row">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={formData.acceptTerms}
                onChange={handleChange}
                required
              />

              <label>
                I agree to the
                <a href="#">
                  {" "}Terms &amp; Conditions{" "}
                </a>
                and
                <a href="#">
                  {" "}Privacy Policy
                </a>
                .
              </label>
            </div>

            {/* =================================
                REGISTER BUTTON
            ================================== */}
            <button
              type="submit"
              className="register-btn"
            >
              REGISTER NOW
            </button>

          </form>
        </div>
      </div>
    </>
  );
}