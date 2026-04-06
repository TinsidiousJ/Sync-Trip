import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import Landing from "./pages/Landing.jsx";
import CreateSession from "./pages/CreateSession.jsx";
import JoinSession from "./pages/JoinSession.jsx";
import Lobby from "./pages/Lobby.jsx";
import Search from "./pages/Search.jsx";
import Voting from "./pages/Voting.jsx";
import Itinerary from "./pages/Itinerary.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/create" element={<CreateSession />} />
        <Route path="/join" element={<JoinSession />} />
        <Route path="/lobby/:code" element={<Lobby />} />
        <Route path="/search/:code" element={<Search />} />
        <Route path="/vote/:code" element={<Voting />} />
        <Route path="/itinerary/:code" element={<Itinerary />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);