import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:4000";

export default function Lobby() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const isHost = useMemo(() => searchParams.get("host") === "1", [searchParams]);

  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  async function loadLobby() {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load lobby");
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (!code) return;

    loadLobby();
    const t = setInterval(loadLobby, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div>
      <h1>Lobby</h1>

      <p>
        Session Code: <strong>{code}</strong>
      </p>

      {isHost ? (
        <button type="button" onClick={() => {}}>
          Start Session
        </button>
      ) : null}

      {error ? <p>{error}</p> : null}

      <h2>Users</h2>
      {users.length === 0 ? (
        <p>No users yet</p>
      ) : (
        <ul>
          {users.map((u) => (
            <li key={u.userId}>{u.displayName}</li>
          ))}
        </ul>
      )}
    </div>
  );
}