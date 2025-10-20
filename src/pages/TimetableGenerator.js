import React, { useState, useEffect } from "react";
import "../App.css";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hours = Array.from({ length: 16 }, (_, i) => `${(6 + i).toString().padStart(2, "0")}:00`);

const SchedulorA = () => {
  const [schoolStart, setSchoolStart] = useState("07:30");
  const [schoolEnd, setSchoolEnd] = useState("15:15");
  const [studyStart, setStudyStart] = useState("16:00");
  const [studyEnd, setStudyEnd] = useState("21:00");
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem("timetableTasks")) || {});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTask, setNewTask] = useState("");

  // 🔄 Load on mount
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("timetableTasks")) || {};
    setTasks(stored);
  }, []);

  // 💾 Auto-save
  useEffect(() => {
    localStorage.setItem("timetableTasks", JSON.stringify(tasks));
  }, [tasks]);

  // 📚 Add task manually
  const addTask = () => {
    if (!newTask.trim()) return;
    const dateKey = selectedDate;
    const updated = { ...tasks };
    if (!updated[dateKey]) updated[dateKey] = [];
    updated[dateKey].push({
      id: Date.now(),
      content: newTask,
      time: studyStart,
      priority: "normal",
      done: false,
    });
    setTasks(updated);
    setNewTask("");
  };

  // ✅ Toggle completion
  const toggleDone = (date, id) => {
    const updated = { ...tasks };
    updated[date] = updated[date].map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setTasks(updated);
  };

  // ❌ Delete task (syncs with TrackorA)
  const deleteTask = (date, id) => {
    const updated = { ...tasks };
    updated[date] = updated[date].filter((t) => t.id !== id);
    setTasks(updated);

    // Sync delete with TrackorA
    const allHW = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    const filtered = allHW.filter((h) => h.id !== id);
    localStorage.setItem("homeworkEvents", JSON.stringify(filtered));
  };

  // ⚡ Right-click to edit time/priority
  const handleRightClick = (e, date, task) => {
    e.preventDefault();
    const newTime = prompt("Enter new time (HH:MM)", task.time) || task.time;
    const newPriority = prompt("Enter priority (low / normal / high)", task.priority) || task.priority;
    const updated = { ...tasks };
    updated[date] = updated[date].map((t) =>
      t.id === task.id ? { ...t, time: newTime, priority: newPriority } : t
    );
    setTasks(updated);
  };

  // 🔔 Browser notification
  const notify = (task) => {
    if (Notification.permission === "granted") {
      new Notification("PlanorA Reminder", {
        body: `Upcoming: ${task.content} at ${task.time}`,
      });
    }
  };

  // 🤖 Auto-schedule from TrackorA
  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    const updated = { ...tasks };

    const schoolStartTime = parseInt(schoolStart.split(":")[0]);
    const schoolEndTime = parseInt(schoolEnd.split(":")[0]);
    const studyStartTime = parseInt(studyStart.split(":")[0]);
    const studyEndTime = parseInt(studyEnd.split(":")[0]);

    homeworkList.forEach((hw) => {
      const hwDate = new Date(hw.date);
      const hwKey = hwDate.toISOString().split("T")[0];

      if (hw.type === "Exam") {
        // 4-day exam prep
        for (let i = 4; i >= 1; i--) {
          const studyDate = new Date(hwDate);
          studyDate.setDate(hwDate.getDate() - i);
          const studyKey = studyDate.toISOString().split("T")[0];
          if (!updated[studyKey]) updated[studyKey] = [];

          updated[studyKey].push({
            id: `${hw.id}-prep-${i}`,
            content: `📚 Study for ${hw.subject}`,
            time: `${studyStartTime + 1}:00`,
            priority: "high",
            done: false,
          });
        }
      } else {
        // Normal homework scheduling
        if (!updated[hwKey]) updated[hwKey] = [];
        updated[hwKey].push({
          id: hw.id,
          content: `📘 ${hw.subject}: ${hw.description}`,
          time: `${studyStartTime}:00`,
          priority: "normal",
          done: false,
        });
      }
    });

    setTasks(updated);
    alert("✅ Auto-scheduling complete!");
  };

  return (
    <div className="timetable-container">
      <h2>SchedulorA — Timetable Generator</h2>
      <div className="controls">
        <label>School start:</label>
        <input type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} />
        <label>School end:</label>
        <input type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} />
        <label>Study start:</label>
        <input type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
        <label>Study end:</label>
        <input type="time" value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} />

        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        <input
          type="text"
          placeholder="Add task"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
        />
        <button onClick={addTask}>➕ Add</button>
        <button onClick={autoScheduleHomework}>🤖 Auto-schedule</button>
      </div>

      {Object.keys(tasks).length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        Object.keys(tasks).map((date) => (
          <div key={date} className="day-box">
            <h3>{date}</h3>
            {tasks[date]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((task) => (
                <div
                  key={task.id}
                  className={`task-item ${task.done ? "done" : ""} priority-${task.priority}`}
                  onContextMenu={(e) => handleRightClick(e, date, task)}
                >
                  <span onClick={() => toggleDone(date, task.id)}>
                    {task.time} — {task.content}
                  </span>
                  <button onClick={() => deleteTask(date, task.id)}>🗑️</button>
                </div>
              ))}
          </div>
        ))
      )}
    </div>
  );
};

export default SchedulorA;
