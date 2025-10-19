import React from 'react';
import '../App.css'; // Make sure styling is present

const Homepage = () => {
  return (
    <div className="homepage">
      {/* 🌟 Tagline Section */}
      <section className="hero">
        <h1>PlanorA</h1>
        <h2>Plan your A+ life with us.</h2>
        <p>
          Built for students who want to stay productive, balanced, and mentally strong.
          Whether it’s tracking homework or finding a moment to breathe, we’ve got your back.
        </p>
      </section>

      {/* 🧘 Wellness Section */}
      <section className="wellness">
        <h3>🧘‍♀️ Take a Pause. Care for Your Mind.</h3>
        <p>Your wellbeing matters. Use these simple tools to recharge.</p>

        <div className="wellness-tools">
          <div className="tool-card">
            <h4>🌿 5-Minute Breathing</h4>
            <iframe
              width="100%"
              height="560"
              src="https://www.youtube.com/embed/40tPuU6jrgQ?si=YrStnXa2HlG__sRg"
              title="Guided Breathing"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture;"
              referrerpolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
             
          </div>

          <div className="tool-card">
            <h4>✅ Burnout Check</h4>
            <ul>
              <li>Feeling constantly tired or anxious?</li>
              <li>Losing motivation to study?</li>
              <li>Headaches or lack of focus?</li>
              <li>Neglecting things you enjoy?</li>
            </ul>
            <p>If yes to 2 or more — take a 10-minute reset. You deserve it. 💛</p>
          </div>

          <div className="tool-card">
            <h4>🎧 Study Calm Playlist</h4>
            <a
              href="https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ"
              target="_blank"
              rel="noreferrer"
            >
              Open Calming Focus Playlist on Spotify
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Homepage;
