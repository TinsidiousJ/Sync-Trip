import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:4000";

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

export default function ItineraryPopup({ isOpen, sessionCode, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [itinerary, setItinerary] = useState(null);
  const [error, setError] = useState("");

  const userId = localStorage.getItem("userId") || "";
  const host = localStorage.getItem("host") || "0";

  async function loadItinerary() {
    if (!sessionCode) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_BASE}/sessions/${sessionCode}/itinerary`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load itinerary");

      setItinerary(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openFullItineraryPage() {
    onClose?.();
    navigate(`/itinerary/${sessionCode}?userId=${userId}&host=${host}`);
  }

  useEffect(() => {
    if (isOpen) {
      loadItinerary();
    }
  }, [isOpen, sessionCode]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={{
          maxWidth: 900,
          width: "95%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="modal-card__title" style={{ marginBottom: 8 }}>
              {itinerary?.title || "Itinerary"}
            </h2>
            {itinerary?.session ? (
              <p className="modal-card__message" style={{ margin: 0 }}>
                {itinerary.session.sessionName} • {itinerary.session.destination}
              </p>
            ) : null}
          </div>

          <div className="button-row">
            <button type="button" className="button button--secondary" onClick={loadItinerary}>
              Refresh
            </button>
            <button type="button" className="button button--primary" onClick={openFullItineraryPage}>
              Open Full Itinerary
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="alert alert--warning" style={{ marginBottom: 16 }}>
          To add dates and times, request removals, or reorder activities, use <strong>Open Full Itinerary</strong>.
        </div>

        {loading ? <div className="alert">Loading itinerary...</div> : null}
        {error ? <div className="alert alert--error">{error}</div> : null}

        {!loading && !error ? (
          itinerary?.items?.length ? (
            <div className="option-grid">
              {itinerary.items.map((item) => (
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
                      <span className="badge">{renderSchedule(item)}</span>
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
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No itinerary items have been added yet.</div>
          )
        ) : null}
      </div>
    </div>
  );
}
