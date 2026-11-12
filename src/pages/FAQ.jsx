import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, readApiResponse } from "../api.js";
import "./FAQ.css";

const categories = [
  { id: "general", name: "General Questions" },
  { id: "account", name: "Registration & Account" },
  { id: "profile", name: "Profile Management" },
  { id: "search", name: "Profile Search & Enquiries" },
  { id: "membership", name: "Membership & Payment" },
  { id: "security", name: "Security & Privacy" },
  { id: "support", name: "Support" },
];

export default function FAQ() {
  const [faqs, setFaqs] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestFAQs = useCallback(async () => {
    const response = await fetch(`${API_URL}/adminpanel/faqs/`);
    const data = await readApiResponse(response);
    if (!response.ok) {
      throw new Error(data.detail || "Unable to load frequently asked questions.");
    }
    if (!Array.isArray(data)) {
      throw new Error("The FAQ service returned an unexpected response.");
    }
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    requestFAQs()
      .then((data) => {
        if (active) setFaqs(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Unable to load frequently asked questions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestFAQs]);

  const retryLoading = async () => {
    setLoading(true);
    setError("");
    try {
      setFaqs(await requestFAQs());
    } catch (loadError) {
      setError(loadError.message || "Unable to load frequently asked questions.");
    } finally {
      setLoading(false);
    }
  };

  const filteredFAQs = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return faqs.filter((faq) => {
      const matchesCategory = selectedCategory === "all" || faq.category === selectedCategory;
      const matchesSearch = !query
        || `${faq.question} ${faq.answer}`.toLocaleLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [faqs, searchQuery, selectedCategory]);

  const groupedFAQs = categories
    .map((category) => ({
      ...category,
      faqs: filteredFAQs.filter((faq) => faq.category === category.id),
    }))
    .filter((category) => category.faqs.length > 0);

  return (
    <div className="faq-page">
      <header className="faq-hero">
        <div className="faq-hero-content">
          <span className="faq-eyebrow">Here to help</span>
          <h1>Frequently Asked Questions</h1>
          <p>Find clear answers about creating your profile, finding a match, and using KeralaKara Matrimony.</p>
          <label className="faq-search">
            <span className="faq-search-icon" aria-hidden="true">⌕</span>
            <span className="faq-visually-hidden">Search frequently asked questions</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search a question or keyword..."
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">
                Clear
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="faq-main">
        <div className="faq-layout">
          <aside className="faq-sidebar" aria-label="FAQ categories">
            <p className="faq-sidebar-title">Browse by Topic</p>
            <button
              type="button"
              className={`faq-category-button${selectedCategory === "all" ? " is-selected" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              <span>All Questions</span>
              <span>{faqs.length}</span>
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`faq-category-button${selectedCategory === category.id ? " is-selected" : ""}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <span>{category.name}</span>
                <span>{faqs.filter((faq) => faq.category === category.id).length}</span>
              </button>
            ))}
          </aside>

          <section className="faq-results" aria-live="polite">
            <div className="faq-results-heading">
              <div>
                <span className="faq-section-kicker">HELP CENTRE</span>
                <h2>{selectedCategory === "all"
                  ? "How can we help?"
                  : categories.find((category) => category.id === selectedCategory)?.name}
                </h2>
              </div>
              {!loading && !error && (
                <span className="faq-result-count">
                  {filteredFAQs.length} {filteredFAQs.length === 1 ? "answer" : "answers"}
                </span>
              )}
            </div>

            {loading ? (
              <p className="faq-state" role="status">Loading frequently asked questions...</p>
            ) : error ? (
              <div className="faq-state faq-error" role="alert">
                <p>{error}</p>
                <button type="button" onClick={retryLoading}>Try again</button>
              </div>
            ) : filteredFAQs.length === 0 ? (
              <div className="faq-state">
                <h3>No matching questions</h3>
                <p>Try a different search term or choose another topic.</p>
                <button type="button" onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                }}>
                  Show all questions
                </button>
              </div>
            ) : (
              <div className="faq-groups">
                {groupedFAQs.map((group) => (
                  <section className="faq-group" key={group.id} aria-label={group.name}>
                    {selectedCategory === "all" && <h3>{group.name}</h3>}
                    <div className="faq-accordion-list">
                      {group.faqs.map((faq) => (
                        <details className="faq-item" key={faq.id}>
                          <summary>
                            <span>{faq.question}</span>
                            <span className="faq-toggle" aria-hidden="true" />
                          </summary>
                          <div className="faq-answer">
                            <p>{faq.answer}</p>
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="faq-contact">
          <div className="faq-contact-icon" aria-hidden="true">?</div>
          <div>
            <h2>Still have a question?</h2>
            <p>Our support team is ready to help you with your account or profile.</p>
          </div>
          <Link to="/contact" className="faq-contact-link">Contact Support <span aria-hidden="true">→</span></Link>
        </section>
      </main>
    </div>
  );
}
