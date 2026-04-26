import React from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout.jsx";

// first screen for starting or joining a trip
export default function Landing() {
  return (
    <PageLayout
      pageTitle="Plan trips together, clearly and collaboratively"
      pageSubtitle="Create a session, invite your group, compare options anonymously, and build a final itinerary together."
    >
      <div className="grid grid--2">
        <section className="card">
          <h2 className="card__title">How Sync-Trip works</h2>

          <div className="section-stack">
            <div className="card card--muted">
              <div className="badge-row">
                <span className="badge badge--primary">1. Create or join</span>
              </div>
              <p className="inline-note">
                Start a trip session and bring everyone into the same planning space.
              </p>
            </div>

            <div className="card card--muted">
              <div className="badge-row">
                <span className="badge badge--primary">2. Filter and search</span>
              </div>
              <p className="inline-note">
                Each user sets preferences, explores options, and submits one choice to the pool.
              </p>
            </div>

            <div className="card card--muted">
              <div className="badge-row">
                <span className="badge badge--primary">3. Vote anonymously</span>
              </div>
              <p className="inline-note">
                The group evaluates anonymous candidates and the winning option is saved to the itinerary.
              </p>
            </div>

            <div className="card card--muted">
              <div className="badge-row">
                <span className="badge badge--primary">4. Refine the itinerary</span>
              </div>
              <p className="inline-note">
                Add dates and times, reorder activities, and collaboratively adjust the plan.
              </p>
            </div>
          </div>
        </section>

        <aside className="card">
          <h2 className="card__title">Start now</h2>
          <p className="inline-note">
            Choose whether to host a new planning session or join an existing one.
          </p>

          <div className="button-row" style={{ marginTop: 20 }}>
            <Link to="/create">
              <button type="button" className="button button--primary">
                Create Session
              </button>
            </Link>

            <Link to="/join">
              <button type="button" className="button button--secondary">
                Join Session
              </button>
            </Link>
          </div>
        </aside>
      </div>
    </PageLayout>
  );
}
