import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";
import ConfirmPopup from "../components/ConfirmPopup.jsx";

const API_BASE = "http://localhost:4000";

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
  const [movePromptInfo, setMovePromptInfo] = useState({ itemId: "", direction: "" });

  async function readJsonSafely(res, fallbackMessage) {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(fallbackMessage);
    }
  }

  async function loadItinerary() {
    try {
      setError("");
      setLoading(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary`);
      const data = await readJsonSafely(res, "Failed to load itinerary");

      if (!res.ok) throw new Error(data.error || "Failed to load itinerary");

      setTitle(data.title || "Itinerary");
      setSession(data.session || null);
      setItems(data.items || []);
      setPendingRequest(data.pendingRequest || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function renderPrice(item) {
    if (item.price === null || typeof item.price === "undefined") return "Price unavailable";
    return `${item.currency || "GBP"} ${item.price}`;
  }

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

  function exportItinerary() {
    window.open(`${API_BASE}/sessions/${code}/itinerary/export`, "_blank");
  }

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

  async function requestRemove(itineraryItemId) {
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

  async function requestMove(itineraryItemId, direction) {
    try {
      setError("");
      setMessage("");
      setActing(true);

      const res = await fetch(`${API_BASE}/sessions/${code}/itinerary/request-move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, itineraryItemId, direction }),
      });

      const data = await readJsonSafely(res, "Failed to request move");
      if (!res.ok) throw new Error(data.error || "Failed to request move");

      setMessage("Reorder request created. It will apply once everyone approves.");
      await loadItinerary();
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
      setMovePromptInfo({ itemId: "", direction: "" });
    }
  }

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

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);

    loadItinerary();
  }, [code, queryUserId]);

  const currentUserHasApproved = pendingRequest?.approvals?.includes(userId);

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
      {message ? <div className="alert alert--warning" style={{ marginBottom: 20 }}>{message}</div> : null}
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
          </div>

          <div className="button-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`)
              }
            >
              Back to Voting / Result
            </button>
          </div>
        </div>
      ) : null}

      <div className="alert alert--warning" style={{ marginBottom: 20 }}>
        Scheduled items are automatically sorted chronologically. Scheduled activities cannot be manually moved until the schedule is cleared or changed.
      </div>

      {pendingRequest ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="card__title">Pending group change</h2>

          <div className="info-list">
            <div className="info-row">
              <span className="info-row__label">Type</span>
              <strong>{pendingRequest.type}</strong>
            </div>

            {pendingRequest.moveDirection ? (
              <div className="info-row">
                <span className="info-row__label">Direction</span>
                <strong>{pendingRequest.moveDirection}</strong>
              </div>
            ) : null}

            <div className="info-row">
              <span className="info-row__label">Approvals</span>
              <strong>
                {pendingRequest.approvalCount} / {pendingRequest.totalUsers}
              </strong>
            </div>
          </div>

          {!currentUserHasApproved ? (
            <div className="button-row" style={{ marginTop: 16 }}>
              <button type="button" className="button button--primary" onClick={approveRequest} disabled={acting}>
                {acting ? "Submitting..." : "Approve Request"}
              </button>
            </div>
          ) : (
            <p className="inline-note" style={{ marginTop: 16 }}>
              You have already approved this request.
            </p>
          )}
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <div className="empty-state">No itinerary items have been saved yet.</div>
      ) : (
        <div className="option-grid">
          {items.map((item) => {
            const isEditingSchedule = editingItemId === item.itineraryItemId;
            const isScheduled = Boolean(item.scheduledDate || item.scheduledTime);

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
                  <span className="badge">Price: {renderPrice(item)}</span>
                </div>

                {item.tags?.length ? (
                  <div className="badge-row">
                    {item.tags.map((tag) => (
                      <span key={tag} className="badge">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {item.link ? (
                  <a href={item.link} target="_blank" rel="noreferrer" className="inline-note">
                    View source
                  </a>
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
                      className="button button--secondary"
                      onClick={() => setItemWaitingForRemovePrompt(item.itineraryItemId)}
                      disabled={acting}
                    >
                      Request Remove
                    </button>

                    {item.type === "ACTIVITIES" ? (
                      <>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() =>
                            setMovePromptInfo({ itemId: item.itineraryItemId, direction: "UP" })
                          }
                          disabled={acting || isScheduled}
                        >
                          Move Up
                        </button>

                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() =>
                            setMovePromptInfo({ itemId: item.itineraryItemId, direction: "DOWN" })
                          }
                          disabled={acting || isScheduled}
                        >
                          Move Down
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="inline-note">
                    A pending request must be resolved before another change can be made.
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
        isOpen={Boolean(movePromptInfo.itemId)}
        title="Request reorder?"
        message={`This will create a group approval request to move the selected activity ${
          movePromptInfo.direction === "UP" ? "up" : "down"
        } in the itinerary.`}
        confirmText="Create Request"
        cancelText="Cancel"
        onConfirm={() => requestMove(movePromptInfo.itemId, movePromptInfo.direction)}
        onCancel={() => setMovePromptInfo({ itemId: "", direction: "" })}
        loading={acting}
      />
    </PageLayout>
  );
}