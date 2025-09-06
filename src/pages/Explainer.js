import React from "react";

const Explainer = () => {
  return (
    <div className="explainer-container">
      <h1>Ask Me Anything! 🌍📚</h1>
      <p>This smart AI chatbot can explain any topic — whether it's science, history, technology, grammar, or literally anything you're curious about. Just ask your question below!</p>

      <div className="chat-wrapper">
        <iframe
          title="Explainer AI"
          src="https://landbot.online/v3/H-3055768-GUQF2LWXNXCLJSKH/index.html"
          className="chat-frame"
          allow="camera; microphone"
        />
      </div>
    </div>
  );
};

export default Explainer;
