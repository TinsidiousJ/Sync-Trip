import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

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
        body: JSON.stringify({
          sessionCode: code,
          displayName: name,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join session");

      // store session info locally
      localStorage.setItem("sessionCode", data.sessionCode);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("host", "0");

      navigate(`/lobby/${data.sessionCode}?userId=${data.userId}&host=0`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Join Session</h1>

      {error ? <p>{error}</p> : null}

      <form onSubmit={onJoin}>
        <div>
          <label>Session Code</label>
          <input
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value)}
            placeholder="ABC123"
          />
        </div>

        <div>
          <label>Your Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="User2"
          />
        </div>

        <button type="submit">Join Session</button>
      </form>
    </div>
  );
}