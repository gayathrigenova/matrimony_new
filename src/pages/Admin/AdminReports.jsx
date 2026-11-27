
import { useCallback, useEffect, useState } from "react";
import { API_URL, fetchWithTokenRefresh, readApiResponse } from "../../api";
import "./AdminReports.css";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-IN");
};

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const Verification = ({ verified }) => (
  <span className={`report-badge ${verified ? "verified" : "not-verified"}`}>
    {verified ? "Verified" : "Not Verified"}
  </span>
);

export default function AdminReports() {
  const [summary, setSummary] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [regFrom, setRegFrom] = useState("");
  const [regTo, setRegTo] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("registrations");

  const buildParams = () => {
    const params = new URLSearchParams();
    if (regFrom) params.set("reg_from", regFrom);
    if (regTo) params.set("reg_to", regTo);
    if (payFrom) params.set("pay_from", payFrom);
    if (payTo) params.set("pay_to", payTo);
    return params.toString();
  };

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const query = buildParams();
      const suffix = query ? `?${query}` : "";

      const endpoints = [
        `${API_URL}/adminpanel/reports/summary/${suffix}`,
        `${API_URL}/adminpanel/reports/registrations/${suffix}`,
        `${API_URL}/adminpanel/reports/payments/${suffix}`,
      ];

      const responses = await Promise.all(
        endpoints.map((url) =>
          fetchWithTokenRefresh(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            authRedirect: "/admin/login",
          })
        )
      );

      const results = await Promise.all(
        responses.map(async (response) => {
          const data = await readApiResponse(response);
          if (!response.ok) {
            throw new Error(data?.detail || data?.message || "Unable to load reports.");
          }
          return data;
        })
      );

      setSummary(results[0]);
      setRegistrations(Array.isArray(results[1]) ? results[1] : []);
      setPayments(Array.isArray(results[2]) ? results[2] : []);
    } catch (err) {
      setError(err.message || "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [regFrom, regTo, payFrom, payTo]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const exportExcel = async () => {
    setExporting(true);
    setError("");

    try {
      const query = buildParams();
      const url = `${API_URL}/adminpanel/reports/export/${query ? `?${query}` : ""}`;

      const response = await fetchWithTokenRefresh(url, {
        method: "GET",
        authRedirect: "/admin/login",
      });

      if (!response.ok) {
        const data = await readApiResponse(response);
        throw new Error(data?.detail || "Excel export failed.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = "matrimony_report.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message || "Unable to export Excel report.");
    } finally {
      setExporting(false);
    }
  };

  const reg = summary?.registrations || {};
  const pay = summary?.payments || {};

  return (
    <div className="admin-reports">
      <header className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>Registration and payment reports</p>
        </div>

        <button
          className="reports-export-btn"
          type="button"
          onClick={exportExcel}
          disabled={exporting || loading}
        >
          {exporting ? "Exporting..." : "↓ Export Excel"}
        </button>
      </header>

      {error && (
        <div className="reports-error">
          {error}
          <button type="button" onClick={fetchReports}>Retry</button>
        </div>
      )}

      <section className="reports-summary">
        <div className="report-stat">
          <span>Total Registrations</span>
          <strong>{reg.total ?? 0}</strong>
        </div>
        <div className="report-stat">
          <span>Mobile Verified</span>
          <strong>{reg.mobile_verified ?? 0}</strong>
        </div>
        <div className="report-stat">
          <span>Email Verified</span>
          <strong>{reg.email_verified ?? 0}</strong>
        </div>
        <div className="report-stat">
          <span>Fully Verified</span>
          <strong>{reg.fully_verified ?? 0}</strong>
        </div>
        <div className="report-stat">
          <span>Successful Payments</span>
          <strong>{pay.total_successful ?? 0}</strong>
        </div>
        <div className="report-stat revenue">
          <span>Total Revenue</span>
          <strong>{formatMoney(pay.total_revenue_rupees)}</strong>
        </div>
      </section>

      <section className="report-plans">
        <h2>Plan-wise Payments</h2>
        <div className="report-plan-grid">
          {Object.entries(pay.by_plan || {}).map(([key, plan]) => (
            <div className="report-plan-card" key={key}>
              <h3>{key.charAt(0).toUpperCase() + key.slice(1)} Plan</h3>
              <p>Payments: <strong>{plan.count}</strong></p>
              <p>Revenue: <strong>{formatMoney(plan.revenue_rupees)}</strong></p>
            </div>
          ))}
          {!Object.keys(pay.by_plan || {}).length && (
            <p>No plan payment data available.</p>
          )}
        </div>
      </section>

      <section className="report-panel">
        <div className="report-tabs">
          <button
            className={activeTab === "registrations" ? "active" : ""}
            onClick={() => setActiveTab("registrations")}
            type="button"
          >
            Registrations ({registrations.length})
          </button>
          <button
            className={activeTab === "payments" ? "active" : ""}
            onClick={() => setActiveTab("payments")}
            type="button"
          >
            Payments ({payments.length})
          </button>
        </div>

        {activeTab === "registrations" && (
          <>
            <div className="report-filters">
              <label>
                Registration From
                <input type="date" value={regFrom} onChange={(e) => setRegFrom(e.target.value)} />
              </label>
              <label>
                Registration To
                <input type="date" value={regTo} onChange={(e) => setRegTo(e.target.value)} />
              </label>
              <button type="button" onClick={fetchReports}>Apply Filters</button>
              <button type="button" className="clear-filter" onClick={() => { setRegFrom(""); setRegTo(""); }}>
                Clear
              </button>
            </div>

            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Profile ID</th>
                    <th>Matrimony ID</th>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Gender</th>
                    <th>Registration Date</th>
                    <th>Status</th>
                    <th>Mobile Verification</th>
                    <th>Email Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && registrations.map((item) => (
                    <tr key={item.profile_id}>
                      <td>{item.profile_id}</td>
                      <td>{item.matrimony_id || "-"}</td>
                      <td>{item.full_name || "-"}</td>
                      <td>{item.phone || "-"}</td>
                      <td>{item.email || "-"}</td>
                      <td>{item.gender || "-"}</td>
                      <td>{formatDate(item.registration_date)}</td>
                      <td>{item.status || "-"}</td>
                      <td><Verification verified={item.phone_verified} /></td>
                      <td><Verification verified={item.email_verified} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && <p className="reports-empty">Loading registrations...</p>}
              {!loading && registrations.length === 0 && (
                <p className="reports-empty">No registration records found.</p>
              )}
            </div>
          </>
        )}

        {activeTab === "payments" && (
          <>
            <div className="report-filters">
              <label>
                Payment From
                <input type="date" value={payFrom} onChange={(e) => setPayFrom(e.target.value)} />
              </label>
              <label>
                Payment To
                <input type="date" value={payTo} onChange={(e) => setPayTo(e.target.value)} />
              </label>
              <button type="button" onClick={fetchReports}>Apply Filters</button>
              <button type="button" className="clear-filter" onClick={() => { setPayFrom(""); setPayTo(""); }}>
                Clear
              </button>
            </div>

            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Profile ID</th>
                    <th>Matrimony ID</th>
                    <th>Customer Name</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment Date</th>
                    <th>Payment ID</th>
                    <th>Order ID</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && payments.map((item, index) => (
                    <tr key={item.payment_id || item.provider_order_id || index}>
                      <td>{item.profile_id || "-"}</td>
                      <td>{item.matrimony_id || "-"}</td>
                      <td>{item.customer_name || "-"}</td>
                      <td>{item.plan || "-"}</td>
                      <td>{formatMoney(item.amount_rupees)}</td>
                      <td><span className="report-badge verified">{item.payment_status}</span></td>
                      <td>{formatDate(item.payment_date)}</td>
                      <td>{item.payment_id || "-"}</td>
                      <td>{item.provider_order_id || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && <p className="reports-empty">Loading payments...</p>}
              {!loading && payments.length === 0 && (
                <p className="reports-empty">No successful payment records found.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
