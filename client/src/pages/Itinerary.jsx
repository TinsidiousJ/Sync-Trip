import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

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

  function renderSchedule(item) {
    if (!item.scheduledDate) return "Unscheduled";
    if (item.scheduledTime) return `${item.scheduledDate} at ${item.scheduledTime}`;
    return `${item.scheduledDate}`;
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
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>{title}</h1>

      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {loading ? <p>Loading itinerary...</p> : null}

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
        </div>
      ) : null}

      <div
        style={{
          border: "1px solid #ccc",
          padding: 16,
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <p style={{ marginTop: 0 }}>
          Scheduled items are automatically sorted chronologically.
        </p>
        <p style={{ marginBottom: 0 }}>
          Activities with a saved date or time cannot be manually moved. Clear or change the schedule first if you want to reposition them manually.
        </p>
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={loadItinerary}>
          Refresh Itinerary
        </button>

        <button type="button" onClick={exportItinerary}>
          Export Itinerary
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(`/vote/${code}?userId=${userId}&host=${queryHost || localStorage.getItem("host") || "0"}`)
          }
        >
          Back to Voting / Result
        </button>
      </div>

      {pendingRequest ? (
        <div style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Pending Change Request</h2>
          <p>
            <strong>Type:</strong> {pendingRequest.type}
          </p>
          {pendingRequest.moveDirection ? (
            <p>
              <strong>Direction:</strong> {pendingRequest.moveDirection}
            </p>
          ) : null}
          <p>
            <strong>Approvals:</strong> {pendingRequest.approvalCount} / {pendingRequest.totalUsers}
          </p>

          {!currentUserHasApproved ? (
            <button type="button" onClick={approveRequest} disabled={acting}>
              {acting ? "Submitting..." : "Approve Request"}
            </button>
          ) : (
            <p>You have already approved this request.</p>
          )}
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <p>No itinerary items have been saved yet.</p>
      ) : (
        <div>
          {items.map((item) => {
            const isEditing = editingItemId === item.itineraryItemId;
            const isScheduled = Boolean(item.scheduledDate || item.scheduledTime);

            return (
              <div
                key={item.itineraryItemId}
                style={{
                  border: "1px solid #ccc",
                  padding: 16,
                  marginBottom: 16,
                  borderRadius: 8,
                }}
              >
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>
                    {item.orderIndex}. {item.title}
                  </strong>
                </p>

                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Type:</strong> {item.type}
                </p>

                {item.subtitle ? <p style={{ margin: "0 0 8px 0" }}>{item.subtitle}</p> : null}

                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Schedule:</strong> {renderSchedule(item)}
                </p>

                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Rating:</strong>{" "}
                  {item.rating !== null && typeof item.rating !== "undefined" ? item.rating : "Unavailable"}
                </p>

                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Price:</strong> {renderPrice(item)}
                </p>

                {item.tags?.length ? (
                  <p style={{ margin: "0 0 8px 0" }}>
                    <strong>Tags:</strong> {item.tags.join(", ")}
                  </p>
                ) : null}

                {item.link ? (
                  <p style={{ margin: "0 0 12px 0" }}>
                    <a href={item.link} target="_blank" rel="noreferrer">
                      View source
                    </a>
                  </p>
                ) : null}

                {isEditing ? (
                  <div
                    style={{
                      border: "1px solid #ddd",
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <label>Date</label>
                      <br />
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                      />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label>Time</label>
                      <br />
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => saveSchedule(item.itineraryItemId)} disabled={acting}>
                        {acting ? "Saving..." : "Save Date/Time"}
                      </button>

                      <button type="button" onClick={() => clearSchedule(item.itineraryItemId)} disabled={acting}>
                        Clear Schedule
                      </button>

                      <button type="button" onClick={cancelEditSchedule} disabled={acting}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {!pendingRequest ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => beginEditSchedule(item)} disabled={acting}>
                      {isScheduled ? "Edit Date/Time" : "Add Date/Time"}
                    </button>

                    <button type="button" onClick={() => requestRemove(item.itineraryItemId)} disabled={acting}>
                      Request Remove
                    </button>

                    {item.type === "ACTIVITIES" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => requestMove(item.itineraryItemId, "UP")}
                          disabled={acting || isScheduled}
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          onClick={() => requestMove(item.itineraryItemId, "DOWN")}
                          disabled={acting || isScheduled}
                        >
                          Move Down
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p>A pending request must be resolved before another change can be made.</p>
                )}

                {item.type === "ACTIVITIES" && isScheduled ? (
                  <p style={{ marginTop: 12, marginBottom: 0 }}>
                    This activity is scheduled, so it is auto-sorted chronologically.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ marginTop: 24 }}>Current user ID: {userId || "Not set"}</p>
    </div>
  );
}