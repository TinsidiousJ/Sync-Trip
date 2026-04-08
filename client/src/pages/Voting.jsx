import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";
import ItineraryPopup from "../components/ItineraryPopup.jsx";

const API_BASE = "http://localhost:4000";

export default function Voting() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const queryHost = searchParams.get("host") || "";
  const userId = useMemo(() => queryUserId || localStorage.getItem("userId") || "", [queryUserId]);

  const [session, setSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [voteState, setVoteState] = useState({});
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingVotes, setSavingVotes] = useState(false);
  const [requestingReplan, setRequestingReplan] = useState(false);
  const [showItineraryPopup, setShowItineraryPopup] = useState(false);

  const [showVoteSubmitPrompt, setShowVoteSubmitPrompt] = useState(false);
  const [nextPlanningType, setNextPlanningType] = useState("");
  const [showReplanPrompt, setShowReplanPrompt] = useState(false);

  const hasShownReplanPromptRef = useRef(false);

  async function readJsonSafely(res, fallbackMessage) {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  async function loadSession() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await readJsonSafely(res, "Failed to load session");

      if (!res.ok) throw new Error(data.error || "Failed to load session");

      if (data.session?.stage === "SEARCH") {
        navigate(`/search/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      if (data.session?.stage === "LOBBY") {
        navigate(`/lobby/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setSession(data.session || null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadCandidates() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/voting/candidates?userId=${encodeURIComponent(userId)}`);
      const data = await readJsonSafely(res, "Failed to load voting candidates");

      if (!res.ok) throw new Error(data.error || "Failed to load voting candidates");

      setCandidates(data.candidates || []);

      setVoteState((currentState) => {
        const nextVoteState = {};

        for (const candidate of data.candidates || []) {
          const existingVoteFromBackend = candidate.myVote
            ? {
                approval: candidate.myVote.approval ?? null,
                ranking: candidate.myVote.ranking ?? "",
                acknowledgedFilterViolation: candidate.myVote.acknowledgedFilterViolation ?? false,
              }
            : null;

          nextVoteState[candidate.optionId] =
            currentState[candidate.optionId] ??
            existingVoteFromBackend ?? {
              approval: null,
              ranking: "",
              acknowledgedFilterViolation: false,
            };
        }

        return nextVoteState;
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadVotingStatus() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/voting-status?userId=${encodeURIComponent(userId)}`);
      const data = await readJsonSafely(res, "Failed to load voting status");

      if (!res.ok) throw new Error(data.error || "Failed to load voting status");

      setStatus(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function respondToReplan(accept) {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/replan/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accept }),
      });

      const data = await readJsonSafely(res, "Failed to respond to replan prompt");
      if (!res.ok) throw new Error(data.error || "Failed to respond to replan prompt");

      if (!accept) {
        localStorage.removeItem("sessionCode");
        localStorage.removeItem("userId");
        localStorage.removeItem("host");
        window.alert("You chose not to continue, so you have been removed from the session.");
        navigate("/");
        return;
      }

      if (data.stage === "LOBBY") {
        navigate(`/lobby/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setMessage("You agreed to continue. Waiting for the remaining users.");
    } catch (e) {
      setError(e.message);
    }
  }

  function updateVote(optionId, patch) {
    setVoteState((currentState) => ({
      ...currentState,
      [optionId]: {
        ...currentState[optionId],
        ...patch,
      },
    }));
  }

  function renderPrice(item) {
    if (item.price === null || typeof item.price === "undefined") return "Price unavailable";
    return `${item.currency || "GBP"} ${item.price}`;
  }

  async function submitVotes() {
    try {
      setError("");
      setMessage("");
      setSavingVotes(true);

      const candidatesYouCanVoteOn = candidates.filter((candidate) => candidate.canVote);

      if (candidatesYouCanVoteOn.length === 0) {
        throw new Error("There are no valid candidates available for you to vote on.");
      }

      const votesToSend = candidatesYouCanVoteOn.map((candidate) => {
        const vote = voteState[candidate.optionId] || {};

        if (vote.approval === null) {
          throw new Error(`Please choose approve or reject for ${candidate.label}.`);
        }

        if (vote.approval === true && !vote.ranking) {
          throw new Error(`Please assign a ranking for ${candidate.label}.`);
        }

        if (vote.approval === true && !candidate.matchesUserFilters && !vote.acknowledgedFilterViolation) {
          throw new Error(`Please acknowledge the filter warning for ${candidate.label}.`);
        }

        return {
          optionId: candidate.optionId,
          approval: vote.approval,
          ranking: vote.approval ? Number(vote.ranking) : null,
          acknowledgedFilterViolation: Boolean(vote.acknowledgedFilterViolation),
        };
      });

      const res = await fetch(`${API_BASE}/sessions/${code}/votes/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, votes: votesToSend }),
      });

      const data = await readJsonSafely(res, "Failed to submit votes");
      if (!res.ok) throw new Error(data.error || "Failed to submit votes");

      if (data.itineraryItem) {
        setMessage("Votes saved. The winning option has been added to the itinerary.");
      } else {
        setMessage("Votes saved.");
      }

      await loadSession();
      await loadVotingStatus();
      await loadCandidates();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingVotes(false);
      setShowVoteSubmitPrompt(false);
    }
  }

  async function requestReplan(planningType) {
    try {
      setError("");
      setMessage("");
      setRequestingReplan(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/replan/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, planningType }),
      });

      const data = await readJsonSafely(res, "Failed to request next planning round");
      if (!res.ok) throw new Error(data.error || "Failed to request next planning round");

      if (data.stage === "LOBBY") {
        navigate(`/lobby/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "1"}`);
        return;
      }

      setMessage("Replanning request sent. Waiting for the other users to accept.");
      await loadSession();
    } catch (e) {
      setError(e.message);
    } finally {
      setRequestingReplan(false);
      setShowReplanPrompt(false);
    }
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadSession();
    loadCandidates();
    loadVotingStatus();
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSession();
      loadVotingStatus();
    }, 2000);

    return () => clearInterval(timer);
  }, [code, userId]);

  useEffect(() => {
    if (!session || session.stage !== "REPLAN_PROMPT") {
      hasShownReplanPromptRef.current = false;
      return;
    }

    const isHost = session.hostUserId === userId;
    const acceptedUsers = session.replanPrompt?.acceptedUserIds || [];
    const alreadyResponded = acceptedUsers.includes(userId);

    if (!isHost && !alreadyResponded && !hasShownReplanPromptRef.current) {
      hasShownReplanPromptRef.current = true;

      const planningLabel =
        session.replanPrompt?.planningType === "ACTIVITIES" ? "activities" : "accommodation";

      const wantsToContinue = window.confirm(
        `The host wants to plan another ${planningLabel}. Press OK to continue in the session. Press Cancel to leave the session.`
      );

      respondToReplan(wantsToContinue);
    }
  }, [session, userId]);

  const isResultStage = status?.stage === "RESULT" || session?.stage === "REPLAN_PROMPT";
  const isHost = session?.hostUserId === userId;

  return (
    <PageLayout
      pageTitle={isResultStage ? "Result" : "Voting"}
      pageSubtitle="All options are anonymous. Vote on every candidate except your own submission."
      headerAction={
        <button type="button" className="button button--secondary" onClick={() => setShowItineraryPopup(true)}>
          View Itinerary
        </button>
      }
    >
      {error ? <div className="alert alert--error" style={{ marginBottom: 20 }}>{error}</div> : null}
      {message ? <div className="alert alert--warning" style={{ marginBottom: 20 }}>{message}</div> : null}

      {session ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="info-list">
            <div className="info-row">
              <span className="info-row__label">Session code</span>
              <strong>{code}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Session</span>
              <strong>{session.sessionName}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Destination</span>
              <strong>{session.destination}</strong>
            </div>
            <div className="info-row">
              <span className="info-row__label">Planning type</span>
              <strong>{session.planningType}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {status ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="status-panel">
            <div className="info-row">
              <span className="info-row__label">Voting round</span>
              <strong>{status.roundNumber}</strong>
            </div>

            <div className="info-row">
              <span className="info-row__label">Completed users</span>
              <strong>
                {status.completedUsers} / {status.totalUsers}
              </strong>
            </div>

            <div className="status-panel__progress">
              <span
                style={{
                  width: `${status.totalUsers > 0 ? (status.completedUsers / status.totalUsers) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="badge-row">
              <span className={`badge ${status.currentUserCompleted ? "badge--success" : "badge--warning"}`}>
                {status.currentUserCompleted ? "Your vote is complete" : "Your vote is incomplete"}
              </span>
              <span className="badge">
                {status.currentUserVotes} / {status.currentUserExpectedVotes} required votes
              </span>
            </div>
          </div>

          {!isResultStage ? (
            <div className="card__section">
              <div className="alert alert--warning">
                Ranking scale: <strong>5 is highest</strong> and <strong>1 is lowest</strong>.
              </div>
            </div>
          ) : null}

          {status.stage === "RESULT" || session?.stage === "REPLAN_PROMPT" ? (
            status.winner ? (
              <div className="card__section">
                <h2 className="card__title">Winning option</h2>
                <p>
                  <strong>{status.winner.title}</strong>
                </p>
                {status.winner.subtitle ? <p className="inline-note">{status.winner.subtitle}</p> : null}
                <p className="inline-note">This option has been saved to the itinerary.</p>

                <div className="button-row">
                  {isHost ? (
                    <>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => {
                          setNextPlanningType("ACCOMMODATION");
                          setShowReplanPrompt(true);
                        }}
                        disabled={requestingReplan}
                      >
                        Plan Another Accommodation
                      </button>

                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => {
                          setNextPlanningType("ACTIVITIES");
                          setShowReplanPrompt(true);
                        }}
                        disabled={requestingReplan}
                      >
                        Plan Activities
                      </button>
                    </>
                  ) : session?.stage === "REPLAN_PROMPT" ? (
                    <span className="inline-note">Waiting for all remaining users to respond.</span>
                  ) : (
                    <span className="inline-note">Only the host can start the next planning round.</span>
                  )}
                </div>
              </div>
            ) : null
          ) : null}
        </div>
      ) : null}

      {!isResultStage ? (
        <div className="option-grid">
          {candidates.length === 0 ? (
            <div className="empty-state">Loading candidates...</div>
          ) : (
            candidates.map((candidate) => {
              const currentVote = voteState[candidate.optionId] || {
                approval: null,
                ranking: "",
                acknowledgedFilterViolation: false,
              };

              const showFilterWarning =
                candidate.canVote &&
                currentVote.approval === true &&
                !candidate.matchesUserFilters;

              return (
                <div key={candidate.optionId} className="option-card">
                  {candidate.image ? (
                    <img src={candidate.image} alt={candidate.title} className="option-card__image" />
                  ) : (
                    <div className="option-card__image option-card__image--placeholder">No image available</div>
                  )}

                  <div>
                    <div className="badge-row" style={{ marginBottom: 8 }}>
                      <span className="badge badge--primary">{candidate.label}</span>
                      {!candidate.canVote ? <span className="badge badge--warning">Your own submission</span> : null}
                    </div>

                    <h3 className="option-card__title">{candidate.title}</h3>
                    {candidate.subtitle ? <p className="option-card__subtitle">{candidate.subtitle}</p> : null}
                  </div>

                  <div className="option-card__meta">
                    <span className="badge">Rating: {candidate.rating ?? "Unavailable"}</span>
                    <span className="badge">Price: {renderPrice(candidate)}</span>
                  </div>

                  {candidate.tags?.length ? (
                    <div className="badge-row">
                      {candidate.tags.map((tag) => (
                        <span key={tag} className="badge">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {candidate.link ? (
                    <a href={candidate.link} target="_blank" rel="noreferrer" className="inline-note">
                      View source
                    </a>
                  ) : null}

                  {!candidate.canVote ? (
                    <div className="alert alert--warning">You cannot vote on your own submission.</div>
                  ) : (
                    <>
                      <div className="radio-list">
                        <label className="choice-row">
                          <input
                            type="radio"
                            name={`approval-${candidate.optionId}`}
                            checked={currentVote.approval === true}
                            onChange={() => updateVote(candidate.optionId, { approval: true })}
                          />
                          <span>Approve option</span>
                        </label>

                        <label className="choice-row">
                          <input
                            type="radio"
                            name={`approval-${candidate.optionId}`}
                            checked={currentVote.approval === false}
                            onChange={() =>
                              updateVote(candidate.optionId, {
                                approval: false,
                                ranking: "",
                                acknowledgedFilterViolation: false,
                              })
                            }
                          />
                          <span>Decline option</span>
                        </label>
                      </div>

                      {currentVote.approval === true ? (
                        <div className="field">
                          <label className="field__label">Your rating contribution</label>
                          <div className="field__hint">Use 5 for your highest preference and 1 for your lowest.</div>
                          <select
                            className="select"
                            value={currentVote.ranking}
                            onChange={(e) => updateVote(candidate.optionId, { ranking: e.target.value })}
                          >
                            <option value="">Choose</option>
                            <option value="1">1 - Lowest</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5 - Highest</option>
                          </select>
                        </div>
                      ) : null}

                      {showFilterWarning ? (
                        <div className="alert alert--error">
                          <p style={{ marginTop: 0 }}>
                            This approval is outside your saved filters. You can still continue if you acknowledge this.
                          </p>
                          <label className="choice-row">
                            <input
                              type="checkbox"
                              checked={Boolean(currentVote.acknowledgedFilterViolation)}
                              onChange={(e) =>
                                updateVote(candidate.optionId, {
                                  acknowledgedFilterViolation: e.target.checked,
                                })
                              }
                            />
                            <span>I understand and want to continue</span>
                          </label>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {!isResultStage ? (
        <div className="button-row" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setShowVoteSubmitPrompt(true)}
            disabled={savingVotes}
          >
            {savingVotes ? "Saving..." : "Submit Votes"}
          </button>
        </div>
      ) : null}

      <ConfirmPopup
        isOpen={showVoteSubmitPrompt}
        title="Submit votes?"
        message="Confirm your votes for this round. Once saved, your progress will update for the group."
        confirmText="Submit Votes"
        cancelText="Keep Editing"
        onConfirm={submitVotes}
        onCancel={() => setShowVoteSubmitPrompt(false)}
        loading={savingVotes}
      />

      <ConfirmPopup
        isOpen={showReplanPrompt}
        title="Start another planning round?"
        message={
          nextPlanningType === "ACTIVITIES"
            ? "All remaining users will be asked if they want to continue planning activities."
            : "All remaining users will be asked if they want to continue planning accommodation."
        }
        confirmText="Send Prompt"
        cancelText="Cancel"
        onConfirm={() => requestReplan(nextPlanningType)}
        onCancel={() => setShowReplanPrompt(false)}
        loading={requestingReplan}
      />

      <ItineraryPopup
        isOpen={showItineraryPopup}
        sessionCode={code}
        onClose={() => setShowItineraryPopup(false)}
      />
    </PageLayout>
  );
}