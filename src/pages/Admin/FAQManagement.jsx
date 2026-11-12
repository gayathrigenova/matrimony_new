import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../../api.js";
import "./FAQManagement.css";

const faqCategories = [
  ["general", "General Questions"],
  ["account", "Registration & Account"],
  ["profile", "Profile Management"],
  ["search", "Profile Search & Enquiries"],
  ["membership", "Membership & Payment"],
  ["security", "Security & Privacy"],
  ["support", "Support"],
];

const emptyForm = {
  category: "general",
  question: "",
  answer: "",
  is_active: true,
};

function getErrorMessage(data, fallback) {
  if (data?.detail) return data.detail;
  if (data && typeof data === "object") {
    const messages = Object.values(data).flat().filter((value) => typeof value === "string");
    if (messages.length) return messages.join(" ");
  }
  return fallback;
}

export default function FAQManagement() {
  const [faqs, setFaqs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const requestFAQs = useCallback(async () => {
    const response = await fetchWithTokenRefresh(`${API_URL}/adminpanel/faqs/manage/`, {
      authRedirect: "/admin/login",
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(getErrorMessage(data, "Unable to load FAQs."));
    if (!Array.isArray(data)) throw new Error("The FAQ service returned an unexpected response.");
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    requestFAQs()
      .then((data) => {
        if (active) setFaqs(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Unable to load FAQs.");
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
      setError(loadError.message || "Unable to load FAQs.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submitFAQ = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const isEditing = editingId !== null;
      const response = await fetchWithTokenRefresh(
        `${API_URL}/adminpanel/faqs/manage/${isEditing ? `${editingId}/` : ""}`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            sort_order: isEditing ? faqs.find((faq) => faq.id === editingId)?.sort_order || 0 : faqs.length + 1,
          }),
          authRedirect: "/admin/login",
        },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "Unable to save this FAQ."));
      setFaqs((current) => [...current.filter((faq) => faq.id !== data.id), data]
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id));
      setNotice(isEditing ? "FAQ updated." : "FAQ added.");
      resetForm();
    } catch (saveError) {
      setError(saveError.message || "Unable to save this FAQ.");
    } finally {
      setSaving(false);
    }
  };

  const editFAQ = (faq) => {
    setEditingId(faq.id);
    setForm({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      is_active: faq.is_active,
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateFAQ = async (faq, changes, successMessage) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/adminpanel/faqs/manage/${faq.id}/`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
          authRedirect: "/admin/login",
        },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "Unable to update this FAQ."));
      setFaqs((current) => current.map((item) => item.id === data.id ? data : item)
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id));
      setNotice(successMessage);
    } catch (updateError) {
      setError(updateError.message || "Unable to update this FAQ.");
    } finally {
      setSaving(false);
    }
  };

  const removeFAQ = async (faq) => {
    if (!window.confirm(`Delete "${faq.question}"? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTokenRefresh(
        `${API_URL}/adminpanel/faqs/manage/${faq.id}/`,
        { method: "DELETE", authRedirect: "/admin/login" },
      );
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "Unable to delete this FAQ."));
      setFaqs((current) => current.filter((item) => item.id !== faq.id));
      if (editingId === faq.id) resetForm();
      setNotice("FAQ deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this FAQ.");
    } finally {
      setSaving(false);
    }
  };

  const moveFAQ = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= faqs.length) return;
    const reordered = [...faqs];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTokenRefresh(`${API_URL}/adminpanel/faqs/manage/reorder/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faq_ids: reordered.map((faq) => faq.id) }),
        authRedirect: "/admin/login",
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "Unable to reorder FAQs."));
      setFaqs(data);
      setNotice("FAQ order updated.");
    } catch (reorderError) {
      setError(reorderError.message || "Unable to reorder FAQs.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="faq-admin-page">
      <header className="faq-admin-header">
        <div>
          <p>Content management</p>
          <h1>Frequently Asked Questions</h1>
        </div>
        <Link to="/admin/dashboard">Back to dashboard</Link>
      </header>

      <main className="faq-admin-content">
        {error && <div className="faq-admin-message is-error" role="alert">{error}</div>}
        {notice && <div className="faq-admin-message is-success" role="status">{notice}</div>}

        <section className="faq-admin-card">
          <div className="faq-admin-card-heading">
            <div>
              <h2>{editingId ? "Edit FAQ" : "Add a question"}</h2>
              <p>Write a clear question and a helpful answer for members.</p>
            </div>
            {editingId && (
              <button type="button" className="faq-admin-secondary" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
          <form className="faq-admin-form" onSubmit={submitFAQ}>
            <label>
              Category
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                required
              >
                {faqCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Question
              <input
                type="text"
                maxLength={255}
                value={form.question}
                onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
                required
              />
            </label>
            <label>
              Answer
              <textarea
                rows={5}
                value={form.answer}
                onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))}
                required
              />
            </label>
            <label className="faq-admin-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Show this FAQ on the public page
            </label>
            <button type="submit" className="faq-admin-primary" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Add FAQ"}
            </button>
          </form>
        </section>

        <section className="faq-admin-card">
          <div className="faq-admin-card-heading">
            <div>
              <h2>Manage questions</h2>
              <p>Reorder entries with the arrows. Inactive FAQs remain available here but are hidden publicly.</p>
            </div>
            <span className="faq-admin-count">{faqs.length} total</span>
          </div>
          {loading ? (
            <p className="faq-admin-empty" role="status">Loading FAQs...</p>
          ) : faqs.length === 0 ? (
            <p className="faq-admin-empty">No FAQs have been added yet.</p>
          ) : (
            <div className="faq-admin-list">
              {faqs.map((faq, index) => (
                <article className="faq-admin-item" key={faq.id}>
                  <div className="faq-admin-order" aria-label={`Position ${index + 1}`}>
                    <button type="button" disabled={saving || index === 0} onClick={() => moveFAQ(index, -1)} aria-label={`Move "${faq.question}" up`}>↑</button>
                    <span>{index + 1}</span>
                    <button type="button" disabled={saving || index === faqs.length - 1} onClick={() => moveFAQ(index, 1)} aria-label={`Move "${faq.question}" down`}>↓</button>
                  </div>
                  <div className="faq-admin-item-copy">
                    <div className="faq-admin-item-meta">
                      <span>{faqCategories.find(([value]) => value === faq.category)?.[1] || faq.category}</span>
                      <span className={faq.is_active ? "faq-admin-active" : "faq-admin-inactive"}>
                        {faq.is_active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <h3>{faq.question}</h3>
                    <p>{faq.answer}</p>
                  </div>
                  <div className="faq-admin-actions">
                    <button type="button" disabled={saving} onClick={() => updateFAQ(
                      faq,
                      { is_active: !faq.is_active },
                      faq.is_active ? "FAQ hidden from the public page." : "FAQ published.",
                    )}>
                      {faq.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button type="button" disabled={saving} onClick={() => editFAQ(faq)}>Edit</button>
                    <button type="button" className="is-danger" disabled={saving} onClick={() => removeFAQ(faq)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {error && !faqs.length && !loading && (
            <button type="button" className="faq-admin-secondary" onClick={retryLoading}>
              Try again
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
