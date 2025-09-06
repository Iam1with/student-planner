// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import "./App.css";

// Import your real pages from /pages
import Homepage from "./pages/Homepage";
import Explainer from "./pages/Explainer";
import HomeworkTracker from "./pages/HomeworkTracker";
import TimetableGenerator from "./pages/TimetableGenerator";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/explainer" element={<Explainer />} />
          <Route path="/homework" element={<HomeworkTracker />} />
          <Route path="/timetable" element={<TimetableGenerator />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
