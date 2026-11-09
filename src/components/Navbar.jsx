
import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logo from '../assets/logo1.png';
import { API_URL, hasAuthenticatedSession, readApiResponse } from '../api.js';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchState, setSearchState] = useState({ status: "idle", profile: null, message: "" });
  const searchRequestRef = useRef(0);
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(hasAuthenticatedSession);
  const [isClientLoggedIn, setIsClientLoggedIn] = useState(hasClientSession);

  useEffect(() => {
    const refreshAuthStatus = () => {
      setIsLoggedIn(hasAuthenticatedSession());
      setIsClientLoggedIn(hasClientSession());
    };
    window.addEventListener('auth-change', refreshAuthStatus);
    window.addEventListener('storage', refreshAuthStatus);
    return () => {
      window.removeEventListener('auth-change', refreshAuthStatus);
      window.removeEventListener('storage', refreshAuthStatus);
    };
  }, []);

  const pages = [
    { name: 'Home', path: '/' },
    { name: 'Search', path: '/search' },
    ...(isClientLoggedIn ? [{ name: 'My Profile', path: '/profile' }] : []),
    { name: 'Membership', path: '/membership' },
    { name: 'Register', path: '/registration' },
    { name: 'Contact Us', path: '/contact' },
  ];

  const handleNavClick = () => {
    setIsOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('admin_user');
    window.dispatchEvent(new Event('auth-change'));
    handleNavClick();
    navigate('/');
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const requestId = ++searchRequestRef.current;
    const matrimonyId = searchQuery.replace(/\s+/g, "");
    if (!matrimonyId) {
      setSearchState({
        status: "error",
        profile: null,
        message: "Enter a Matrimony ID to search.",
      });
      return;
    }

    setSearchState({ status: "loading", profile: null, message: "" });
    try {
      const query = new URLSearchParams({ matrimony_id: matrimonyId });
      const response = await fetch(
        `${API_URL}/registrations/published/by-matrimony-id/?${query.toString()}`,
      );
      const data = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(data.detail || "Unable to search profiles.");
      }
      if (requestId !== searchRequestRef.current) return;
      setSearchState({ status: "success", profile: data, message: "" });
    } catch (error) {
      if (requestId !== searchRequestRef.current) return;
      setSearchState({
        status: "error",
        profile: null,
        message: error.message || "Unable to search profiles.",
      });
    }
  };

  const handleSearchInputChange = (event) => {
    searchRequestRef.current += 1;
    setSearchQuery(event.target.value);
    setSearchState({ status: "idle", profile: null, message: "" });
  };

  const openSearchedProfile = (profileId) => {
    searchRequestRef.current += 1;
    navigate(`/profiles/${profileId}`);
    setSearchOpen(false);
    setSearchState({ status: "idle", profile: null, message: "" });
  };

  return (
    <nav className="wn-navbar">
      {/* Left: Brand Logo & Name */}
      <div className="wn-nav-brand">
        <NavLink to="/" className="wn-brand-link">
          <div className="wn-logo-graphic">
  <img
    src={logo}
    alt="Wedding Nest Logo"
    className="wn-logo-img"
  />
</div>
         
        </NavLink>
      </div>

      {/* Mobile: Search Icon (left of hamburger) */}
      <button className="wn-mobile-search-icon" onClick={() => setSearchOpen(!searchOpen)}>
        ⌕
      </button>

      {/* Mobile Search Bar Dropdown */}
      {searchOpen && (
        <div className="wn-mobile-search-bar">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search Matrimony ID"
              value={searchQuery}
              onChange={handleSearchInputChange}
              autoFocus
            />
            <button type="submit">⌕</button>
            <ProfileIdSearchResult state={searchState} onOpen={openSearchedProfile} />
          </form>
        </div>
      )}

      {/* Hamburger Toggle Button for Mobile */}
      <button className="wn-menu-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Center: Navigation Links */}
      <ul className={`wn-nav-links ${isOpen ? 'open' : ''}`}>
        {pages.map((page) => (
          <li key={page.path}>
            <NavLink
              to={page.path}
              className={({ isActive }) => (isActive ? 'wn-nav-link wn-active-link' : 'wn-nav-link')}
              onClick={handleNavClick}
            >
              {page.name}
            </NavLink>
          </li>
        ))}
        <li className="wn-mobile-login-item">
          {isLoggedIn ? (
            <button type="button" className="wn-nav-link wn-mobile-login-link" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <NavLink to="/login" className="wn-nav-link wn-mobile-login-link" onClick={handleNavClick}>
              👤 Login
            </NavLink>
          )}
        </li>
      </ul>

      {/* Right: Search Input & Login Button */}
      <div className={`wn-nav-actions ${isOpen ? 'open' : ''}`}>
        <form onSubmit={handleSearchSubmit} className="wn-search-form wn-desktop-search">
          <span className="wn-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search Matrimony ID"
            value={searchQuery}
            onChange={handleSearchInputChange}
          />
          <ProfileIdSearchResult state={searchState} onOpen={openSearchedProfile} />
        </form>
        {isLoggedIn ? (
          <button type="button" className="wn-login-btn" onClick={handleLogout}>
            Logout
          </button>
        ) : (
          <NavLink to="/login" className="wn-login-btn" onClick={handleNavClick}>
            <span className="wn-login-icon">👤</span> Login
          </NavLink>
        )}
      </div>
    </nav>
  );
}

function ProfileIdSearchResult({ state, onOpen }) {
  if (state.status === "idle") return null;

  return (
    <div className="wn-profile-search-result" aria-live="polite">
      {state.status === "loading" ? (
        <p role="status">Searching profiles…</p>
      ) : state.status === "error" ? (
        <p role="alert">{state.message}</p>
      ) : (
        <button
          type="button"
          className="wn-profile-search-match"
          onClick={() => onOpen(state.profile.id)}
        >
          <strong>
            {state.profile.full_name}
            {state.profile.matrimony_id ? ` (${state.profile.matrimony_id})` : ""}
          </strong>
          <span>
            {[
              state.profile.age != null ? `${state.profile.age} Yrs` : "",
              state.profile.occupation || state.profile.occupation_level,
              state.profile.caste,
            ].filter(Boolean).join(", ")}
          </span>
          <span>
            {[state.profile.district, state.profile.state].filter(Boolean).join(", ")}
          </span>
          <span className="wn-profile-search-open">View Profile</span>
        </button>
      )}
    </div>
  );
}

function hasClientSession() {
  if (!hasAuthenticatedSession()) return false;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.role === 'CLIENT';
  } catch {
    return false;
  }
}
