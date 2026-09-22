import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminDashboard.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING");
  const [error, setError] = useState("");

  // =====================================================
  // NORMALIZE STATUS
  // =====================================================

  const normalizeStatus = (status) => {
    if (!status) return "PENDING";

    const value = String(status).trim().toUpperCase();

    switch (value) {
      case "PENDING":
        return "PENDING";

      case "UNDER_REVIEW":
      case "UNDER REVIEW":
        return "UNDER_REVIEW";

      case "APPROVED":
      case "PUBLISHED":
        return "APPROVED";

      case "REJECTED":
        return "REJECTED";

      case "CORRECTION_REQUIRED":
      case "CORRECTION REQUIRED":
        return "CORRECTION_REQUIRED";

      default:
        return value;
    }
  };

  // =====================================================
  // FETCH REGISTRATIONS
  // =====================================================

  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("access_token");

      if (!token) {
        navigate("/admin/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/adminpanel/registrations/`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      console.log("ADMIN API RESPONSE:", data);

      // =================================================
      // TOKEN ERROR
      // =================================================

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");

        navigate("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            "Unable to load registrations."
        );
      }

      // =================================================
      // HANDLE DIFFERENT API RESPONSE FORMATS
      // =================================================

      let registrationList = [];

      if (Array.isArray(data)) {
        registrationList = data;
      } else if (Array.isArray(data.results)) {
        registrationList = data.results;
      } else if (Array.isArray(data.registrations)) {
        registrationList = data.registrations;
      } else {
        registrationList = [];
      }

      // =================================================
      // FORMAT DATA
      // =================================================

      const formattedData = registrationList.map((item) => {
        const registration = item.registration || item;
        const verification = item.verification || {};

        /*
          IMPORTANT:

          Backend may have status in:
          registration.status
          OR
          verification.status

          Verification status is preferred.
        */

        const rawStatus =
          verification.status ||
          registration.status ||
          "PENDING";

        const normalizedStatus = normalizeStatus(rawStatus);

        return {
          ...registration,

          verification,

          verification_status: normalizedStatus,

          // Use normalized status for dashboard
          dashboard_status: normalizedStatus,
        };
      });

      console.log(
        "FORMATTED ADMIN REGISTRATIONS:",
        formattedData
      );

      setRegistrations(formattedData);
    } catch (error) {
      console.error("Admin Dashboard Error:", error);

      setError(
        error.message || "Failed to load registrations."
      );

      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // INITIAL LOAD
  // =====================================================

  useEffect(() => {
    fetchRegistrations();
  }, []);

  // =====================================================
  // COUNTS
  // =====================================================

  const totalCount = registrations.length;

  const pendingCount = registrations.filter(
    (item) => item.dashboard_status === "PENDING"
  ).length;

  const reviewCount = registrations.filter(
    (item) => item.dashboard_status === "UNDER_REVIEW"
  ).length;

  const approvedCount = registrations.filter(
    (item) => item.dashboard_status === "APPROVED"
  ).length;

  const rejectedCount = registrations.filter(
    (item) => item.dashboard_status === "REJECTED"
  ).length;

  // =====================================================
  // FILTER
  // =====================================================

  const filteredRegistrations = registrations.filter(
    (registration) =>
      registration.dashboard_status === filter
  );

  // =====================================================
  // LOGOUT
  // =====================================================

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("admin_user");

    navigate("/admin/login");
  };

  // =====================================================
  // VIEW REGISTRATION
  // =====================================================

  const handleView = (registration) => {
    /*
      We use registration.id here.

      Example:
      /admin/view/5
    */

    if (!registration.id) {
      console.error(
        "Registration ID missing:",
        registration
      );
      return;
    }

    navigate(`/admin/view/${registration.id}`);
  };

  // =====================================================
  // STATUS TEXT
  // =====================================================

  const getStatusText = (status) => {
    switch (status) {
      case "PENDING":
        return "PENDING";

      case "UNDER_REVIEW":
        return "UNDER REVIEW";

      case "APPROVED":
        return "APPROVED";

      case "REJECTED":
        return "REJECTED";

      case "CORRECTION_REQUIRED":
        return "CORRECTION REQUIRED";

      default:
        return status || "-";
    }
  };

  // =====================================================
  // STATUS CLASS
  // =====================================================

  const getStatusClass = (status) => {
    switch (status) {
      case "PENDING":
        return "pending";

      case "UNDER_REVIEW":
        return "under-review";

      case "APPROVED":
        return "approved";

      case "REJECTED":
        return "rejected";

      case "CORRECTION_REQUIRED":
        return "correction-required";

      default:
        return "";
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="admin-dashboard">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Registration Checking Panel</p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="logout-btn"
        >
          Logout
        </button>
      </header>

      {/* =================================================
          STATISTICS
      ================================================= */}

      <div className="admin-stats">

        {/* TOTAL */}

        <div className="stat-card">
          <h3>Total</h3>
          <strong>{totalCount}</strong>
        </div>

        {/* PENDING */}

        <div className="stat-card pending">
          <h3>Pending</h3>
          <strong>{pendingCount}</strong>
        </div>

        {/* UNDER REVIEW */}

        <div className="stat-card review">
          <h3>Under Review</h3>
          <strong>{reviewCount}</strong>
        </div>

        {/* APPROVED */}

        <div className="stat-card approved">
          <h3>Approved</h3>
          <strong>{approvedCount}</strong>
        </div>

        {/* REJECTED */}

        <div className="stat-card rejected">
          <h3>Rejected</h3>
          <strong>{rejectedCount}</strong>
        </div>

      </div>

      {/* =================================================
          CONTENT
      ================================================= */}

      <div className="admin-content">

        {/* =================================================
            FILTER BUTTONS
        ================================================= */}

        <div className="filter-buttons">

          <button
            type="button"
            className={
              filter === "PENDING"
                ? "active"
                : ""
            }
            onClick={() => setFilter("PENDING")}
          >
            Pending
          </button>

          <button
            type="button"
            className={
              filter === "UNDER_REVIEW"
                ? "active"
                : ""
            }
            onClick={() =>
              setFilter("UNDER_REVIEW")
            }
          >
            Under Review
          </button>

          <button
            type="button"
            className={
              filter === "APPROVED"
                ? "active"
                : ""
            }
            onClick={() => setFilter("APPROVED")}
          >
            Approved
          </button>

          <button
            type="button"
            className={
              filter === "REJECTED"
                ? "active"
                : ""
            }
            onClick={() => setFilter("REJECTED")}
          >
            Rejected
          </button>

        </div>

        {/* =================================================
            ERROR
        ================================================= */}

        {error && (
          <div className="empty-state">
            <h3>Unable to load registrations</h3>
            <p>{error}</p>

            <button
              type="button"
              className="view-btn"
              onClick={fetchRegistrations}
              style={{ marginTop: "15px" }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* =================================================
            LOADING
        ================================================= */}

        {!error && loading && (
          <p className="loading-text">
            Loading registrations...
          </p>
        )}

        {/* =================================================
            EMPTY
        ================================================= */}

        {!error &&
          !loading &&
          filteredRegistrations.length === 0 && (
            <div className="empty-state">

              <h3>No registrations found</h3>

              <p>
                There are no{" "}
                {getStatusText(filter).toLowerCase()}{" "}
                registrations.
              </p>

            </div>
          )}

        {/* =================================================
            TABLE
        ================================================= */}

        {!error &&
          !loading &&
          filteredRegistrations.length > 0 && (

            <div className="registration-table-wrapper">

              <table className="registration-table">

                <thead>
                  <tr>
                    <th>Matrimony ID</th>
                    <th>Name</th>
                    <th>Gender</th>
                    <th>DOB</th>
                    <th>Caste</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>

                  {filteredRegistrations.map(
                    (registration) => (

                      <tr
                        key={
                          registration.id ||
                          registration.matrimony_id
                        }
                      >

                        {/* MATRIMONY ID */}

                        <td>
                          {registration.matrimony_id ||
                            "Not Generated"}
                        </td>

                        {/* NAME */}

                        <td>
                          {registration.full_name ||
                            registration.name ||
                            "-"}
                        </td>

                        {/* GENDER */}

                        <td>
                          {registration.gender || "-"}
                        </td>

                        {/* DOB */}

                        <td>
                          {registration.date_of_birth ||
                            registration.dob ||
                            "-"}
                        </td>

                        {/* CASTE */}

                        <td>
                          {registration.caste || "-"}
                        </td>

                        {/* STATUS */}

                        <td>

                          <span
                            className={`status ${getStatusClass(
                              registration.dashboard_status
                            )}`}
                          >
                            {getStatusText(
                              registration.dashboard_status
                            )}
                          </span>

                        </td>

                        {/* ACTION */}

                        <td>

                          <button
                            type="button"
                            className="view-btn"
                            onClick={() =>
                              handleView(
                                registration
                              )
                            }
                          >
                            View
                          </button>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

      </div>

    </div>
  );
}