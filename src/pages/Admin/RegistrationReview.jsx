import { API_URL } from "../../api.js";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function RegistrationReview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [registration, setRegistration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [reason, setReason] = useState("");

  const token = localStorage.getItem("access_token");

  // ==========================================
  // FETCH REGISTRATION DETAILS
  // ==========================================
  const fetchRegistration = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/adminpanel/registrations/${id}/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("admin_user");

        navigate("/admin/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("Fetch Error:", data);
        alert("Unable to load registration details.");
        return;
      }

      setRegistration(data);
    } catch (error) {
      console.error("Connection Error:", error);
      alert("Unable to connect to backend server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistration();
  }, [id]);

  // ==========================================
  // ADMIN ACTION
  // ==========================================
  const handleAction = async (action) => {
    let message = "";

    if (action === "correction") {
      if (!reason.trim()) {
        alert("Please enter the correction reason.");
        return;
      }

      message = "Are you sure you want to request correction?";
    }

    if (action === "reject") {
      if (!reason.trim()) {
        alert("Please enter the rejection reason.");
        return;
      }

      message = "Are you sure you want to reject this registration?";
    }

    if (action === "approve") {
      message = "Are you sure you want to approve this registration?";
    }

    if (action === "publish") {
      message = "Are you sure you want to publish this profile?";
    }

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);

      const url = `${API_URL}/adminpanel/registrations/${id}/${action}/`;

      const body =
        action === "correction" || action === "reject"
          ? JSON.stringify({
              reason: reason.trim(),
            })
          : null;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("admin_user");

        navigate("/admin/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        console.error("Action Error:", data);

        alert(
          data.detail ||
            data.message ||
            "Unable to complete this action."
        );

        return;
      }

      alert(
        data.message ||
          `Registration ${action} action completed successfully.`
      );

      setReason("");

      await fetchRegistration();

    } catch (error) {
      console.error("Action Connection Error:", error);

      alert("Unable to connect to backend server.");
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // LOADING
  // ==========================================
  if (loading) {
    return (
      <div style={styles.center}>
        <h3>Loading registration details...</h3>
      </div>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================
  if (!registration) {
    return (
      <div style={styles.center}>
        <h3>Registration not found.</h3>

        <button
          style={styles.backButton}
          onClick={() => navigate("/admin/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // ==========================================
  // SUPPORT BOTH RESPONSE FORMATS
  // ==========================================
  const data = registration.registration || registration;

  const verification =
    registration.verification || {};

  // ==========================================
  // STATUS
  // ==========================================
  const status =
    verification.status ||
    data.status ||
    "PENDING";

  return (
    <div style={styles.page}>

      {/* ======================================
          HEADER
      ======================================= */}
      <div style={styles.header}>

        <div>
          <h1 style={styles.title}>
            Registration Review
          </h1>

          <p style={styles.subtitle}>
            Review client details before approval.
          </p>
        </div>

        <button
          style={styles.backButton}
          onClick={() =>
            navigate("/admin/dashboard")
          }
        >
          ← Back
        </button>

      </div>

      {/* ======================================
          STATUS CARD
      ======================================= */}
      <div style={styles.statusCard}>

        <div>
          <span style={styles.statusLabel}>
            Matrimony ID
          </span>

          <strong style={styles.matrimonyId}>
            {data.matrimony_id || "N/A"}
          </strong>
        </div>

        <div>
          <span style={styles.statusLabel}>
            Current Status
          </span>

          <span
            style={{
              ...styles.status,
              ...getStatusStyle(status),
            }}
          >
            {formatStatus(status)}
          </span>
        </div>

      </div>

      {/* ======================================
          PERSONAL INFORMATION
      ======================================= */}
      <Section title="Personal Information">

        <Info label="Full Name" value={data.full_name} />
        <Info label="Gender" value={data.gender} />
        <Info
          label="Date of Birth"
          value={data.date_of_birth}
        />
        <Info label="Religion" value={data.religion} />
        <Info label="Caste" value={data.caste} />
        <Info
          label="Marital Status"
          value={data.marital_status}
        />
        <Info label="Height" value={data.height} />
        <Info
          label="Disability"
          value={data.disability}
        />

      </Section>

      {/* ======================================
          LOCATION
      ======================================= */}
      <Section title="Current Location">

        <Info label="Address" value={data.address} />
        <Info label="City" value={data.city} />
        <Info label="District" value={data.district} />
        <Info label="State" value={data.state} />

      </Section>

      {/* ======================================
          EDUCATION
      ======================================= */}
      <Section title="Education">

        <Info
          label="Education Level"
          value={data.education_level}
        />

        <Info
          label="Education"
          value={data.education}
        />

        <Info
          label="Highest Education"
          value={data.highest_education}
        />

      </Section>

      {/* ======================================
          CAREER
      ======================================= */}
      <Section title="Occupation & Career">

        <Info
          label="Occupation Level"
          value={data.occupation_level}
        />

        <Info
          label="Occupation"
          value={data.occupation}
        />

        <Info
          label="Company"
          value={data.company}
        />

        <Info
          label="Income"
          value={data.income}
        />

        <Info
          label="Work Location"
          value={data.work_location}
        />

        <Info
          label="Working Place"
          value={data.working_place}
        />

      </Section>

      {/* ======================================
          CONTACT
      ======================================= */}
      <Section title="Contact Information">

        <Info
          label="Phone"
          value={data.phone}
        />

        <Info
          label="Alternate Phone"
          value={data.alternate_phone}
        />

        <Info
          label="Contact Person"
          value={data.contact_name}
        />

        <Info
          label="Relationship"
          value={data.relationship}
        />

        <Info
          label="Country Code"
          value={data.country_code}
        />

        <Info
          label="Contact Phone"
          value={data.contact_phone}
        />

        <Info
          label="Additional Phone"
          value={data.extra_phone}
        />

      </Section>

      {/* ======================================
          FAMILY DETAILS
      ======================================= */}
      <Section title="Family Details">

        <Info
          label="Father's Name"
          value={data.father_name}
        />

        <Info
          label="Father's Occupation"
          value={data.father_occupation}
        />

        <Info
          label="Mother's Name"
          value={data.mother_name}
        />

        <Info
          label="Mother's Occupation"
          value={data.mother_occupation}
        />

        <Info
          label="Brothers"
          value={data.brothers}
        />

        <Info
          label="Married Brothers"
          value={data.married_brothers}
        />

        <Info
          label="Sisters"
          value={data.sisters}
        />

        <Info
          label="Married Sisters"
          value={data.married_sisters}
        />

        <Info
          label="Financial Level"
          value={data.financial_level}
        />

        <Info
          label="About Family"
          value={data.about_family}
          full
        />

      </Section>

      {/* ======================================
          PERMANENT ADDRESS
      ======================================= */}
      <Section title="Permanent / Native Address">

        <Info label="Place" value={data.place} />
        <Info
          label="House Name / Flat"
          value={data.house_name}
        />
        <Info
          label="Place / Bus Stop"
          value={data.bus_stop}
        />
        <Info
          label="Post Office / Pin Code"
          value={data.post_office}
        />
        <Info label="Taluk" value={data.taluk} />
        <Info label="Village" value={data.village} />

      </Section>

      {/* ======================================
          ABOUT
      ======================================= */}
      <Section title="About">

        <Info
          label="About"
          value={data.about}
          full
        />

        <Info
          label="Registration Source"
          value={data.source}
        />

      </Section>

      {/* ======================================
          DOCUMENTS
      ======================================= */}
      <Section title="Documents">

        <Document
          label="Profile Photo"
          url={data.profile_photo}
        />

        <Document
          label="Identity Document"
          url={data.identity_document}
        />

        <Document
          label="Additional Document"
          url={data.additional_document}
        />

      </Section>

      {/* ======================================
          ADMIN VERIFICATION
      ======================================= */}
      <div style={styles.actionCard}>

        <h2 style={styles.actionTitle}>
          Admin Verification
        </h2>

        <p style={styles.actionDescription}>
          Check all client details and documents
          before taking an action.
        </p>

        {/* Reason */}
        <textarea
          value={reason}
          onChange={(e) =>
            setReason(e.target.value)
          }
          placeholder="Enter correction or rejection reason..."
          rows={4}
          style={styles.textarea}
        />

        {/* Buttons */}
        <div style={styles.actions}>

          <button
            style={styles.approveButton}
            disabled={actionLoading}
            onClick={() =>
              handleAction("approve")
            }
          >
            ✓ Approve
          </button>

          <button
            style={styles.correctionButton}
            disabled={actionLoading}
            onClick={() =>
              handleAction("correction")
            }
          >
            ✎ Request Correction
          </button>

          <button
            style={styles.rejectButton}
            disabled={actionLoading}
            onClick={() =>
              handleAction("reject")
            }
          >
            ✕ Reject
          </button>

          {status === "APPROVED" && (
            <button
              style={styles.publishButton}
              disabled={actionLoading}
              onClick={() =>
                handleAction("publish")
              }
            >
              ✓ Publish Profile
            </button>
          )}

        </div>

      </div>

    </div>
  );
}

/* ==========================================
   SECTION COMPONENT
========================================== */

function Section({ title, children }) {
  return (
    <div style={styles.section}>

      <h2 style={styles.sectionTitle}>
        {title}
      </h2>

      <div style={styles.grid}>
        {children}
      </div>

    </div>
  );
}

/* ==========================================
   INFO COMPONENT
========================================== */

function Info({ label, value, full = false }) {
  return (
    <div
      style={{
        ...styles.infoBox,
        ...(full ? styles.full : {}),
      }}
    >
      <span style={styles.infoLabel}>
        {label}
      </span>

      <span style={styles.infoValue}>
        {value !== null &&
        value !== undefined &&
        value !== ""
          ? String(value)
          : "Not provided"}
      </span>
    </div>
  );
}

/* ==========================================
   DOCUMENT COMPONENT
========================================== */

function Document({ label, url }) {
  return (
    <div style={styles.documentBox}>

      <span style={styles.infoLabel}>
        {label}
      </span>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.documentLink}
        >
          View Document
        </a>
      ) : (
        <span style={styles.noDocument}>
          Not uploaded
        </span>
      )}

    </div>
  );
}

/* ==========================================
   STATUS HELPERS
========================================== */

function formatStatus(status) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    );
}

function getStatusStyle(status) {
  switch (status) {
    case "APPROVED":
      return styles.approvedStatus;

    case "REJECTED":
      return styles.rejectedStatus;

    case "CORRECTION_REQUIRED":
      return styles.correctionStatus;

    case "PUBLISHED":
      return styles.publishedStatus;

    case "UNDER_REVIEW":
      return styles.reviewStatus;

    default:
      return styles.pendingStatus;
  }
}

/* ==========================================
   STYLES
========================================== */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fa",
    padding: "35px",
    boxSizing: "border-box",
  },

  header: {
    maxWidth: "1200px",
    margin: "0 auto 25px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    color: "#04273c",
  },

  subtitle: {
    marginTop: "8px",
    color: "#687580",
  },

  backButton: {
    border: "none",
    background: "#04273c",
    color: "#fff",
    padding: "11px 20px",
    borderRadius: "7px",
    cursor: "pointer",
    fontSize: "14px",
  },

  statusCard: {
    maxWidth: "1200px",
    margin: "0 auto 20px",
    background: "#fff",
    padding: "22px",
    borderRadius: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  },

  statusLabel: {
    display: "block",
    fontSize: "12px",
    color: "#7a8790",
    marginBottom: "6px",
  },

  matrimonyId: {
    fontSize: "20px",
    color: "#04273c",
  },

  status: {
    display: "inline-block",
    padding: "7px 13px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
  },

  pendingStatus: {
    background: "#fff3cd",
    color: "#856404",
  },

  reviewStatus: {
    background: "#dbeafe",
    color: "#1e40af",
  },

  approvedStatus: {
    background: "#dcfce7",
    color: "#166534",
  },

  rejectedStatus: {
    background: "#fee2e2",
    color: "#991b1b",
  },

  correctionStatus: {
    background: "#ffedd5",
    color: "#9a3412",
  },

  publishedStatus: {
    background: "#e0e7ff",
    color: "#3730a3",
  },

  section: {
    maxWidth: "1200px",
    margin: "0 auto 20px",
    background: "#fff",
    borderRadius: "12px",
    padding: "25px",
    boxSizing: "border-box",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
  },

  sectionTitle: {
    margin: "0 0 20px",
    color: "#04273c",
    fontSize: "20px",
    borderBottom: "1px solid #eee",
    paddingBottom: "12px",
  },

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "15px",
  },

  infoBox: {
    background: "#f8fafc",
    borderRadius: "8px",
    padding: "13px",
    minHeight: "55px",
    boxSizing: "border-box",
  },

  full: {
    gridColumn: "1 / -1",
  },

  infoLabel: {
    display: "block",
    fontSize: "12px",
    color: "#7a8790",
    marginBottom: "5px",
  },

  infoValue: {
    display: "block",
    color: "#1f2933",
    fontSize: "14px",
    lineHeight: "1.5",
  },

  documentBox: {
    background: "#f8fafc",
    borderRadius: "8px",
    padding: "15px",
  },

  documentLink: {
    display: "inline-block",
    marginTop: "5px",
    color: "#075985",
    fontWeight: "600",
    textDecoration: "none",
  },

  noDocument: {
    color: "#999",
    fontSize: "14px",
  },

  actionCard: {
    maxWidth: "1200px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "12px",
    padding: "25px",
    boxSizing: "border-box",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
  },

  actionTitle: {
    margin: "0 0 8px",
    color: "#04273c",
  },

  actionDescription: {
    color: "#687580",
    fontSize: "14px",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    border: "1px solid #d8dee4",
    borderRadius: "7px",
    resize: "vertical",
    fontFamily: "inherit",
    fontSize: "14px",
    marginTop: "10px",
    outline: "none",
  },

  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "18px",
  },

  approveButton: {
    border: "none",
    background: "#198754",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "7px",
    cursor: "pointer",
    fontWeight: "600",
  },

  correctionButton: {
    border: "none",
    background: "#f59e0b",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "7px",
    cursor: "pointer",
    fontWeight: "600",
  },

  rejectButton: {
    border: "none",
    background: "#dc3545",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "7px",
    cursor: "pointer",
    fontWeight: "600",
  },

  publishButton: {
    border: "none",
    background: "#4f46e5",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "7px",
    cursor: "pointer",
    fontWeight: "600",
  },

  center: {
    minHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "15px",
  },
};
