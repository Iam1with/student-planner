// src/pages/TimetableGenerator.js
import React, { useState, useEffect, useRef } from "react";
import "../App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// Weekdays
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Time blocks (hours)
const timeBlocks = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + ":00");

// Helpers
const uid = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const parseTimeToHour = (timeStr) => parseInt(String(timeStr || "00:00").split(":")[0], 10) || 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem("timetableTasks")) || {});
  const [newTaskText, setNewTaskText] = useState("");
  const [selectedDay, setSelectedDay] = useState(
    weekdays[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]
  );
  const [selectedTime, setSelectedTime] = useState(() => {
    const h = new Date().getHours();
    return String(h).padStart(2, "0") + ":00";
  });
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [schoolStart, setSchoolStart] = useState(() => localStorage.getItem("schoolStart") || "07:30");
  const [schoolEnd, setSchoolEnd] = useState(() => localStorage.getItem("schoolEnd") || "15:15");
  const [studyStart, setStudyStart] = useState(() => localStorage.getItem("studyStart") || "16:00");
  const [studyEnd, setStudyEnd] = useState(() => localStorage.getItem("studyEnd") || "21:00");
  const [fixedSchedule, setFixedSchedule] = useState(() => JSON.parse(localStorage.getItem("fixedScheduleBlocks")) || []);
  const containerRef = useRef(null);
  const nowLineRef = useRef(null);
  const soundRef = useRef(null);

  const HOUR_HEIGHT = 64;

  // Persist tasks/settings
  useEffect(() => { localStorage.setItem("timetableTasks", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => {
    localStorage.setItem("schoolStart", schoolStart);
    localStorage.setItem("schoolEnd", schoolEnd);
    localStorage.setItem("studyStart", studyStart);
    localStorage.setItem("studyEnd", studyEnd);
  }, [schoolStart, schoolEnd, studyStart, studyEnd]);
  useEffect(() => { localStorage.setItem("fixedScheduleBlocks", JSON.stringify(fixedSchedule)); }, [fixedSchedule]);

  // Notification sound
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const audio = new Audio();
    audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    soundRef.current = audio;
  }, []);

  // Scroll to current hour & now line
  useEffect(() => {
    scrollToHour(new Date().getHours());
    const interval = setInterval(updateNowLine, 60 * 1000);
    updateNowLine();
    return () => clearInterval(interval);
  }, []);

  const updateNowLine = () => {
    if (!nowLineRef.current || !containerRef.current) return;
    const now = new Date();
    const top = now.getHours() * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
    nowLineRef.current.style.top = `${top}px`;
  };

  const scrollToHour = (hour) => {
    if (!containerRef.current) return;
    const top = hour * HOUR_HEIGHT - 2 * HOUR_HEIGHT;
    containerRef.current.scrollTo({ top: clamp(top, 0, 99999), behavior: "smooth" });
  };

  // Add task
  const addTask = () => {
    if (!newTaskText.trim()) return;
    const id = uid();
    const newEntry = {
      id,
      content: newTaskText.trim(),
      time: selectedTime,
      duration: parseInt(durationMinutes, 10) || 60,
      done: false,
      origin: null,
      priority: "normal",
    };
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push(newEntry);
    setTasks(updated);
    setNewTaskText("");
  };

  const toggleDone = (day, index) => {
    const updated = JSON.parse(JSON.stringify(tasks));
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
  };

  const deleteTask = (day, index) => {
    const updated = JSON.parse(JSON.stringify(tasks));
    const removed = updated[day].splice(index, 1)[0];
    setTasks(updated);
    if (removed?.origin) {
      const hw = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
      localStorage.setItem("homeworkEvents", JSON.stringify(hw.filter((h) => h.id !== removed.origin)));
    }
  };

  const toggleFixedBlock = (day, time) => {
    const key = `${day}-${time}`;
    const updated = [...fixedSchedule];
    if (updated.includes(key)) updated.splice(updated.indexOf(key), 1);
    else updated.push(key);
    setFixedSchedule(updated);
  };

  // --- DRAG AND DROP ---
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const moved = (() => {
      const srcList = tasks[source.droppableId] || [];
      const [t] = srcList.splice(source.index, 1);
      return t;
    })();

    // Destination hour/droppableId = "Monday-14:00"
    const [dstDay, dstHour] = destination.droppableId.split("-");
    moved.time = dstHour;

    // Insert
    const updated = { ...tasks };
    if (!updated[dstDay]) updated[dstDay] = [];
    updated[dstDay].splice(destination.index, 0, moved);

    setTasks(updated);
  };

  // Render time column
  const renderTimeColumn = () => (
    <div className="time-column">
      {timeBlocks.map((t) => (
        <div key={t} className="time-row" style={{ height: HOUR_HEIGHT }}>
          <div className="time-label">{t}</div>
        </div>
      ))}
    </div>
  );

  // Render days with hourly droppables
  const renderDays = () =>
    weekdays.map((day) => (
      <div key={day} className="day-column">
        <div className="day-header">{day}</div>
        <div className="day-body">
          <DragDropContext onDragEnd={onDragEnd}>
            <div style={{ position: "relative" }}>
              {timeBlocks.map((hour) => {
                const droppableId = `${day}-${hour}`;
                const dayTasks = (tasks[day] || []).filter((t) => t.time === hour);
                const blocked = fixedSchedule.includes(droppableId);

                return (
                  <Droppable key={droppableId} droppableId={droppableId}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`hour-slot ${blocked ? "fixed-block" : ""}`}
                        style={{ height: HOUR_HEIGHT, position: "relative" }}
                        onClick={(e) => e.altKey && toggleFixedBlock(day, hour)}
                      >
                        {dayTasks.map((task, idx) => (
                          <Draggable key={task.id} draggableId={task.id} index={idx}>
                            {(draggableProvided) => (
                              <div
                                ref={draggableProvided.innerRef}
                                {...draggableProvided.draggableProps}
                                {...draggableProvided.dragHandleProps}
                                className={`task-card ${task.done ? "done" : ""}`}
                                style={{
                                  position: "absolute",
                                  left: 8,
                                  right: 8,
                                  height: ((task.duration || 60) / 60) * HOUR_HEIGHT,
                                  padding: 8,
                                  boxSizing: "border-box",
                                  borderLeft: task.priority === "high" ? "4px solid #e74c3c" : "4px solid #6c8cff",
                                  background: task.done ? "#d1ffd1" : "#fffbe6",
                                  ...draggableProvided.draggableProps.style,
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  if (window.confirm("Delete this task?")) deleteTask(day, idx);
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{task.content}</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>{task.duration} min</div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </DragDropContext>
        </div>
      </div>)
    );

  const handleScrollToNow = () => scrollToHour(new Date().getHours());

  return (
    <div className="schedulora-root">
      <div className="schedulora-topbar">
        <h2>SchedulorA — Timetable Generator</h2>
        <div className="controls">
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {timeBlocks.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Add task" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} />
          <input type="number" min="15" step="15" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} style={{ width: 110 }} />
          <button onClick={addTask}>➕ Add</button>
          <button onClick={handleScrollToNow}>⏱ Now</button>
        </div>
      </div>

      <div className="schedulora-grid-wrap" ref={containerRef} style={{ overflowY: "auto", height: "64vh", display: "flex" }}>
        {renderTimeColumn()}
        <div style={{ display: "flex", gap: 12 }}>{renderDays()}</div>

        {/* Now line */}
        <div ref={nowLineRef} style={{ position: "absolute", left: 110, right: 12, height: 2, background: "red", zIndex: 50 }} />
      </div>
    </div>
  );
};

export default TimetableGenerator;
