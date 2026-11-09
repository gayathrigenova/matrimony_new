import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../api.js";
import "./PremiumProfileInfo.css";

const contactLabels = {
  email: "Email",
  phone: "Phone",
  alternate_phone: "Alternate phone",
  contact_name: "Contact person",
  relationship: "Relationship",
  contact_phone: "Contact person's phone",
  country_code: "Country code",
  extra_phone: "Additional phone",
};

export default function PremiumProfileInfo({ profileId }) {
  const token = localStorage.getItem("access_token");
  const [contactsRemaining, setContactsRemaining] = useState(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !profileId) return;

    let active = true;
    fetchWithTokenRefresh(`${API_URL}/memberships/contact-credits/`)
      .then(async (response) => {
        const data = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(data.detail || "Unable to load contact credits.");
        }
        if (active) setContactsRemaining(data.contacts_remaining);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load contact credits.");
      });

    return () => {
      active = false;
    };
  }, [profileId, token]);

  const handleViewContact = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/memberships/contacts/${profileId}/unlock/`,
        { method: "POST" },
      );
      const data = await readApiResponse(response);
      if (!response.ok) {
        if (response.status === 402) setContactsRemaining(0);
        throw new Error(data.detail || "Unable to view contact details.");
      }

      setContact(data.contact);
      setContactsRemaining(data.contacts_remaining);
    } catch (requestError) {
      setError(requestError.message || "Unable to view contact details.");
    } finally {
      setLoading(false);
    }
  };

  const contactValues = contact
    ? Object.entries(contact).filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    : [];

  return (
    <section className="premium-profile-info" aria-label="Premium profile information">
      <div className="premium-profile-info-card">
        <span className="premium-profile-info-label">Contact details</span>
        {contact ? (
          <div className="premium-profile-contact-values">
            {contactValues.map(([key, value]) => (
              <p key={key}>
                <strong>{contactLabels[key] || key}</strong>
                <span>{value}</span>
              </p>
            ))}
            {!contactValues.length ? <span>No contact details available.</span> : null}
          </div>
        ) : (
          <>
            <span className="premium-profile-info-preview" aria-hidden="true">
              Phone and email
            </span>
            {token ? (
              contactsRemaining === 0 ? (
                <Link className="premium-profile-info-cta" to="/membership">
                  No contacts remaining. View membership plans
                </Link>
              ) : (
                <button
                  type="button"
                  className="premium-profile-info-cta premium-profile-info-action"
                  onClick={handleViewContact}
                  disabled={loading}
                >
                  {loading
                    ? "Loading contact…"
                    : `View contact${contactsRemaining === null ? "" : ` · ${contactsRemaining} remaining`}`}
                </button>
              )
            ) : (
              <Link className="premium-profile-info-cta" to="/membership">
                🔒 Upgrade membership to view contact details
              </Link>
            )}
          </>
        )}
        {error ? <span className="premium-profile-info-error" role="alert">{error}</span> : null}
      </div>

      <Link
        className="premium-profile-info-card"
        to="/membership"
        aria-label="Upgrade membership to view this horoscope"
      >
        <span className="premium-profile-info-label">Horoscope</span>
        <span className="premium-profile-info-preview" aria-hidden="true">
          Horoscope details
        </span>
        <span className="premium-profile-info-cta">
          🔒 Upgrade membership to view this horoscope
        </span>
      </Link>
    </section>
  );
}
