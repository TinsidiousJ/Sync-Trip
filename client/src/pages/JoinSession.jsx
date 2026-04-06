import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";

const API_BASE = "http://localhost:4000";

export default function JoinSession() {
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  async function onJoin(e) {
    e.preventDefault();
    setError("");

    const code = sessionCode.trim().toUpperCase();
    const name = displayName.trim();

    if (!code || !name) {
      setError("Please enter session code and your name.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/sessions/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode: code, displayName: name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join session");

      localStorage.setItem("sessionCode", data.sessionCode);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("host", "0");

      navigate(`/lobby/${data.sessionCode}?userId=${data.userId}&host=0`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <PageLayout
      pageTitle="Join an existing trip session"
      pageSubtitle="Enter the session code shared by the host and join the collaborative planning flow."
    >
      <div className="grid grid--2">
        <section className="card">
          {error ? <div className="alert alert--error">{error}</div> : null}

          <form className="form-grid" onSubmit={onJoin}>
            <div className="field">
              <label className="field__label">Session code</label>
              <input
                className="input"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value)}
                placeholder="ABC123"
              />
            </div>

            <div className="field">
              <label className="field__label">Your display name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. JohnDoe"
              />
            </div>

            <div className="button-row">
              <button type="submit" className="button button--primary">
                Join Session
              </button>
            </div>
          </form>
        </section>

        <aside className="card">
          <h2 className="card__title">Before you join</h2>
          <div className="section-stack">
            <div className="card card--muted">
              <p className="inline-note">You will enter the lobby first, where you can review the session and set filters.</p>
            </div>
            <div className="card card--muted">
              <p className="inline-note">Once the host starts the session, the group moves into the search and decision process.</p>
            </div>
          </div>
        </aside>
      </div>
    </PageLayout>
  );
}