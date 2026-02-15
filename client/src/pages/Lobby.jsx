import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:4000";

const TAGS_ACCOMMODATION = [
  "WIFI",
  "BREAKFAST_INCLUDED",
  "PARKING",
  "POOL",
  "GYM",
  "AIR_CONDITIONING",
  "PET_FRIENDLY",
];

const TAGS_ACTIVITIES = [
  "OUTDOOR",
  "INDOOR",
  "FAMILY_FRIENDLY",
  "FOOD_AND_DRINK",
  "MUSEUMS",
  "NIGHTLIFE",
  "FREE_OR_LOW_COST",
];

export default function Lobby() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const queryHost = searchParams.get("host") || "";

  const userId = useMemo(() => {
    return queryUserId || localStorage.getItem("userId") || "";
  }, [queryUserId]);

  const isHost = useMemo(() => {
    const qp = queryHost === "1";
    const ls = localStorage.getItem("host") === "1";
    return qp || ls;
  }, [queryHost]);

  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  const [didInitForm, setDidInitForm] = useState(false);

  const autosaveTimerRef = useRef(null);
  const lastSavedRef = useRef("");

  const tagOptions = useMemo(() => {
    if (session?.planningType === "ACTIVITIES") return TAGS_ACTIVITIES;
    return TAGS_ACCOMMODATION;
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
          setBudgetMin(
            f.budgetMin === null || typeof f.budgetMin === "undefined"
              ? ""
              : String(f.budgetMin)
          );
          setBudgetMax(
            f.budgetMax === null || typeof f.budgetMax === "undefined"
              ? ""
              : String(f.budgetMax)
          );
          setSelectedTags(Array.isArray(f.tags) ? f.tags : []);
        }

        setDidInitForm(true);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleTag(tag) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      return [...prev, tag];
    });
  }

  async function saveFiltersNow(next) {
    if (!userId) return;

    const payload = JSON.stringify({
      userId,
      filters: {
        budgetMin: next.budgetMin === "" ? null : Number(next.budgetMin),
        budgetMax: next.budgetMax === "" ? null : Number(next.budgetMax),
        tags: next.tags,
      },
    });

    if (payload === lastSavedRef.current) return;

    const res = await fetch(`${API_BASE}/sessions/${code}/filters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to auto-save filters");

    lastSavedRef.current = payload;
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);
  }, [code]);

  useEffect(() => {
    if (!code) return;

    loadLobby({ initForm: true });
    const t = setInterval(() => loadLobby({ initForm: false }), 1500);

    return () => clearInterval(t);
  }, [code, userId]);

  useEffect(() => {
    if (!didInitForm) return;
    if (!userId) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(() => {
      saveFiltersNow({
        budgetMin,
        budgetMax,
        tags: selectedTags,
      }).catch((e) => setError(e.message));
    }, 400);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [budgetMin, budgetMax, selectedTags, didInitForm, userId]);

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
        </div>
      ) : null}

      {isHost ? (
        <button type="button" onClick={() => {}}>
          Start Session
        </button>
      ) : null}

      {error ? <p>{error}</p> : null}

      <h2>Your Filters</h2>

      <div>
        <div>
          <label>Budget Min</label>
          <input
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            placeholder="e.g. 50"
          />
        </div>

        <div>
          <label>Budget Max</label>
          <input
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="e.g. 200"
          />
        </div>

        <div>
          <label>Tags</label>
          <div>
            {tagOptions.map((tag) => (
              <label key={tag} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {tag}
              </label>
            ))}
          </div>
        </div>
      </div>

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