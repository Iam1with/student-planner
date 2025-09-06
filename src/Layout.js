// src/Layout.js
import React from "react";
import { Link } from "react-router-dom";
import "./App.css";

const Layout = ({ children }) => {
  return (
    <div>
      <div className="topbar">
        <Link to="/" className="logo">PlanorA</Link>
        <nav className="nav-links">
          <Link to="/explainer">ExplainorA</Link>
          <Link to="/homework">TrackorA</Link>
          <Link to="/timetable">SchedulorA</Link>
        </nav>
      </div>
      <div className="page-content">{children}</div>
    </div>
  );
};

export default Layout;
