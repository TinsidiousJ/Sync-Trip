import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";
import ItineraryPopup from "../components/ItineraryPopup.jsx";

const API_BASE = "http://localhost:4000";

function formatTagLabel(tag) {
  return String(tag || "")
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function hasActualPriceText(value) {
  return /\d/.test(String(value || ""));
}

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

  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);

  const [pendingItineraryRequest, setPendingItineraryRequest] = useState(null);
  const [approvingItineraryRequest, setApprovingItineraryRequest] = useState(false);
  const [showItineraryRequestPopup, setShowItineraryRequestPopup] = useState(false);

  const [showIncomingReplanPopup, setShowIncomingReplanPopup] = useState(false);
  const [incomingPromptId, setIncomingPromptId] = useState("");
  const [incomingPlanningType, setIncomingPlanningType] = useState("");
  const [respondingToIncomingReplan, setRespondingToIncomingReplan] = useState(false);

  const lastSeenPromptIdRef = useRef("");
  const lastSeenItineraryRequestIdRef = useRef("");

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

      const nextCandidatesRaw = data.candidates || [];

      const votable = nextCandidatesRaw.filter((candidate) => candidate.canVote);
      const ownExclusiveSubmissions = nextCandidatesRaw.filter(
        (candidate) => !candidate.canVote && !candidate.sharedSubmission
      );
      const nextCandidates = [...votable, ...ownExclusiveSubmissions];

      setCandidates(nextCandidates);

      setVoteState((currentState) => {
        const nextVoteState = {};

        for (const candidate of nextCandidates) {
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

      setActiveCandidateIndex((currentIndex) => {
        if (nextCandidates.length === 0) return 0;
        if (currentIndex > nextCandidates.length - 1) return nextCandidates.length - 1;
        return currentIndex;
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

  async function loadPendingItineraryRequest() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary`);
      const data = await readJsonSafely(res, "Failed to load itinerary status");

      if (!res.ok) throw new Error(data.error || "Failed to load itinerary status");

      setPendingItineraryRequest(data.pendingRequest || null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function approvePendingItineraryRequest() {
    if (!pendingItineraryRequest?.requestId) return;

    try {
      setError("");
      setMessage("");
      setApprovingItineraryRequest(true);

      const res = await fetch(
        `${API_BASE}/sessions/${code}/itinerary/requests/${pendingItineraryRequest.requestId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );

      const data = await readJsonSafely(res, "Failed to approve itinerary request");
      if (!res.ok) throw new Error(data.error || "Failed to approve itinerary request");

      if (data.applied) {
        setMessage("Itinerary request approved by everyone and applied.");
      } else {
        setMessage("Itinerary request approved. Waiting for the remaining users.");
      }

      await loadPendingItineraryRequest();
    } catch (e) {
      setError(e.message);
    } finally {
      setApprovingItineraryRequest(false);
    }
  }

  async function respondToReplan(accept) {
    try {
      const promptIdToUse = incomingPromptId || session?.replanPrompt?.promptId || "";

      setError("");
      setMessage("");
      setRespondingToIncomingReplan(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/replan/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accept, promptId: promptIdToUse }),
      });

      const data = await readJsonSafely(res, "Failed to respond to replan prompt");
      if (!res.ok) throw new Error(data.error || "Failed to respond to replan prompt");

      setShowIncomingReplanPopup(false);

      if (!accept) {
        localStorage.removeItem("sessionCode");
        localStorage.removeItem("userId");
        localStorage.removeItem("host");
        window.alert("You chose not to continue, so you have been removed from the session.");
        navigate("/");
        return;
      }

      if (data.stage === "SEARCH") {
        navigate(`/search/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setMessage("You agreed to continue. Waiting for the remaining users.");
      await loadSession();
      await loadVotingStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setRespondingToIncomingReplan(false);
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
    const priceLevelText = String(item.priceLevelText || "").trim();
    const isAccommodation = item?.type === "ACCOMMODATION";

    if (hasActualPriceText(priceLevelText)) {
      return priceLevelText;
    }

    if (item.price !== null && typeof item.price !== "undefined" && Number.isFinite(Number(item.price))) {
      return `${item.currency || "GBP"} ${Number(item.price)}`;
    }

    if (isAccommodation) {
      return "";
    }

    if (priceLevelText) {
      return priceLevelText;
    }

    return "Price unavailable";
  }

  function goPreviousCandidate() {
    setActiveCandidateIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  }

  function goNextCandidate() {
    setActiveCandidateIndex((currentIndex) => Math.min(currentIndex + 1, candidates.length - 1));
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
      await loadPendingItineraryRequest();
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

      setMessage("Replanning request sent. Waiting for the other users to accept.");
      await loadSession();
      await loadVotingStatus();
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
    loadPendingItineraryRequest();
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSession();
      loadVotingStatus();
      loadPendingItineraryRequest();
    }, 2000);

    return () => clearInterval(timer);
  }, [code, userId]);

  useEffect(() => {
    if (!session || session.stage !== "REPLAN_PROMPT" || !session.replanPrompt?.active) {
      setShowIncomingReplanPopup(false);
      setIncomingPromptId("");
      setIncomingPlanningType("");
      lastSeenPromptIdRef.current = "";
      return;
    }

    const isHost = session.hostUserId === userId;
    const acceptedUsers = session.replanPrompt?.acceptedUserIds || [];
    const alreadyResponded = acceptedUsers.includes(userId);
    const currentPromptId =
      session.replanPrompt?.promptId ||
      `${session.replanPrompt?.planningType || ""}-${session.replanPrompt?.createdAt || ""}`;

    if (!currentPromptId) return;

    if (currentPromptId !== lastSeenPromptIdRef.current) {
      lastSeenPromptIdRef.current = currentPromptId;

      if (!isHost && !alreadyResponded) {
        setIncomingPromptId(session.replanPrompt?.promptId || "");
        setIncomingPlanningType(session.replanPrompt?.planningType || "");
        setShowIncomingReplanPopup(true);
      }
    }
  }, [session, userId]);

  useEffect(() => {
    if (!pendingItineraryRequest?.requestId || pendingItineraryRequest.approvals?.includes(userId)) {
      setShowItineraryRequestPopup(false);
      if (!pendingItineraryRequest?.requestId) {
        lastSeenItineraryRequestIdRef.current = "";
      }
      return;
    }

    if (pendingItineraryRequest.requestId !== lastSeenItineraryRequestIdRef.current) {
      lastSeenItineraryRequestIdRef.current = pendingItineraryRequest.requestId;
      setShowItineraryRequestPopup(true);
    }
  }, [pendingItineraryRequest, userId]);

  const isResultStage = status?.stage === "RESULT" || session?.stage === "REPLAN_PROMPT";
  const isHost = session?.hostUserId === userId;
  const activeCandidate = candidates[activeCandidateIndex] || null;
  const currentVote = activeCandidate
    ? voteState[activeCandidate.optionId] || {
        approval: null,
        ranking: "",
        acknowledgedFilterViolation: false,
      }
    : null;

  const showFilterWarning =
    activeCandidate &&
    activeCandidate.canVote &&
    currentVote?.approval === true &&
    !activeCandidate.matchesUserFilters;

  const currentUserApprovedPendingRequest = pendingItineraryRequest?.approvals?.includes(userId);

  return (
    <PageLayout
      pageTitle={isResultStage ? "Result" : "Voting"}
      pageSubtitle="All options are anonymous. Review one option at a time and vote on every candidate except your own submission."
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

          {status?.stage === "RESULT" || session?.stage === "REPLAN_PROMPT" ? (
            <div className="card__section">
              <h2 className="card__title">Winning option</h2>

              {status?.winner ? (
                <>
                  {status.winner.image ? (
                    <img
                      src={status.winner.image}
                      alt={status.winner.title}
                      className="option-card__image"
                      style={{ marginBottom: 12 }}
                    />
                  ) : null}

                  <p>
                    <strong>{status.winner.title}</strong>
                  </p>
                  {status.winner.subtitle ? <p className="inline-note">{status.winner.subtitle}</p> : null}
                  <p className="inline-note">This option has been saved to the itinerary.</p>
                </>
              ) : (
                <p className="inline-note">Final result is being loaded.</p>
              )}

              <div className="button-row" style={{ marginTop: 12 }}>
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
          ) : null}
        </div>
      ) : null}

      {!isResultStage ? (
        candidates.length === 0 ? (
          <div className="empty-state">Loading candidates...</div>
        ) : activeCandidate ? (
          <div className="vote-focus-stack">
            <div className="button-row vote-inline-nav">
              <button
                type="button"
                className="button button--secondary"
                onClick={goPreviousCandidate}
                disabled={activeCandidateIndex === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="button button--secondary"
                onClick={goNextCandidate}
                disabled={activeCandidateIndex === candidates.length - 1}
              >
                Next →
              </button>
            </div>

            <div className="option-card vote-focus-card">
              {activeCandidate.image ? (
                <img src={activeCandidate.image} alt={activeCandidate.title} className="option-card__image" />
              ) : (
                <div className="option-card__image option-card__image--placeholder">No image available</div>
              )}

              <div>
                <div className="badge-row" style={{ marginBottom: 8 }}>
                  <span className="badge badge--primary">{activeCandidate.label}</span>
                  <span className="badge">
                    {activeCandidateIndex + 1} / {candidates.length}
                  </span>
                  {!activeCandidate.canVote && !activeCandidate.sharedSubmission ? (
                    <span className="badge badge--warning">Your own submission</span>
                  ) : null}
                  {activeCandidate.sharedSubmission ? (
                    <span className="badge badge--success">Shared submission</span>
                  ) : null}
                </div>

                <h3 className="option-card__title">{activeCandidate.title}</h3>
                {activeCandidate.subtitle ? <p className="option-card__subtitle">{activeCandidate.subtitle}</p> : null}
              </div>

              <div className="option-card__meta">
                <span className="badge">Rating: {activeCandidate.rating ?? "Unavailable"}</span>
                {renderPrice(activeCandidate) ? (
                  <span className="badge">Price: {renderPrice(activeCandidate)}</span>
                ) : null}
              </div>

              {activeCandidate.tags?.length ? (
                <div className="badge-row">
                  {activeCandidate.tags.map((tag) => (
                    <span key={tag} className="badge">
                      {formatTagLabel(tag)}
                    </span>
                  ))}
                </div>
              ) : null}

              {activeCandidate.link ? (
                <a href={activeCandidate.link} target="_blank" rel="noreferrer" className="inline-note">
                  View source
                </a>
              ) : null}

              {activeCandidate.sharedSubmissionMessage ? (
                <div className="alert alert--success">
                  {activeCandidate.sharedSubmissionMessage}
                </div>
              ) : null}

              {!activeCandidate.canVote ? (
                <div className="alert alert--warning">You cannot vote on your own submission.</div>
              ) : (
                <>
                  <div className="radio-list">
                    <label className="choice-row">
                      <input
                        type="radio"
                        name={`approval-${activeCandidate.optionId}`}
                        checked={currentVote.approval === true}
                        onChange={() => updateVote(activeCandidate.optionId, { approval: true })}
                      />
                      <span>Approve option</span>
                    </label>

                    <label className="choice-row">
                      <input
                        type="radio"
                        name={`approval-${activeCandidate.optionId}`}
                        checked={currentVote.approval === false}
                        onChange={() =>
                          updateVote(activeCandidate.optionId, {
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
                        onChange={(e) => updateVote(activeCandidate.optionId, { ranking: e.target.value })}
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
                            updateVote(activeCandidate.optionId, {
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

            <div className="button-row vote-inline-nav">
              <button
                type="button"
                className="button button--secondary"
                onClick={goPreviousCandidate}
                disabled={activeCandidateIndex === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="button button--secondary"
                onClick={goNextCandidate}
                disabled={activeCandidateIndex === candidates.length - 1}
              >
                Next →
              </button>
            </div>
          </div>
        ) : null
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

      <ConfirmPopup
        isOpen={showItineraryRequestPopup && Boolean(pendingItineraryRequest) && !currentUserApprovedPendingRequest}
        title="Approve removal request?"
        message={
          pendingItineraryRequest?.itineraryItemTitle
            ? `Approve removing "${pendingItineraryRequest.itineraryItemTitle}" from the itinerary?`
            : "Approve this itinerary removal request?"
        }
        confirmText="Approve Request"
        cancelText="Not Now"
        isDanger
        onConfirm={approvePendingItineraryRequest}
        onCancel={() => setShowItineraryRequestPopup(false)}
        loading={approvingItineraryRequest}
      />

      <ConfirmPopup
        isOpen={showIncomingReplanPopup}
        title="Continue into the next round?"
        message={
          incomingPlanningType === "ACTIVITIES"
            ? "The host wants to start a new activities round. Choose Continue to join the next round, or Leave Session if you do not want to take part."
            : "The host wants to start a new accommodation round. Choose Continue to join the next round, or Leave Session if you do not want to take part."
        }
        confirmText="Continue"
        cancelText="Leave Session"
        onConfirm={() => respondToReplan(true)}
        onCancel={() => respondToReplan(false)}
        loading={respondingToIncomingReplan}
      />

      <ItineraryPopup
        isOpen={showItineraryPopup}
        sessionCode={code}
        onClose={() => setShowItineraryPopup(false)}
      />
    </PageLayout>
  );
}
