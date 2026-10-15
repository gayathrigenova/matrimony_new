import { useEffect, useState } from "react";
import "./AlertToast.css";

const ALERT_EVENT = "app-alert";

export default function AlertToast() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const originalAlert = window.alert;
    const showAlert = (value) => {
      window.dispatchEvent(new CustomEvent(ALERT_EVENT, {
        detail: String(value ?? ""),
      }));
    };
    const receiveAlert = (event) => setMessage(event.detail);

    window.alert = showAlert;
    window.addEventListener(ALERT_EVENT, receiveAlert);

    return () => {
      window.alert = originalAlert;
      window.removeEventListener(ALERT_EVENT, receiveAlert);
    };
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(null), message.length > 220 ? 9000 : 6000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  if (!message) return null;

  const duration = message.length > 220 ? 9000 : 6000;
  const [title, ...details] = message.split("\n").filter((line) => line.trim());
  const isError = /failed|unable|error|invalid|please/i.test(title);

  return (
    <div className={`app-alert-toast ${isError ? "is-error" : "is-success"}`} style={{ "--alert-duration": `${duration}ms` }} role="alert" aria-live="assertive">
      <span className="app-alert-icon" aria-hidden="true">{isError ? "!" : "✓"}</span>
      <div className="app-alert-content">
        <strong>{title || "Notice"}</strong>
        {details.length > 0 && <pre>{details.join("\n")}</pre>}
      </div>
      <button className="app-alert-close" type="button" aria-label="Close message" onClick={() => setMessage(null)}>
        ×
      </button>
      <span key={message} className="app-alert-progress" aria-hidden="true" />
    </div>
  );
}
