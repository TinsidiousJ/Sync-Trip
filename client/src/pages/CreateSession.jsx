import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:4000";

export default function CreateSession() {
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(true);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [destination, setDestination] = useState("");
  const [planningType, setPlanningType] = useState("ACCOMMODATION");

  useEffect(() => {
    let cancelled = false;

    async function reserveDraft() {
      try {
        setLoadingCode(true);
        setError("");

        const res = await fetch(`${API_BASE}/sessions/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate session code");

        if (!cancelled) setSessionCode(data.sessionCode);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoadingCode(false);
      }
    }

    reserveDraft();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreateSession(e) {
    e.preventDefault();
    setError("");

    if (!sessionCode) {
      setError("No session code yet. Refresh the page.");
      return;
    }

    if (!displayName || !sessionName || !destination) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/sessions/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionCode,
          displayName,
          planningType,
          sessionName,
          destination,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");

      navigate(`/lobby/${data.sessionCode}?userId=${data.userId}&host=1`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>Create Session</h1>

      {loadingCode ? <p>Generating code...</p> : null}
      {!loadingCode && sessionCode ? (
        <p>
          Session Code: <strong>{sessionCode}</strong>
        </p>
      ) : null}

      {error ? <p>{error}</p> : null}

      <form onSubmit={onCreateSession}>
        <div>
          <label>Your name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="User1"
          />
        </div>

        <div>
          <label>Session name</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="Paris 2026"
          />
        </div>

        <div>
          <label>Destination</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Paris"
          />
        </div>

        <div>
          <label>What are you planning?</label>
          <select value={planningType} onChange={(e) => setPlanningType(e.target.value)}>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="ACTIVITIES">Activities</option>
          </select>
        </div>

        <button type="submit" disabled={!sessionCode || loadingCode}>
          Create Session
        </button>
      </form>
    </div>
  );
}