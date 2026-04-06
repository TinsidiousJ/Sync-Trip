import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";

const API_BASE = "http://localhost:4000";

export default function CreateSession() {
  const navigate = useNavigate();
  const blurTimeoutRef = useRef(null);

  const [sessionCode, setSessionCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(true);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [destination, setDestination] = useState("");
  const [planningType, setPlanningType] = useState("ACCOMMODATION");

  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(null);

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

  useEffect(() => {
    let cancelled = false;

    async function fetchCountrySuggestions() {
      const query = destination.trim();

      if (query.length < 2) {
        setCountrySuggestions([]);
        setLoadingCountries(false);
        return;
      }

      try {
        setLoadingCountries(true);

        const res = await fetch(`${API_BASE}/locations/countries?text=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load country suggestions");

        if (!cancelled) {
          setCountrySuggestions(data.results || []);
        }
      } catch (e) {
        if (!cancelled) {
          setCountrySuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCountries(false);
        }
      }
    }

    const timer = setTimeout(fetchCountrySuggestions, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [destination]);

  function chooseCountry(country) {
    setDestination(country.name);
    setSelectedCountry(country);
    setCountrySuggestions([]);
    setShowCountrySuggestions(false);
  }

  function handleDestinationChange(value) {
    setDestination(value);
    setSelectedCountry(null);
    setShowCountrySuggestions(true);
  }

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

    if (!selectedCountry || selectedCountry.name !== destination.trim()) {
      setError("Please choose a country from the suggestions.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/sessions/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionCode,
          displayName: displayName.trim(),
          planningType,
          sessionName: sessionName.trim(),
          destination: selectedCountry.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");

      localStorage.setItem("sessionCode", data.sessionCode);
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("host", "1");

      navigate(`/lobby/${data.sessionCode}?userId=${data.userId}&host=1`);
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <PageLayout
      pageTitle="Create a new trip session"
      pageSubtitle="Set up the session, share the code with your group, and begin collaborative planning."
    >
      <div className="grid grid--2">
        <section className="card">
          {error ? <div className="alert alert--error">{error}</div> : null}

          <form className="form-grid" onSubmit={onCreateSession}>
            <div className="form-grid form-grid--2">
              <div className="field">
                <label className="field__label">Your display name</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. JohnDoe"
                />
              </div>

              <div className="field">
                <label className="field__label">Session name</label>
                <input
                  className="input"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Europe Trip 2026"
                />
              </div>
            </div>

            <div className="form-grid form-grid--2">
              <div className="field" style={{ position: "relative" }}>
                <label className="field__label">Destination country</label>
                <input
                  className="input"
                  value={destination}
                  onChange={(e) => handleDestinationChange(e.target.value)}
                  onFocus={() => setShowCountrySuggestions(true)}
                  onBlur={() => {
                    blurTimeoutRef.current = setTimeout(() => {
                      setShowCountrySuggestions(false);
                    }, 150);
                  }}
                  placeholder="Start typing a country..."
                  autoComplete="off"
                />

                <div className="field__hint">
                  Choose from the list so only valid countries can be used.
                </div>

                {showCountrySuggestions && (countrySuggestions.length > 0 || loadingCountries) ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "var(--shadow)",
                      marginTop: 8,
                      overflow: "hidden",
                      zIndex: 20,
                    }}
                  >
                    {loadingCountries ? (
                      <div style={{ padding: 12, color: "var(--text-soft)" }}>Loading suggestions...</div>
                    ) : (
                      countrySuggestions.map((country) => (
                        <button
                          key={country.placeId}
                          type="button"
                          onMouseDown={() => {
                            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                            chooseCountry(country);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: 12,
                            border: "none",
                            background: "#fff",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <strong>{country.name}</strong>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label className="field__label">Planning stage</label>
                <select className="select" value={planningType} onChange={(e) => setPlanningType(e.target.value)}>
                  <option value="ACCOMMODATION">Accommodation</option>
                  <option value="ACTIVITIES">Activities</option>
                </select>
              </div>
            </div>

            <div className="button-row">
              <button type="submit" className="button button--primary" disabled={!sessionCode || loadingCode}>
                {loadingCode ? "Generating code..." : "Create Session"}
              </button>
            </div>
          </form>
        </section>

        <aside className="card">
          <h2 className="card__title">Session code</h2>

          <div className="session-code-box">
            <div>
              <div className="inline-note">Share this with your group</div>
              <div className="session-code-box__code">{loadingCode ? "......" : sessionCode || "------"}</div>
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
        </aside>
      </div>
    </PageLayout>
  );
}