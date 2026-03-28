import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

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

  const hasShownPromptRef = useRef(false);

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

      setVoteState((prev) => {
        const nextState = {};

        for (const candidate of data.candidates || []) {
          const existingBackendVote = candidate.myVote
            ? {
                approval: candidate.myVote.approval ?? null,
                ranking: candidate.myVote.ranking ?? "",
                acknowledgedFilterViolation: candidate.myVote.acknowledgedFilterViolation ?? false,
              }
            : null;

          nextState[candidate.optionId] =
            prev[candidate.optionId] ??
            existingBackendVote ?? {
              approval: null,
              ranking: "",
              acknowledgedFilterViolation: false,
            };
        }

        return nextState;
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
    setVoteState((prev) => ({
      ...prev,
      [optionId]: {
        ...prev[optionId],
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

      const votableCandidates = candidates.filter((candidate) => candidate.canVote);

      const payloadVotes = votableCandidates.map((candidate) => {
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
        body: JSON.stringify({ userId, votes: payloadVotes }),
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
      hasShownPromptRef.current = false;
      return;
    }

    const isHost = session.hostUserId === userId;
    const accepted = session.replanPrompt?.acceptedUserIds || [];
    const alreadyResponded = accepted.includes(userId);

    if (!isHost && !alreadyResponded && !hasShownPromptRef.current) {
      hasShownPromptRef.current = true;

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
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Voting</h1>

      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}

      {session ? (
        <div style={{ marginBottom: 20 }}>
          <p>
            Session Code: <strong>{code}</strong>
          </p>
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

      {status ? (
        <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
          <p>
            Voting round: <strong>{status.roundNumber}</strong>
          </p>
          <p>
            Voting progress: <strong>{status.completedUsers}</strong> / <strong>{status.totalUsers}</strong> users finished
          </p>
          <p>
            Your voting status: <strong>{status.currentUserCompleted ? "Complete" : "Incomplete"}</strong>
          </p>
          <p>
            Your required votes: <strong>{status.currentUserVotes}</strong> / <strong>{status.currentUserExpectedVotes}</strong>
          </p>

          {status.stage === "RESULT" || session?.stage === "REPLAN_PROMPT" ? (
            status.winner ? (
              <div>
                <p>
                  <strong>Final Winning Option:</strong> {status.winner.title}
                </p>
                {status.winner.subtitle ? <p>{status.winner.subtitle}</p> : null}
                <p>This winning option has been saved to the itinerary.</p>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/itinerary/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`)
                    }
                  >
                    View Itinerary
                  </button>

                  {isHost ? (
                    <>
                      <button type="button" onClick={() => requestReplan("ACCOMMODATION")} disabled={requestingReplan}>
                        {requestingReplan ? "Sending..." : "Plan Another Accommodation"}
                      </button>

                      <button type="button" onClick={() => requestReplan("ACTIVITIES")} disabled={requestingReplan}>
                        {requestingReplan ? "Sending..." : "Plan Activities"}
                      </button>
                    </>
                  ) : session?.stage === "REPLAN_PROMPT" ? (
                    <p style={{ margin: 0 }}>Waiting for all remaining users to respond.</p>
                  ) : (
                    <p style={{ margin: 0 }}>Only the host can start the next planning round.</p>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            <p>The result will appear once everyone has voted.</p>
          )}
        </div>
      ) : null}

      {!isResultStage ? (
        <>
          <h2>Anonymous Candidate Pool</h2>

          {candidates.length === 0 ? (
            <p>Loading candidates...</p>
          ) : (
            <div>
              {candidates.map((candidate) => {
                const currentVote = voteState[candidate.optionId] || {
                  approval: null,
                  ranking: "",
                  acknowledgedFilterViolation: false,
                };

                const showViolationWarning =
                  candidate.canVote &&
                  currentVote.approval === true &&
                  !candidate.matchesUserFilters;

                return (
                  <div
                    key={candidate.optionId}
                    style={{
                      border: "1px solid #ccc",
                      padding: 16,
                      marginBottom: 16,
                      borderRadius: 8,
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>{candidate.label}</h3>

                    {candidate.image ? (
                      <img
                        src={candidate.image}
                        alt={candidate.title}
                        style={{
                          width: "100%",
                          maxWidth: 320,
                          height: 180,
                          objectFit: "cover",
                          display: "block",
                          marginBottom: 12,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 320,
                          height: 180,
                          border: "1px solid #ddd",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: 12,
                        }}
                      >
                        No image
                      </div>
                    )}

                    <p style={{ margin: "0 0 8px 0" }}>
                      <strong>{candidate.title}</strong>
                    </p>

                    {candidate.subtitle ? <p style={{ margin: "0 0 8px 0" }}>{candidate.subtitle}</p> : null}

                    <p style={{ margin: "0 0 8px 0" }}>
                      <strong>Rating:</strong>{" "}
                      {candidate.rating !== null && typeof candidate.rating !== "undefined"
                        ? candidate.rating
                        : "Unavailable"}
                    </p>

                    <p style={{ margin: "0 0 8px 0" }}>
                      <strong>Price:</strong> {renderPrice(candidate)}
                    </p>

                    {candidate.tags?.length ? (
                      <p style={{ margin: "0 0 8px 0" }}>
                        <strong>Tags:</strong> {candidate.tags.join(", ")}
                      </p>
                    ) : null}

                    {candidate.link ? (
                      <p style={{ margin: "0 0 12px 0" }}>
                        <a href={candidate.link} target="_blank" rel="noreferrer">
                          View source
                        </a>
                      </p>
                    ) : null}

                    {!candidate.canVote ? (
                      <div style={{ border: "1px solid #999", padding: 12, borderRadius: 8 }}>
                        <p style={{ marginTop: 0, marginBottom: 0 }}>
                          You cannot vote on your own submission.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ marginRight: 12 }}>
                            <input
                              type="radio"
                              name={`approval-${candidate.optionId}`}
                              checked={currentVote.approval === true}
                              onChange={() => updateVote(candidate.optionId, { approval: true })}
                            />
                            Approve
                          </label>

                          <label>
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
                            Reject
                          </label>
                        </div>

                        {currentVote.approval === true ? (
                          <div style={{ marginBottom: 12 }}>
                            <label>Ranking</label>
                            <br />
                            <select
                              value={currentVote.ranking}
                              onChange={(e) => updateVote(candidate.optionId, { ranking: e.target.value })}
                            >
                              <option value="">Choose</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                              <option value="5">5</option>
                            </select>
                          </div>
                        ) : null}

                        {showViolationWarning ? (
                          <div style={{ border: "1px solid #f0ad4e", padding: 12, borderRadius: 8 }}>
                            <p style={{ marginTop: 0 }}>
                              This approval is outside your saved filters. You can still continue, but you must acknowledge it.
                            </p>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(currentVote.acknowledgedFilterViolation)}
                                onChange={(e) =>
                                  updateVote(candidate.optionId, {
                                    acknowledgedFilterViolation: e.target.checked,
                                  })
                                }
                              />
                              I understand and want to continue
                            </label>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}

              <button type="button" onClick={submitVotes} disabled={savingVotes}>
                {savingVotes ? "Saving..." : "Submit Votes"}
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}