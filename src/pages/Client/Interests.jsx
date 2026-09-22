import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./Interests.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function Interests() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("received");

  const [receivedInterests, setReceivedInterests] = useState([]);
  const [sentInterests, setSentInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("access_token");

  // =========================================================
  // FETCH INTERESTS
  // =========================================================

  const fetchInterests = async () => {
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const [receivedResponse, sentResponse] = await Promise.all([
        fetch(`${API_URL}/registrations/interests/received/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),

        fetch(`${API_URL}/registrations/interests/sent/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      if (!receivedResponse.ok || !sentResponse.ok) {
        throw new Error("Failed to load interests.");
      }

      const receivedData = await receivedResponse.json();
      const sentData = await sentResponse.json();

      setReceivedInterests(
        receivedData.results || receivedData || []
      );

      setSentInterests(
        sentData.results || sentData || []
      );
    } catch (err) {
      console.error("Interests error:", err);
      setError("Failed to load interests.");
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    fetchInterests();
  }, [token, navigate]);

  // =========================================================
  // ACCEPT / DECLINE INTEREST
  // =========================================================

  const handleInterestUpdate = async (interestId, action) => {
    try {
      const response = await fetch(
        `${API_URL}/registrations/interest/${interestId}/update/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Failed to ${action} interest.`
        );
      }

      // Refresh both lists
      await fetchInterests();
    } catch (err) {
      console.error("Interest update error:", err);
      alert(err.message);
    }
  };

  // =========================================================
  // FILTER LISTS
  // =========================================================

  // Received interests except declined ones
  const receivedList = receivedInterests.filter(
    (item) => item.status !== "DECLINED"
  );

  // Sent interests except declined ones
  const sentList = sentInterests.filter(
    (item) => item.status !== "DECLINED"
  );

  // Rejected interests
  //
  // These are interests that were declined.
  // We combine received + sent because the API provides
  // the status from both lists.
  const rejectedList = [
    ...receivedInterests,
    ...sentInterests,
  ].filter(
    (item) => item.status === "DECLINED"
  );

  // =========================================================
  // CURRENT TAB LIST
  // =========================================================

  let listToDisplay = [];

  if (activeTab === "received") {
    listToDisplay = receivedList;
  } else if (activeTab === "sent") {
    listToDisplay = sentList;
  } else if (activeTab === "rejected") {
    listToDisplay = rejectedList;
  }

  // =========================================================
  // EMPTY MESSAGE
  // =========================================================

  const getEmptyTitle = () => {
    if (activeTab === "received") {
      return "No Interests Received Yet";
    }

    if (activeTab === "sent") {
      return "No Interests Sent Yet";
    }

    return "No Rejected Interests";
  };

  const getEmptyDescription = () => {
    if (activeTab === "received") {
      return "When other members send you an interest request, it will appear here.";
    }

    if (activeTab === "sent") {
      return "You have not sent interest requests to any members yet.";
    }

    return "Rejected interest requests will appear here.";
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <ClientLayout>
      <div className="interests-container">

        {/* =================================================
            HEADER
        ================================================= */}

        <div className="interests-header">
          <h1>Interests</h1>

          <p>
            Manage interest requests received from and sent
            to other members.
          </p>
        </div>

        {/* =================================================
            TABS
        ================================================= */}

        <div className="interests-tabs">

          {/* RECEIVED */}

          <button
            type="button"
            className={`tab-button ${
              activeTab === "received" ? "active" : ""
            }`}
            onClick={() => setActiveTab("received")}
          >
            Interests Received ({receivedList.length})
          </button>

          {/* SENT */}

          <button
            type="button"
            className={`tab-button ${
              activeTab === "sent" ? "active" : ""
            }`}
            onClick={() => setActiveTab("sent")}
          >
            Interests Sent ({sentList.length})
          </button>

          {/* REJECTED */}

          <button
            type="button"
            className={`tab-button ${
              activeTab === "rejected" ? "active" : ""
            }`}
            onClick={() => setActiveTab("rejected")}
          >
            Rejected ({rejectedList.length})
          </button>

        </div>

        {/* =================================================
            CONTENT
        ================================================= */}

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading interests...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error">
            <div className="error-box">
              <p>{error}</p>

              <button
                type="button"
                onClick={fetchInterests}
              >
                Retry
              </button>
            </div>
          </div>
        ) : listToDisplay.length === 0 ? (
          <div className="empty-interests">

            <h3>{getEmptyTitle()}</h3>

            <p>{getEmptyDescription()}</p>

          </div>
        ) : (
          <div className="interest-list">

            {listToDisplay.map((item) => (
              <div
                key={`${item.id}-${activeTab}`}
                className="interest-card"
              >

                {/* =================================================
                    LEFT SIDE
                ================================================= */}

                <div className="interest-card-left">

                  {/* AVATAR */}

                  <div className="interest-avatar">

                    {item.profile_photo_url ? (
                      <img
                        src={item.profile_photo_url}
                        alt={item.profile_name || "Member"}
                      />
                    ) : (
                      item.profile_name
                        ?.charAt(0)
                        ?.toUpperCase() || "U"
                    )}

                  </div>

                  {/* PROFILE INFO */}

                  <div className="interest-info">

                    <h3>
                      {item.profile_name || "Member Profile"}
                    </h3>

                    <div className="interest-meta">

                      <span>
                        ID:{" "}
                        <strong>
                          {item.matrimony_id || "-"}
                        </strong>
                      </span>

                      {item.age && (
                        <span>
                          Age: {item.age} Yrs
                        </span>
                      )}

                      {item.city && (
                        <span>
                          Location: {item.city}
                        </span>
                      )}

                      <span>
                        Date:{" "}
                        {item.created_at
                          ? new Date(
                              item.created_at
                            ).toLocaleDateString()
                          : "-"}
                      </span>

                    </div>

                  </div>

                </div>

                {/* =================================================
                    RIGHT SIDE
                ================================================= */}

                <div className="interest-card-right">

                  {/* =================================================
                      RECEIVED + PENDING
                  ================================================= */}

                  {activeTab === "received" &&
                  item.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        className="btn-accept"
                        onClick={() =>
                          handleInterestUpdate(
                            item.id,
                            "accept"
                          )
                        }
                      >
                        Accept
                      </button>

                      <button
                        type="button"
                        className="btn-decline"
                        onClick={() =>
                          handleInterestUpdate(
                            item.id,
                            "decline"
                          )
                        }
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <span
                      className={`status-tag ${
                        item.status?.toLowerCase() || ""
                      }`}
                    >
                      {activeTab === "rejected"
                        ? "Rejected"
                        : item.status}
                    </span>
                  )}

                  {/* =================================================
                      VIEW PROFILE
                  ================================================= */}

                  {item.profile_id && (
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() =>
                        navigate(
                          `/search-matches/${item.profile_id}`
                        )
                      }
                    >
                      View Profile
                    </button>
                  )}

                </div>

              </div>
            ))}

          </div>
        )}

      </div>
    </ClientLayout>
  );
}