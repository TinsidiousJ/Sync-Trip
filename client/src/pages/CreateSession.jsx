import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";

const API_BASE = "http://localhost:4000";

export default function CreateSession() {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [destination, setDestination] = useState("");
  const [planningType, setPlanningType] = useState("ACCOMMODATION");

  const [sessionCode, setSessionCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(null);

  const debounceRef = useRef(null);
  const suggestionRequestRef = useRef(0);
  const suggestionBoxRef = useRef(null);

  const canCreate = useMemo(() => {
    return (
      displayName.trim() &&
      sessionName.trim() &&
      destination.trim() &&
      selectedDestination &&
      !creating
    );
  }, [displayName, sessionName, destination, selectedDestination, creating]);

  async function readJsonSafely(res, fallbackMessage) {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  async function fetchDestinationSuggestions(searchText) {
    const trimmedSearchText = String(searchText || "").trim();
    const requestId = suggestionRequestRef.current + 1;
    suggestionRequestRef.current = requestId;

    if (trimmedSearchText.length < 1) {
      setDestinationSuggestions([]);
      setShowSuggestions(false);
      setLoadingSuggestions(false);
      return;
    }

    try {
      setLoadingSuggestions(true);
      setShowSuggestions(true);
      setError("");

      const res = await fetch(
        `${API_BASE}/locations/destinations?text=${encodeURIComponent(trimmedSearchText)}`
      );
      const data = await readJsonSafely(res, "Failed to load destination suggestions");

      if (!res.ok) {
        throw new Error(data.error || "Failed to load destination suggestions");
      }

      if (requestId !== suggestionRequestRef.current) return;

      const nextSuggestions = Array.isArray(data.results) ? data.results : [];
      setDestinationSuggestions(nextSuggestions);
      setShowSuggestions(true);
    } catch (e) {
      if (requestId !== suggestionRequestRef.current) return;

      setDestinationSuggestions([]);
      setShowSuggestions(false);
      setError(e.message);
    } finally {
      if (requestId === suggestionRequestRef.current) {
        setLoadingSuggestions(false);
      }
    }
  }

  function handleDestinationChange(value) {
    setDestination(value);
    setSelectedDestination(null);
    setError("");
    setMessage("");

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length > 0) {
      setShowSuggestions(true);
    }

    debounceRef.current = setTimeout(() => {
      fetchDestinationSuggestions(value);
    }, 150);
  }

  function handleSuggestionSelect(item) {
    setDestination(item.formatted || item.name);
    setSelectedDestination(item);
    setDestinationSuggestions([]);
    setShowSuggestions(false);
    setError("");
  }

  async function createDraftIfNeeded() {
    if (sessionCode) return sessionCode;

    const res = await fetch(`${API_BASE}/sessions/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await readJsonSafely(res, "Failed to create draft session");
    if (!res.ok) throw new Error(data.error || "Failed to create draft session");

    setSessionCode(data.sessionCode);
    return data.sessionCode;
  }

  async function handleCreateSession(e) {
    e.preventDefault();

    try {
      setError("");
      setMessage("");

      if (!displayName.trim() || !sessionName.trim() || !destination.trim()) {
        throw new Error("Please complete all fields.");
      }

      if (!selectedDestination || (selectedDestination.formatted || selectedDestination.name) !== destination.trim()) {
        throw new Error("Please choose a destination from the suggestions.");
      }

      setCreating(true);

      const draftCode = await createDraftIfNeeded();

      const res = await fetch(`${API_BASE}/sessions/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionCode: draftCode,
          displayName: displayName.trim(),
          sessionName: sessionName.trim(),
          destination: selectedDestination.formatted || selectedDestination.name,
          planningType,
        }),
      });

      const data = await readJsonSafely(res, "Failed to activate session");
      if (!res.ok) throw new Error(data.error || "Failed to activate session");

      localStorage.setItem("sessionCode", data.sessionCode);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("host", "1");

      navigate(`/lobby/${data.sessionCode}?userId=${data.userId}&host=1`);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    createDraftIfNeeded().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <PageLayout
      pageTitle="Create a new session"
      pageSubtitle="Set up the trip, choose a destination from the suggestions, and invite your group with the generated session code."
    >
      <div className="grid">
        <section className="card">
          <form onSubmit={handleCreateSession} className="form-grid">
            {error ? <div className="alert alert--error">{error}</div> : null}
            {message ? <div className="alert alert--warning">{message}</div> : null}

            <div className="field">
              <label className="field__label">Your display name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Tyler"
              />
            </div>

            <div className="field">
              <label className="field__label">Session name</label>
              <input
                className="input"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Paris 2026"
              />
            </div>

            <div className="field suggestion-field" ref={suggestionBoxRef}>
              <label className="field__label">Destination</label>
              <input
                className="input"
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                onFocus={() => {
                  if (destinationSuggestions.length > 0 || destination.trim().length > 0) {
                    setShowSuggestions(true);
                  }
                  if (destination.trim().length > 0 && destinationSuggestions.length === 0) {
                    fetchDestinationSuggestions(destination);
                  }
                }}
                placeholder="Start typing a city or country"
                autoComplete="off"
              />

              <div className="field__hint">
                Choose from the list so only valid destinations can be used.
              </div>

              {loadingSuggestions ? (
                <div className="suggestion-dropdown">
                  <button type="button" className="suggestion-item suggestion-item--static">
                    Loading suggestions...
                  </button>
                </div>
              ) : null}

              {!loadingSuggestions && showSuggestions && destinationSuggestions.length > 0 ? (
                <div className="suggestion-dropdown">
                  {destinationSuggestions.map((item) => (
                    <button
                      key={item.placeId}
                      type="button"
                      className="suggestion-item"
                      onClick={() => handleSuggestionSelect(item)}
                    >
                      <div className="suggestion-item__text">
                        <span className="suggestion-item__title">{item.name}</span>
                        {item.subtitle ? (
                          <span className="suggestion-item__subtitle">{item.subtitle}</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {!loadingSuggestions &&
              showSuggestions &&
              destination.trim().length >= 1 &&
              destinationSuggestions.length === 0 ? (
                <div className="suggestion-dropdown">
                  <button type="button" className="suggestion-item suggestion-item--static">
                    No matching destinations found
                  </button>
                </div>
              ) : null}
            </div>

            <div className="field">
              <label className="field__label">Planning stage</label>
              <select
                className="select"
                value={planningType}
                onChange={(e) => setPlanningType(e.target.value)}
              >
                <option value="ACCOMMODATION">Accommodation</option>
                <option value="ACTIVITIES">Activities</option>
              </select>
            </div>

            <div className="button-row">
              <button type="submit" className="button button--primary" disabled={!canCreate}>
                {creating ? "Creating..." : "Create Session"}
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2 className="card__title">Session code</h2>

          <div className="session-code-box">
            <div>
              <div className="inline-note">Share this with your group</div>
              <div className="session-code-box__code">{sessionCode || "Loading..."}</div>
            </div>
          </div>

          <div className="card__section">
            <h3 className="card__title">What happens next</h3>
            <div className="badge-row">
              <span className="badge">Users join with the code</span>
              <span className="badge">Filters are set in lobby</span>
              <span className="badge">Host starts session</span>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
