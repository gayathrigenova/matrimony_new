import { API_URL } from "../../api.js";
import { CASTE_OPTIONS } from "../../constants.js";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "../../components/ClientLayout";
import "./SearchMatches.css";


export default function SearchMatches() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState({ id: null, type: "", text: "" });

  const [filters, setFilters] = useState({
    gender: "",
    age_from: "",
    age_to: "",
    religion: "",
    caste: "",
    marital_status: "",
    district: "",
    education: "",
    occupation: "",
  });

  const token = localStorage.getItem("access_token");

  const fetchMatches = (queryFilters = filters) => {
    setLoading(true);
    const queryParams = new URLSearchParams();

    Object.entries(queryFilters).forEach(([key, val]) => {
      if (val) queryParams.append(key, val);
    });

    const endpoint = `${API_URL}/registrations/published/?${queryParams.toString()}`;

    fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to fetch matching profiles.");
        }
        return res.json();
      })
      .then((data) => {
        setProfiles(data.results || data || []);
      })
      .catch((err) => {
        console.error("Fetch matches error:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchMatches(filters);
  };

  const handleReset = () => {
    const emptyFilters = {
      gender: "",
      age_from: "",
      age_to: "",
      religion: "",
      caste: "",
      marital_status: "",
      district: "",
      education: "",
      occupation: "",
    };
    setFilters(emptyFilters);
    fetchMatches(emptyFilters);
  };

  const handleSendInterest = (profileId) => {
    fetch(`${API_URL}/registrations/${profileId}/interest/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Unable to send interest.");
        }
        setActionMessage({ id: profileId, type: "success", text: "Interest sent successfully." });
      })
      .catch((err) => {
        setActionMessage({ id: profileId, type: "error", text: err.message });
      });
  };

  const handleShortlist = (profileId) => {
    fetch(`${API_URL}/registrations/${profileId}/shortlist/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Unable to shortlist profile.");
        }
        setActionMessage({ id: profileId, type: "success", text: "Profile added to shortlist." });
      })
      .catch((err) => {
        setActionMessage({ id: profileId, type: "error", text: err.message });
      });
  };

  return (
    <ClientLayout>
      <div className="search-matches-container">
        <div className="search-matches-header">
          <h1>Search Matches</h1>
          <p>Explore verified published profiles matching your preferences.</p>
        </div>

        {/* SEARCH FILTERS */}
        <div className="filter-card">
          <div className="filter-card-header">
            <h3 className="filter-card-title">🔍 Search Filters</h3>
          </div>
          <form onSubmit={handleSearch}>
            <div className="filter-grid">
              <div className="filter-group">
                <label>Gender</label>
                <select name="gender" value={filters.gender} onChange={handleFilterChange}>
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Age From</label>
                <input
                  type="number"
                  min="18"
                  max="70"
                  name="age_from"
                  placeholder="Min Age"
                  value={filters.age_from}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-group">
                <label>Age To</label>
                <input
                  type="number"
                  min="18"
                  max="70"
                  name="age_to"
                  placeholder="Max Age"
                  value={filters.age_to}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-group">
                <label>Religion</label>
                <input
                  type="text"
                  name="religion"
                  placeholder="e.g. Hindu, Christian"
                  value={filters.religion}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-group">
                <label>Caste</label>
                <select
                  name="caste"
                  value={filters.caste}
                  onChange={handleFilterChange}
                >
                  <option value="">All Castes</option>
                  {CASTE_OPTIONS.map((caste) => (
                    <option key={caste} value={caste}>
                      {caste}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Marital Status</label>
                <select name="marital_status" value={filters.marital_status} onChange={handleFilterChange}>
                  <option value="">All Statuses</option>
                  <option value="Single / Never Married">Single / Never Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>

              <div className="filter-group">
                <label>District</label>
                <input
                  type="text"
                  name="district"
                  placeholder="e.g. Ernakulam"
                  value={filters.district}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-group">
                <label>Education</label>
                <input
                  type="text"
                  name="education"
                  placeholder="e.g. B.Tech, MBA"
                  value={filters.education}
                  onChange={handleFilterChange}
                />
              </div>

              <div className="filter-group">
                <label>Occupation</label>
                <input
                  type="text"
                  name="occupation"
                  placeholder="e.g. Engineer, Doctor"
                  value={filters.occupation}
                  onChange={handleFilterChange}
                />
              </div>
            </div>

            <div className="filter-actions">
              <button type="button" className="btn-reset-filters" onClick={handleReset}>
                Reset Filters
              </button>
              <button type="submit" className="btn-search-filters">
                Search Matches
              </button>
            </div>
          </form>
        </div>

      </div>
    </ClientLayout>
  );
}
