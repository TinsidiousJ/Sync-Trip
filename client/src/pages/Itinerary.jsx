import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";

const API_BASE = "http://localhost:4000";

// format saved date
function formatDateUk(dateValue) {
  if (!dateValue) return "";
  const parts = String(dateValue).split("-");
  if (parts.length !== 3) return dateValue;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTimeUk(timeValue) {
  if (!timeValue) return "";
  const [hour, minute] = String(timeValue).split(":");
  if (!hour || !minute) return timeValue;

  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderSchedule(item) {
  if (!item.scheduledDate) return "Unscheduled";
  if (item.scheduledTime) return `${formatDateUk(item.scheduledDate)} at ${formatTimeUk(item.scheduledTime)}`;
  return formatDateUk(item.scheduledDate);
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

function hasActualPriceText(value) {
  return /\d/.test(String(value || ""));
}

function formatTagLabel(tag) {
  return String(tag || "")
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function isScheduledItem(item) {
  return Boolean(item?.scheduledDate || item?.scheduledTime);
}

// full itinerary page
export default function Itinerary() {
  const navigate = useNavigate();
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const queryHost = searchParams.get("host") || "";
  const userId = useMemo(() => queryUserId || localStorage.getItem("userId") || "", [queryUserId]);

  const [title, setTitle] = useState("Itinerary");
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const [editingItemId, setEditingItemId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  const [itemWaitingForRemovePrompt, setItemWaitingForRemovePrompt] = useState("");

  const [showIncomingReplanPopup, setShowIncomingReplanPopup] = useState(false);
  const [incomingPromptId, setIncomingPromptId] = useState("");
  const [incomingPlanningType, setIncomingPlanningType] = useState("");
  const [respondingToIncomingReplan, setRespondingToIncomingReplan] = useState(false);
  const [showItineraryRequestPopup, setShowItineraryRequestPopup] = useState(false);

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

  // load itinerary items
  async function loadItinerary() {
    try {
      setError("");
      setLoading(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary?userId=${encodeURIComponent(userId)}`);
      const data = await readJsonSafely(res, "Failed to load itinerary");

      if (!res.ok) throw new Error(data.error || "Failed to load itinerary");

      setTitle(data.title || "Itinerary");
      setSession(data.session || null);
      setItems(Array.isArray(data.items) ? data.items : []);
      setPendingRequest(data.pendingRequest || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // maintain session state
  async function loadSessionStage() {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/lobby`);
      const data = await readJsonSafely(res, "Failed to load session");

      if (!res.ok) throw new Error(data.error || "Failed to load session");

      if (data.session?.stage === "SEARCH") {
        navigate(`/search/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`);
        return;
      }

      setSession((current) => ({
        ...(current || {}),
        ...(data.session || {}),
      }));
    } catch (e) {
      setError(e.message);
    }
  }

  function exportItinerary() {
    window.open(`${API_BASE}/sessions/${code}/itinerary/export`, "_blank");
  }

  // open the date and time editor
  function beginEditSchedule(item) {
    setEditingItemId(item.itineraryItemId);
    setEditDate(item.scheduledDate || "");
    setEditTime(item.scheduledTime || "");
    setMessage("");
    setError("");
  }

  function cancelEditSchedule() {
    setEditingItemId("");
    setEditDate("");
    setEditTime("");
  }

  // save date and time
  async function saveSchedule(itineraryItemId) {
    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/items/${itineraryItemId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          scheduledDate: editDate,
          scheduledTime: editTime,
        }),
      });

      const data = await readJsonSafely(res, "Failed to save schedule");
      if (!res.ok) throw new Error(data.error || "Failed to save schedule");

      setMessage("Schedule saved. The itinerary has been re-sorted where needed.");
      cancelEditSchedule();
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  }

  // date and time values
  async function clearSchedule(itineraryItemId) {
    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/items/${itineraryItemId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          scheduledDate: "",
          scheduledTime: "",
        }),
      });

      const data = await readJsonSafely(res, "Failed to clear schedule");
      if (!res.ok) throw new Error(data.error || "Failed to clear schedule");

      setMessage("Schedule cleared.");
      cancelEditSchedule();
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  }

  // request removing an item
  async function requestRemove(itineraryItemId) {
    if (!itineraryItemId) return;

    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/request-remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, itineraryItemId }),
      });

      const data = await readJsonSafely(res, "Failed to request removal");
      if (!res.ok) throw new Error(data.error || "Failed to request removal");

      setMessage("Removal request created. It will apply once everyone approves.");
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
      setItemWaitingForRemovePrompt("");
    }
  }

  // move unscheduled activities
  async function moveItem(itineraryItemId, direction) {
    if (!itineraryItemId || !direction) return;

    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/request-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, itineraryItemId, direction }),
      });

      const data = await readJsonSafely(res, "Failed to move item");
      if (!res.ok) throw new Error(data.error || "Failed to move item");

      setMessage(data.message || `Item moved ${direction.toLowerCase()}.`);
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  }

  // approve the change request
  async function approveRequest() {
    if (!pendingRequest?.requestId) return;

    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/requests/${pendingRequest.requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await readJsonSafely(res, "Failed to approve request");
      if (!res.ok) throw new Error(data.error || "Failed to approve request");

      if (data.applied) {
        setMessage("Request approved by everyone and applied to the itinerary.");
      } else {
        setMessage("Request approved. Waiting for the remaining users.");
      }

      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  }

  async function respondToReplan(accept) {
    try {
      const res = await fetch(`${API_BASE}/sessions/${code}/replan/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, accept, promptId: incomingPromptId }),
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
      await loadSessionStage();
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setRespondingToIncomingReplan(false);
    }
  }

  function goBackToMainFlow() {
    const hostFlag = queryHost || localStorage.getItem("host") || "0";
    const stage = session?.stage || "";

    if (stage === "SEARCH") {
      navigate(`/search/${code}?userId=${userId}&host=${hostFlag}`);
      return;
    }

    navigate(`/vote/${code}?userId=${userId}&host=${hostFlag}`);
  }

  useEffect(() => {
    if (!code) return;

    // keep session on refresh
    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);
    if (queryHost) localStorage.setItem("host", queryHost);

    loadItinerary();
    loadSessionStage();
  }, [code, queryUserId, queryHost]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadItinerary();
      loadSessionStage();
    }, 2000);

    return () => clearInterval(timer);
  }, [code, userId]);

  useEffect(() => {
    // show the replan popup
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
    // show pending itinerary requests
    if (!pendingRequest?.requestId || pendingRequest.currentUserHasApproved) {
      setShowItineraryRequestPopup(false);
      if (!pendingRequest?.requestId) {
        lastSeenItineraryRequestIdRef.current = "";
      }
      return;
    }

    if (pendingRequest.requestId !== lastSeenItineraryRequestIdRef.current) {
      lastSeenItineraryRequestIdRef.current = pendingRequest.requestId;
      setShowItineraryRequestPopup(true);
    }
  }, [pendingRequest]);

  const currentUserHasApproved = Boolean(pendingRequest?.currentUserHasApproved);

  const unscheduledActivityIdsInOrder = useMemo(() => {
    return items
      .filter((item) => item.type === "ACTIVITIES" && !isScheduledItem(item))
      .map((item) => item.itineraryItemId);
  }, [items]);

  function canMoveUp(item) {
    if (item.type !== "ACTIVITIES") return false;
    if (isScheduledItem(item)) return false;
    const index = unscheduledActivityIdsInOrder.indexOf(item.itineraryItemId);
    return index > 0;
  }

  function canMoveDown(item) {
    if (item.type !== "ACTIVITIES") return false;
    if (isScheduledItem(item)) return false;
    const index = unscheduledActivityIdsInOrder.indexOf(item.itineraryItemId);
    return index !== -1 && index < unscheduledActivityIdsInOrder.length - 1;
  }

  return (
    <PageLayout
      pageTitle={title}
      pageSubtitle="Review the final selections, add dates or times, and collaboratively refine the itinerary."
      headerAction={
        <div className="button-row">
          <button type="button" className="button button--secondary" onClick={loadItinerary}>
            Refresh
          </button>
          <button type="button" className="button button--primary" onClick={exportItinerary}>
            Export Itinerary
          </button>
        </div>
      }
    >
      {error ? <div className="alert alert--error" style={{ marginBottom: 20 }}>{error}</div> : null}
      {message ? <div className="alert alert--success" style={{ marginBottom: 20 }}>{message}</div> : null}
      {loading ? <div className="alert">Loading itinerary...</div> : null}

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
              <span className="info-row__label">Stage</span>
              <strong>{session.stage}</strong>
            </div>
          </div>

          <div className="button-row" style={{ marginTop: 16 }}>
            <button type="button" className="button button--secondary" onClick={goBackToMainFlow}>
              Back
            </button>
          </div>
        </div>
      ) : null}

      <div className="alert alert--warning" style={{ marginBottom: 20 }}>
        Scheduled items are automatically sorted chronologically. Only unscheduled activities can be moved up or down directly, and removals still require group approval.
      </div>

      {items.length === 0 && !loading ? (
        <div className="empty-state">No itinerary items have been saved yet.</div>
      ) : (
        <div className="option-grid">
          {items.map((item) => {
            const isEditingSchedule = editingItemId === item.itineraryItemId;
            const isScheduled = isScheduledItem(item);
            const showMoveButtons = item.type === "ACTIVITIES";
            const moveUpAllowed = canMoveUp(item);
            const moveDownAllowed = canMoveDown(item);

            return (
              <div key={item.itineraryItemId} className="option-card">
                {item.image ? (
                  <img src={item.image} alt={item.title} className="option-card__image" />
                ) : (
                  <div className="option-card__image option-card__image--placeholder">No image available</div>
                )}

                <div>
                  <div className="badge-row" style={{ marginBottom: 8 }}>
                    <span className="badge badge--primary">
                      {item.type === "ACCOMMODATION" ? "Accommodation" : "Activity"}
                    </span>
                    <span className={`badge ${isScheduled ? "badge--success" : ""}`}>
                      {renderSchedule(item)}
                    </span>
                  </div>

                  <h3 className="option-card__title">
                    {item.orderIndex}. {item.title}
                  </h3>

                  {item.subtitle ? <p className="option-card__subtitle">{item.subtitle}</p> : null}
                </div>

                <div className="option-card__meta">
                  <span className="badge">Rating: {item.rating ?? "Unavailable"}</span>
                  {renderPrice(item) ? <span className="badge">Price: {renderPrice(item)}</span> : null}
                </div>

                {item.tags?.length ? (
                  <div className="badge-row">
                    {item.tags.map((tag) => (
                      <span key={tag} className="badge">
                        {formatTagLabel(tag)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.link ? (
                  <a href={item.link} target="_blank" rel="noreferrer" className="inline-note">
                    View source
                  </a>
                ) : null}

                {item.type === "ACTIVITIES" ? (
                  <div className="inline-note">
                    {isScheduled
                      ? "This activity is scheduled, so it cannot be moved manually."
                      : "This activity is unscheduled and can be moved up or down."}
                  </div>
                ) : null}

                {isEditingSchedule ? (
                  <div className="card card--muted">
                    <div className="form-grid form-grid--2">
                      <div className="field">
                        <label className="field__label">Date</label>
                        <input
                          type="date"
                          className="input"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                        />
                      </div>

                      <div className="field">
                        <label className="field__label">Time</label>
                        <input
                          type="time"
                          className="input"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="button-row" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => saveSchedule(item.itineraryItemId)}
                        disabled={acting}
                      >
                        {acting ? "Saving..." : "Save Date / Time"}
                      </button>

                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => clearSchedule(item.itineraryItemId)}
                        disabled={acting}
                      >
                        Clear Schedule
                      </button>

                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={cancelEditSchedule}
                        disabled={acting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {!pendingRequest ? (
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => beginEditSchedule(item)}
                      disabled={acting}
                    >
                      {isScheduled ? "Edit Date / Time" : "Add Date / Time"}
                    </button>

                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => setItemWaitingForRemovePrompt(item.itineraryItemId)}
                      disabled={acting}
                    >
                      Request Remove
                    </button>

                    {showMoveButtons ? (
                      <>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => moveItem(item.itineraryItemId, "UP")}
                          disabled={acting || !moveUpAllowed}
                          title={
                            isScheduled
                              ? "Scheduled activities cannot be moved"
                              : !moveUpAllowed
                                ? "This activity is already at the top of the unscheduled activity list"
                                : "Move this activity up"
                          }
                        >
                          Move Up
                        </button>

                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => moveItem(item.itineraryItemId, "DOWN")}
                          disabled={acting || !moveDownAllowed}
                          title={
                            isScheduled
                              ? "Scheduled activities cannot be moved"
                              : !moveDownAllowed
                                ? "This activity is already at the bottom of the unscheduled activity list"
                                : "Move this activity down"
                          }
                        >
                          Move Down
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="inline-note">
                    A pending removal request must be resolved before another change can be made.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmPopup
        isOpen={Boolean(itemWaitingForRemovePrompt)}
        title="Request removal?"
        message="This will create a group approval request to remove the selected itinerary item."
        confirmText="Create Request"
        cancelText="Cancel"
        onConfirm={() => requestRemove(itemWaitingForRemovePrompt)}
        onCancel={() => setItemWaitingForRemovePrompt("")}
        loading={acting}
      />

      <ConfirmPopup
        isOpen={showItineraryRequestPopup && Boolean(pendingRequest) && !currentUserHasApproved}
        title="Approve removal request?"
        message={
          pendingRequest?.itineraryItemTitle
            ? `Approve removing "${pendingRequest.itineraryItemTitle}" from the itinerary?`
            : "Approve this itinerary removal request?"
        }
        confirmText="Approve Request"
        cancelText="Not Now"
        isDanger
        onConfirm={approveRequest}
        onCancel={() => setShowItineraryRequestPopup(false)}
        loading={acting}
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
    </PageLayout>
  );
}
