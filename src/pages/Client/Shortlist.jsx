import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./Shortlist.css";

const API_URL = "http://127.0.0.1:8000/api";

export default function Shortlist() {
  const navigate = useNavigate();
  const [shortlisted, setShortlisted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("access_token");

  const fetchShortlist = () => {
    setLoading(true);
    setError("");

    fetch(`${API_URL}/registrations/shortlist/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load shortlist.");
        }
        return res.json();
      })
      .then((data) => {
        setShortlisted(data.results || data || []);
      })
      .catch((err) => {
        setError(err.message || "Failed to load shortlist.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    fetchShortlist();
  }, [token, navigate]);

  const handleRemove = (profileId) => {
    fetch(`${API_URL}/registrations/${profileId}/shortlist/remove/`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to remove profile from shortlist.");
        }
        setShortlisted((prev) => prev.filter((item) => item.profile_id !== profileId));
      })
      .catch((err) => {
        alert(err.message);
      });
  };

  return (
    <ClientLayout>
      <div className="shortlist-container">
        <div className="shortlist-header">
          <h1>My Shortlist</h1>
          <p>Profiles you have saved for quick access and decision making.</p>
        </div>

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-spinner"></div>
            <p>Loading shortlisted profiles...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error">
            <div className="error-box">
              <p>{error}</p>
              <button onClick={fetchShortlist}>Retry</button>
            </div>
          </div>
        ) : shortlisted.length === 0 ? (
          <div className="empty-shortlist">
            <h3>No Shortlisted Profiles</h3>
            <p>You can shortlist profiles while searching matches to review them later.</p>
            <button
              className="btn-shortlist-view"
              style={{ width: "auto", marginTop: "14px", padding: "10px 20px" }}
              onClick={() => navigate("/search-matches")}
            >
              Search Matches
            </button>
          </div>
        ) : (
          <div className="shortlist-grid">
            {shortlisted.map((item) => (
              <div key={item.id} className="shortlist-card">
                <div className="shortlist-card-body">
                  <div className="shortlist-avatar">
                    {item.profile_photo_url ? (
                      <img src={item.profile_photo_url} alt={item.profile_name} />
                    ) : (
                      item.profile_name?.charAt(0)?.toUpperCase() || "U"
                    )}
                  </div>
                  <div className="shortlist-details">
                    <h3 className="shortlist-name">{item.profile_name}</h3>
                    <div className="shortlist-id">ID: {item.matrimony_id || "-"}</div>
                    {item.age && <div className="shortlist-info-line">Age: {item.age} Yrs</div>}
                    <div className="shortlist-info-line">
                      Location: {item.city || item.district || "Not Specified"}
                    </div>
                    <div className="shortlist-info-line">
                      Occupation: {item.occupation || "Not Specified"}
                    </div>
                  </div>
                </div>

                <div className="shortlist-card-footer">
                  <button
                    className="btn-shortlist-view"
                    onClick={() => navigate(`/search-matches/${item.profile_id}`)}
                  >
                    View Profile
                  </button>
                  <button
                    className="btn-shortlist-remove"
                    onClick={() => handleRemove(item.profile_id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
