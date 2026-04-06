import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";

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
    const fromQuery = queryHost === "1";
    const fromStorage = localStorage.getItem("host") === "1";
    return fromQuery || fromStorage;
  }, [queryHost]);

  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [minRating, setMinRating] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [didLoadMyFilters, setDidLoadMyFilters] = useState(false);

  const [showStartPrompt, setShowStartPrompt] = useState(false);
  const [starting, setStarting] = useState(false);

  const tagOptions = useMemo(() => {
    if (session?.planningType === "ACTIVITIES") return TAGS_ACTIVITIES;
    return TAGS_ACCOMMODATION;
  }, [session?.planningType]);

  async function loadLobby({ initialiseMyFilters = false } = {}) {
    try {
      setError("");

      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load lobby");

      if (data.session?.stage === "SEARCH") {
        navigate(`/search/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      if (
        data.session?.stage === "VOTING" ||
        data.session?.stage === "RESULT" ||
        data.session?.stage === "REPLAN_PROMPT"
      ) {
        navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setUsers(data.users || []);
      setSession(data.session || null);

      if ((initialiseMyFilters || !didLoadMyFilters) && userId) {
        const me = (data.users || []).find((user) => user.userId === userId);
        const myFilters = me?.filters;

        if (myFilters) {
          setBudgetMin(
            myFilters.budgetMin === null || typeof myFilters.budgetMin === "undefined"
              ? ""
              : String(myFilters.budgetMin)
          );
          setBudgetMax(
            myFilters.budgetMax === null || typeof myFilters.budgetMax === "undefined"
              ? ""
              : String(myFilters.budgetMax)
          );
          setMinRating(
            myFilters.minRating === null || typeof myFilters.minRating === "undefined"
              ? ""
              : String(myFilters.minRating)
          );
          setSelectedTags(Array.isArray(myFilters.tags) ? myFilters.tags : []);
        }

        setDidLoadMyFilters(true);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  function buildCurrentFilters(nextTags = selectedTags, nextBudgetMin = budgetMin, nextBudgetMax = budgetMax, nextMinRating = minRating) {
    return {
      budgetMin: nextBudgetMin === "" ? null : Number(nextBudgetMin),
      budgetMax: nextBudgetMax === "" ? null : Number(nextBudgetMax),
      minRating: nextMinRating === "" ? null : Number(nextMinRating),
      tags: nextTags,
    };
  }

  async function saveFilters(nextFilters) {
    if (!userId) return;

    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/filters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, filters: nextFilters }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save filters");
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleTag(tag) {
    setSelectedTags((currentTags) => {
      const nextTags = currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag];

      saveFilters(buildCurrentFilters(nextTags));
      return nextTags;
    });
  }

  function handleBudgetMinChange(value) {
    setBudgetMin(value);
    saveFilters(buildCurrentFilters(selectedTags, value, budgetMax, minRating));
  }

  function handleBudgetMaxChange(value) {
    setBudgetMax(value);
    saveFilters(buildCurrentFilters(selectedTags, budgetMin, value, minRating));
  }

  function handleMinRatingChange(value) {
    setMinRating(value);
    saveFilters(buildCurrentFilters(selectedTags, budgetMin, budgetMax, value));
  }

  async function startSession() {
    try {
      setStarting(true);
      setError("");

      const res = await fetch(`${API_BASE}/sessions/${code}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start session");

      navigate(`/search/${code}?userId=${userId}&host=1`);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
      setShowStartPrompt(false);
    }
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadLobby({ initialiseMyFilters: true });

    const timer = setInterval(() => loadLobby(), 2000);
    return () => clearInterval(timer);
  }, [code]);

  useEffect(() => {
    if (!userId) return;
    setDidLoadMyFilters(false);
  }, [userId]);

  return (
    <PageLayout
      pageTitle="Lobby"
      pageSubtitle="Review the group, set your filters, and wait for the host to begin the next stage."
      headerAction={
        isHost ? (
          <button type="button" className="button button--primary" onClick={() => setShowStartPrompt(true)}>
            Start Session
          </button>
        ) : null
      }
    >
      {error ? <div className="alert alert--error" style={{ marginBottom: 20 }}>{error}</div> : null}

      <div className="grid grid--2">
        <section className="card">
          <div className="session-code-box" style={{ marginBottom: 20 }}>
            <div>
              <div className="inline-note">Session code</div>
              <div className="session-code-box__code">{code}</div>
            </div>

            <div className="badge-row">
              <span className="badge badge--primary">{session?.planningType || "Planning"}</span>
              <span className="badge">{session?.destination || "Destination"}</span>
            </div>
          </div>

          {session ? (
            <div className="info-list">
              <div className="info-row">
                <span className="info-row__label">Session name</span>
                <strong>{session.sessionName}</strong>
              </div>
              <div className="info-row">
                <span className="info-row__label">Destination</span>
                <strong>{session.destination}</strong>
              </div>
              <div className="info-row">
                <span className="info-row__label">Stage</span>
                <strong>{session.stage}</strong>
              </div>
            </div>
          ) : null}

          <div className="card__section">
            <h2 className="card__title">Your filters</h2>

            <div className="form-grid">
              <div className="form-grid form-grid--2">
                <div className="field">
                  <label className="field__label">Budget min</label>
                  <input
                    className="input"
                    value={budgetMin}
                    onChange={(e) => handleBudgetMinChange(e.target.value)}
                    placeholder="e.g. 50"
                  />
                </div>

                <div className="field">
                  <label className="field__label">Budget max</label>
                  <input
                    className="input"
                    value={budgetMax}
                    onChange={(e) => handleBudgetMaxChange(e.target.value)}
                    placeholder="e.g. 200"
                  />
                </div>
              </div>

              <div className="field">
                <label className="field__label">Minimum rating</label>
                <select className="select" value={minRating} onChange={(e) => handleMinRatingChange(e.target.value)}>
                  <option value="">Any</option>
                  <option value="3">3+</option>
                  <option value="3.5">3.5+</option>
                  <option value="4">4+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </div>

              <div className="field">
                <label className="field__label">
                  {session?.planningType === "ACTIVITIES" ? "Activity categories" : "Hotel amenities"}
                </label>

                <div className="checkbox-list">
                  {tagOptions.map((tag) => (
                    <label key={tag} className="choice-row">
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTag(tag)}
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="card">
          <h2 className="card__title">Current users in session</h2>

          {users.length === 0 ? (
            <div className="empty-state">No users have joined yet.</div>
          ) : (
            <ul className="user-list">
              {users.map((user) => (
                <li key={user.userId} className="user-list__item">
                  <span className="user-list__name">{user.displayName}</span>
                  <span className="badge">{user.userId === session?.hostUserId ? "Host" : "Member"}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="card__section">
            <div className="alert alert--warning">
              Users will no longer be able to join once the host starts the session.
            </div>
          </div>
        </aside>
      </div>

      <ConfirmPopup
        isOpen={showStartPrompt}
        title="Start session?"
        message="This will move everyone from the lobby into the search stage."
        confirmText="Start Session"
        cancelText="Not Yet"
        onConfirm={startSession}
        onCancel={() => setShowStartPrompt(false)}
        loading={starting}
      />
    </PageLayout>
  );
}