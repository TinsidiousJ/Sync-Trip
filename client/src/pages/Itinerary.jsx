import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

const API_BASE = "http://localhost:4000";

export default function Itinerary() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();

  const queryUserId = searchParams.get("userId") || "";
  const userId = useMemo(() => queryUserId || localStorage.getItem("userId") || "", [queryUserId]);

  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

      setSession(data.session || null);
      setItems(data.items || []);
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

  function exportItinerary() {
    window.open(`${API_BASE}/sessions/${code}/itinerary/export`, "_blank");
  }

  useEffect(() => {
    if (!code) return;

    localStorage.setItem("sessionCode", code);
    if (queryUserId) localStorage.setItem("userId", queryUserId);

    loadItinerary();
  }, [code, queryUserId]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Itinerary</h1>

      {error ? <p>{error}</p> : null}
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

      <div style={{ marginBottom: 20 }}>
        <button type="button" onClick={loadItinerary} style={{ marginRight: 12 }}>
          Refresh Itinerary
        </button>

        <button type="button" onClick={exportItinerary}>
          Export Itinerary
        </button>
      </div>

      {items.length === 0 && !loading ? (
        <p>No itinerary items have been saved yet.</p>
      ) : (
        <div>
          {items.map((item) => (
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
            </div>
          ))}
        </div>
      )}

      <p style={{ marginTop: 24 }}>Current user ID: {userId || "Not set"}</p>
    </div>
  );
}