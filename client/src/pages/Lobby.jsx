import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:4000";

const ACCOMMODATION_TAGS = [
  "WIFI",
  "BREAKFAST_INCLUDED",
  "PARKING",
  "POOL",
  "GYM",
  "AIR_CONDITIONING",
  "PET_FRIENDLY",
];

const ACTIVITY_TAGS = [
  "TOURISM",
  "ENTERTAINMENT",
  "CATERING",
  "LEISURE",
  "NATURAL",
];

export default function Lobby() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const queryHost = searchParams.get("host") || "";

  const userId = useMemo(() => queryUserId || localStorage.getItem("userId") || "", [queryUserId]);

  const isHost = useMemo(() => {
    const qp = queryHost === "1";
    const ls = localStorage.getItem("host") === "1";
    return qp || ls;
  }, [queryHost]);

  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [didInitForm, setDidInitForm] = useState(false);

  const tagOptions = useMemo(() => {
    if (session?.planningType === "ACTIVITIES") return ACTIVITY_TAGS;
    return ACCOMMODATION_TAGS;
  }, [session?.planningType]);

  async function loadLobby({ initForm = false } = {}) {
    try {
      setError("");

      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load lobby");

      setUsers(data.users || []);
      setSession(data.session || null);

      if ((initForm || !didInitForm) && userId) {
        const me = (data.users || []).find((u) => u.userId === userId);
        const f = me?.filters;

        if (f) {
          setBudgetMin(f.budgetMin === null || typeof f.budgetMin === "undefined" ? "" : String(f.budgetMin));
          setBudgetMax(f.budgetMax === null || typeof f.budgetMax === "undefined" ? "" : String(f.budgetMax));
          setMinRating(f.minRating === null || typeof f.minRating === "undefined" ? "" : String(f.minRating));
          setSelectedTags(Array.isArray(f.tags) ? f.tags : []);
        }

        setDidInitForm(true);
      }

      if (data.session?.stage === "SEARCH" || data.session?.isStarted) {
        navigate(`/search/${code}?userId=${userId}&host=${isHost ? "1" : "0"}`);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveFilters(next) {
    if (!userId) return;

    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/filters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, filters: next }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save filters");
    } catch (e) {
      setError(e.message);
    }
  }

  async function startSession() {
    try {
      setError("");
      setStarting(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session");

      navigate(`/search/${code}?userId=${userId}&host=${isHost ? "1" : "0"}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  function currentFilterPayload(overrides = {}) {
    return {
      budgetMin: budgetMin === "" ? null : Number(budgetMin),
      budgetMax: budgetMax === "" ? null : Number(budgetMax),
      minRating: minRating === "" ? null : Number(minRating),
      tags: selectedTags,
      ...overrides,
    };
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      saveFilters(currentFilterPayload({ tags: next }));
      return next;
    });
  }

  function onChangeBudgetMin(v) {
    setBudgetMin(v);
    saveFilters(currentFilterPayload({ budgetMin: v === "" ? null : Number(v) }));
  }

  function onChangeBudgetMax(v) {
    setBudgetMax(v);
    saveFilters(currentFilterPayload({ budgetMax: v === "" ? null : Number(v) }));
  }

  function onChangeMinRating(v) {
    setMinRating(v);
    saveFilters(currentFilterPayload({ minRating: v === "" ? null : Number(v) }));
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadLobby({ initForm: true });

    const t = setInterval(() => loadLobby(), 1500);
    return () => clearInterval(t);
  }, [code]);

  useEffect(() => {
    if (!userId) return;
    setDidInitForm(false);
  }, [userId]);

  return (
    <div>
      <h1>Lobby</h1>

      <p>
        Session Code: <strong>{code}</strong>
      </p>

      {session ? (
        <div>
          <p>
            Session: <strong>{session.sessionName}</strong>
          </p>
          <p>
            Destination: <strong>{session.destination}</strong>
          </p>
          <p>
            Planning Type: <strong>{session.planningType}</strong>
          </p>
        </div>
      ) : null}

      {isHost ? (
        <button type="button" onClick={startSession} disabled={starting}>
          {starting ? "Starting..." : "Start Session"}
        </button>
      ) : null}

      {!isHost ? <p>Waiting for host to start the session...</p> : null}

      {error ? <p>{error}</p> : null}

      <h2>Your Filters</h2>

      <div>
        <div>
          <label>Budget Min</label>
          <input value={budgetMin} onChange={(e) => onChangeBudgetMin(e.target.value)} placeholder="e.g. 50" />
        </div>

        <div>
          <label>Budget Max</label>
          <input value={budgetMax} onChange={(e) => onChangeBudgetMax(e.target.value)} placeholder="e.g. 200" />
        </div>

        <div>
          <label>Minimum Rating</label>
          <select value={minRating} onChange={(e) => onChangeMinRating(e.target.value)}>
            <option value="">Any</option>
            <option value="3">3+</option>
            <option value="3.5">3.5+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </div>

        <div>
          <label>{session?.planningType === "ACTIVITIES" ? "Activity Categories" : "Hotel Amenities"}</label>
          <div>
            {tagOptions.map((tag) => (
              <label key={tag} style={{ display: "block" }}>
                <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
                {tag}
              </label>
            ))}
          </div>
        </div>
      </div>

      <h2>Users in Lobby</h2>
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