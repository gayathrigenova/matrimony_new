import React from 'react';
import { useNavigate } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="nf-page">
      <div className="nf-content">
        <div className="nf-code">404</div>
        <h1>Page Not Found</h1>
        <p>Oops! The page you're looking for doesn't exist or has been moved.</p>
        <div className="nf-actions">
          <button onClick={() => navigate('/')}>Go to Home</button>
          <button className="nf-outline" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    </div>
  );
}
