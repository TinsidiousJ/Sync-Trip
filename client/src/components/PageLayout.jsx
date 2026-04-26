import React from "react";
import { Link, useLocation } from "react-router-dom";

// basic page layout
export default function PageLayout({ pageTitle, pageSubtitle, children, headerAction = null }) {
  const location = useLocation();

  const isCreatePage = location.pathname.startsWith("/create");
  const isJoinPage = location.pathname.startsWith("/join");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">
            Sync-Trip
          </Link>

          <nav className="topnav">
            <Link className={`topnav__link ${isCreatePage ? "topnav__link--active" : ""}`} to="/create">
              Create Session
            </Link>
            <Link className={`topnav__link ${isJoinPage ? "topnav__link--active" : ""}`} to="/join">
              Join Session
            </Link>
          </nav>
        </div>
      </header>

      <main className="page">
        <div className="page__header">
          <div>
            <h1 className="page__title">{pageTitle}</h1>
            {pageSubtitle ? <p className="page__subtitle">{pageSubtitle}</p> : null}
          </div>

          {headerAction ? <div className="page__header-action">{headerAction}</div> : null}
        </div>

        {children}
      </main>
    </div>
  );
}
