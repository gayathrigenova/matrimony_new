import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Navbar.css';
import logo from '../assets/logo1.png';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  const pages = [
    { name: 'Home', path: '/' },
    { name: 'Search', path: '/search' },
    { name: 'Membership', path: '/membership' },
    { name: 'Register', path: '/registration' },
    { name: 'Profiles', path: '/profiles' },
    { name: 'Contact Us', path: '/contact' },
  ];

  const handleNavClick = () => {
    setIsOpen(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
    }
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
              placeholder="Search Profile ID / Keyword"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="submit">⌕</button>
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
          <NavLink to="/login" className="wn-nav-link wn-mobile-login-link" onClick={handleNavClick}>
            👤 Login
          </NavLink>
        </li>
      </ul>

      {/* Right: Search Input & Login Button */}
      <div className={`wn-nav-actions ${isOpen ? 'open' : ''}`}>
        <form onSubmit={handleSearchSubmit} className="wn-search-form wn-desktop-search">
          <span className="wn-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search Profile ID / Keyword"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
        <NavLink to="/login" className="wn-login-btn" onClick={handleNavClick}>
          <span className="wn-login-icon">👤</span> Login
        </NavLink>
      </div>
    </nav>
  );
}