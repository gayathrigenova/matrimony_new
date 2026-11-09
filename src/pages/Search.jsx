import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BIRTH_STAR_OPTIONS, CASTE_OPTIONS } from '../constants.js';
import { API_URL, fetchWithTokenRefresh, readApiResponse } from '../api.js';
import './Search.css';

export default function Search() {
  const [filters, setFilters] = useState({
    lookingFor: 'Bride',
    religion: '',
    caste: '',
    heightFrom: '124',
    heightTo: '203',
    ageFrom: '18',
    ageTo: '60',
    birthStar: '',
  });
  const [profiles, setProfiles] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const navigate = useNavigate();

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((currentFilters) => ({ ...currentFilters, [name]: value }));
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    setHasSearched(true);
    setSearchError('');
    setProfiles([]);
    setLoading(true);

    const query = new URLSearchParams({
      gender: filters.lookingFor === 'Bride' ? 'Female' : 'Male',
      age_from: filters.ageFrom,
      age_to: filters.ageTo,
      height_from_cm: filters.heightFrom,
      height_to_cm: filters.heightTo,
    });
    if (filters.religion) query.set('religion', filters.religion);
    if (filters.caste) query.set('caste', filters.caste);
    if (filters.birthStar) query.set('birth_star', filters.birthStar);

    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/registrations/published/?${query.toString()}`,
      );
      const data = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to search profiles.');
      }

      const results = Array.isArray(data) ? data : data.results;
      if (!Array.isArray(results)) {
        throw new Error('The profiles response was invalid.');
      }
      setProfiles(results);
    } catch (error) {
      setSearchError(error.message || 'Unable to search profiles.');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Banner */}
      <div className="search-banner">
        <button className="search-back-btn" onClick={() => navigate(-1)}>&#8592; Back</button>
        <div className="search-banner-content">
          <h1>Search Your Partner Here</h1>
          <p>Find your perfect partner from 5 Lakh+ profiles</p>
        </div>
      </div>

      {/* Filter Section */}
      <div className="search-filter-section">
        <div className="search-filter-card">
          <form onSubmit={handleSearch}>
          <div className="filter-row">
            <div className="filter-group">
              <label>I'm looking for a</label>
              <select name="lookingFor" value={filters.lookingFor} onChange={handleFilterChange}>
                <option value="Bride">Bride</option>
                <option value="Groom">Groom</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Religion</label>
              <select name="religion" value={filters.religion} onChange={handleFilterChange}>
                <option value="">Select Religion</option>
                <option>Hindu</option>
               
              </select>
            </div>
            <div className="filter-group">
              <label>Caste</label>
              <select name="caste" value={filters.caste} onChange={handleFilterChange}>
                <option value="">Select Caste</option>
                {CASTE_OPTIONS.map((caste) => (
                  <option key={caste} value={caste}>
                    {caste}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Height in cm</label>
              <div className="range-row">
                <select name="heightFrom" value={filters.heightFrom} onChange={handleFilterChange}>
                  {[
                    ["124", "4'1 (124cm)"],
                    ["135", "4'5 (135cm)"],
                    ["152", "5'0 (152cm)"],
                    ["165", "5'5 (165cm)"],
                    ["178", "5'10 (178cm)"],
                  ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <span>To</span>
                <select name="heightTo" value={filters.heightTo} onChange={handleFilterChange}>
                  {[
                    ["165", "5'5 (165cm)"],
                    ["178", "5'10 (178cm)"],
                    ["183", "6'0 (183cm)"],
                    ["193", "6'4 (193cm)"],
                    ["203", "6'8 (203cm)"],
                  ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="filter-group">
              <label>Age Between (Years)</label>
              <div className="range-row">
                <select name="ageFrom" value={filters.ageFrom} onChange={handleFilterChange}>
                  {Array.from({length:43},(_,i)=>i+18).map(a=><option key={a} value={a}>{a}</option>)}
                </select>
                <span>To</span>
                <select name="ageTo" value={filters.ageTo} onChange={handleFilterChange}>
                  {Array.from({length:43},(_,i)=>i+18).map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="filter-group">
              <label htmlFor="search-birth-star">Birth Star</label>
              <select
                id="search-birth-star"
                name="birthStar"
                value={filters.birthStar}
                onChange={handleFilterChange}
              >
                <option value="">select</option>
                {BIRTH_STAR_OPTIONS.map((star) => (
                  <option key={star} value={star}>{star}</option>
                ))}
              </select>
            </div>
          </div>
{/* 
          <div className="filter-more-link">
            <a href="#">More Filters</a>
          </div> */}

          <button type="submit" className="search-submit-btn" disabled={loading}>
            Search
          </button>
          </form>
        </div>
      </div>

      {/* Why Choose Us */}
      {/* <div className="search-why-section">
        <h2>Why Search With Us?</h2>
        <p className="section-sub">Trusted by millions of families across India</p>
        <div className="why-cards">
          {[
            { img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80", title: "Verified Profiles", desc: "Every profile is manually verified for authenticity and trust." },
            { img: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=400&q=80", title: "Smart Matching", desc: "AI-powered matching based on your preferences and horoscope." },
            { img: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&q=80", title: "Privacy First", desc: "Your contact details are shared only with your consent." },
          ].map(c => (
            <div className="why-card" key={c.title}>
              <img src={c.img} alt={c.title} />
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </div> */}

      {/* Success Stories Banner */}
      {/* <div className="search-success-banner">
        <div className="success-overlay">
          <h2>💑 Over 10,000 Successful Marriages</h2>
          <p>Join the growing family of happy couples who found their match here.</p>
          <a href="/register" className="success-cta">Create Free Profile</a>
        </div>
      </div> */}

      {hasSearched && (
        <div className="search-featured-section">
          <h2>Search Results</h2>
          <p className="section-sub">
            {loading ? 'Searching approved profiles…' : `${profiles.length} matching profile${profiles.length === 1 ? '' : 's'}`}
          </p>
          {searchError ? <p role="alert">{searchError}</p> : null}
          {!loading && !searchError && profiles.length === 0 ? (
            <p role="status">No profiles match the selected filters.</p>
          ) : null}
          <div className="featured-profiles">
            {profiles.map((profile) => (
              <article className="profile-card" key={profile.id}>
                <SearchResultPhoto profile={profile} />
                <div className="profile-info">
                  <h4>{profile.full_name}</h4>
                  <span className="search-result-id">
                    Matrimony ID: {profile.matrimony_id || 'Not assigned'}
                  </span>
                  {profile.age ? <span>{profile.age} years</span> : null}
                  {profile.occupation ? <span>{profile.occupation}</span> : null}
                  {[profile.city, profile.district, profile.state].filter(Boolean).length ? (
                    <span>📍 {[profile.city, profile.district, profile.state].filter(Boolean).join(', ')}</span>
                  ) : null}
                  {profile.caste ? <span>{profile.caste}</span> : null}
                  {profile.birth_star ? <span>{profile.birth_star}</span> : null}
                  <button type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                    View Profile
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SearchResultPhoto({ profile }) {
  const [failed, setFailed] = useState(false);
  if (!profile.profile_photo_url || failed) {
    return (
      <div className="search-result-photo-placeholder" aria-label="No profile photo">
        {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      src={profile.profile_photo_url}
      alt={profile.full_name || 'Profile'}
      onError={() => setFailed(true)}
    />
  );
}
