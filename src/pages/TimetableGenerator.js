// src/pages/TimetableGenerator.js
import React, { useState, useEffect, useRef } from "react";
import "../App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// Weekdays (user-visible). Keep keys consistent with your HomeworkTracker date logic if needed.
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Time blocks (24-hour hours). Each block represents start of 1 hour (you can change to 30m later).
const timeBlocks = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0") + ":00"
);

// Helpers
const uid = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const toDateOnly = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};
const isExamText = (text = "") =>
  /exam|test|final|midterm|board/i.test(String(text || ""));
const parseTimeToHour = (timeStr) => {
  // "17:00" -> 17
  const parts = String(timeStr || "00:00").split(":");
  return parseInt(parts[0], 10) || 0;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem("timetableTasks")) || {});
  const [newTaskText, setNewTaskText] = useState("");
  const [selectedDay, setSelectedDay] = useState(weekdays[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]); // today
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

  // Persist tasks and settings
  useEffect(() => {
    localStorage.setItem("timetableTasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("schoolStart", schoolStart);
    localStorage.setItem("schoolEnd", schoolEnd);
    localStorage.setItem("studyStart", studyStart);
    localStorage.setItem("studyEnd", studyEnd);
  }, [schoolStart, schoolEnd, studyStart, studyEnd]);

  useEffect(() => {
    localStorage.setItem("fixedScheduleBlocks", JSON.stringify(fixedSchedule));
  }, [fixedSchedule]);

  // Notifications permission + sound setup
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // create small beep sound
    const audio = new Audio();
    // small data URI beep — simple tone
    audio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    soundRef.current = audio;
  }, []);

  // Scroll to current hour on mount and set red line
  useEffect(() => {
    scrollToHour(new Date().getHours());
    const interval = setInterval(() => {
      updateNowLine();
    }, 60 * 1000); // update every minute
    updateNowLine();
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers: convert weekday to index and vice versa
  const weekdayIndex = (day) => weekdays.indexOf(day);
  const indexToWeekday = (i) => weekdays[i % 7];

  // Add task (manual from left/top bar)
  const addTask = () => {
    if (!newTaskText.trim()) return;
    const id = uid();
    const newEntry = {
      id,
      content: newTaskText.trim(),
      time: selectedTime,
      duration: parseInt(durationMinutes, 10) || 60,
      done: false,
      origin: null, // will hold homeworkEventId if created from TrackorA
      priority: "normal",
    };
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push(newEntry);
    setTasks(updated);
    setNewTaskText("");
  };

  // Toggle done
  const toggleDone = (day, index) => {
    const updated = JSON.parse(JSON.stringify(tasks));
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
  };

  // Delete task, also sync deletion with homeworkEvents if origin present
  const deleteTask = (day, index) => {
    const updated = JSON.parse(JSON.stringify(tasks));
    const removed = updated[day].splice(index, 1)[0];
    setTasks(updated);

    if (removed && removed.origin) {
      // remove matching entry from homeworkEvents
      const hw = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
      const filtered = hw.filter((h) => h.id !== removed.origin);
      localStorage.setItem("homeworkEvents", JSON.stringify(filtered));
    }
  };

  // Right-click edit
  const onTaskContext = (e, day, index) => {
    e.preventDefault();
    const t = tasks[day][index];
    const newTime = prompt("Set new start time (HH:MM)", t.time);
    if (newTime) {
      const newDur = prompt("Duration in minutes (e.g. 60)", String(t.duration || 60));
      const updated = JSON.parse(JSON.stringify(tasks));
      updated[day][index].time = newTime;
      updated[day][index].duration = parseInt(newDur, 10) || 60;
      setTasks(updated);
    } else {
      // allow quick delete
      if (window.confirm("Delete this task?")) deleteTask(day, index);
    }
  };

  // Convert hour string "17:00" to pixel position inside column — used by scrolling & line
  // For simplicity, we assume each hour row has fixed height in CSS (e.g., 64px). We'll pick 64 here.
  const HOUR_HEIGHT = 64; // adjust in CSS to match
  const updateNowLine = () => {
    if (!nowLineRef.current || !containerRef.current) return;
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const top = hour * HOUR_HEIGHT + (minutes / 60) * HOUR_HEIGHT;
    nowLineRef.current.style.top = `${top}px`;
  };

  const scrollToHour = (hour) => {
    if (!containerRef.current) return;
    const top = hour * HOUR_HEIGHT - 2 * HOUR_HEIGHT;
    containerRef.current.scrollTo({ top: clamp(top, 0, 99999), behavior: "smooth" });
  };

  // Drag and drop logic
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const srcDay = source.droppableId;
    const dstDay = destination.droppableId;
    const srcIdx = source.index;
    const dstIdx = destination.index;

    const updated = JSON.parse(JSON.stringify(tasks));
    const sourceList = updated[srcDay] || [];
    const [moved] = sourceList.splice(srcIdx, 1);
    // compute new time based on position: place at destination's index start time if available,
    // else keep moved.time
    const dstList = updated[dstDay] || [];
    // find time slot: if inserting between tasks, keep moved.time; else if dropping to empty position, keep selectedTime
    // We'll set moved.time to the topmost available hour at insertion index. Simplify: if dstList[dstIdx] exists, use that time; else set to studyStart
    const destTime = (dstList[dstIdx] && dstList[dstIdx].time) || studyStart;
    moved.time = destTime;
    dstList.splice(dstIdx, 0, moved);

    updated[srcDay] = sourceList;
    updated[dstDay] = dstList;
    setTasks(updated);
  };

  // Auto-scheduler: schedules items from TrackorA's homeworkEvents into free slots
  // - respects fixedSchedule and school/study windows
  // - schedules exam-type items as 4-day study sessions before exam date
  const autoSchedule = () => {
    const hwList = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    const updated = JSON.parse(JSON.stringify(tasks));
    const used = new Set(); // "Day-HH:MM"

    // Helper to check if slot free and not blocked
    const slotFree = (day, time) => {
      if (fixedSchedule.includes(`${day}-${time}`)) return false;
      const dayList = updated[day] || [];
      return !dayList.some((t) => t.time === time);
    };

    // Determine study window hours as integers
    const studyStartH = parseInt(studyStart.split(":")[0], 10);
    const studyEndH = parseInt(studyEnd.split(":")[0], 10);

    // For exam scheduling: create 4 sessions distributed in 4 days before exam
    for (const hw of hwList) {
      // avoid scheduling duplicates: check if already scheduled (origin === hw.id) in tasks
      const already = Object.values(updated).flat().some((t) => t.origin === hw.id);
      if (already) continue;

      const isExam = hw.type === "Exam" || isExamText(hw.description || hw.subject || "");
      if (isExam && hw.date) {
        // schedule 4 sessions: on days examDate - 4 .. -1
        const examDate = new Date(hw.date);
        for (let d = 4; d >= 1; d--) {
          const dayDate = new Date(examDate);
          dayDate.setDate(examDate.getDate() - d);
          const weekdayName = weekdays[(dayDate.getDay() + 6) % 7]; // JS: 0 Sunday
          // find earliest free hour in study window
          let placed = false;
          for (let h = studyStartH; h <= studyEndH; h++) {
            const time = String(h).padStart(2, "0") + ":00";
            if (!slotFree(weekdayName, time)) continue;
            if (!updated[weekdayName]) updated[weekdayName] = [];
            updated[weekdayName].push({
              id: uid(),
              content: `📚 Study for ${hw.subject || hw.description || "Exam"}`,
              time,
              duration: 60,
              done: false,
              origin: hw.id,
              priority: "high",
            });
            used.add(`${weekdayName}-${time}`);
            placed = true;
            break;
          }
          if (!placed) {
            // try after studyEnd (as fallback) but avoid midnight
            for (let h = studyEndH + 1; h <= 22; h++) {
              const time = String(h).padStart(2, "0") + ":00";
              if (!slotFree(weekdayName, time)) continue;
              if (!updated[weekdayName]) updated[weekdayName] = [];
              updated[weekdayName].push({
                id: uid(),
                content: `📚 Study for ${hw.subject || hw.description || "Exam"}`,
                time,
                duration: 60,
                done: false,
                origin: hw.id,
                priority: "high",
              });
              used.add(`${weekdayName}-${time}`);
              break;
            }
          }
        }
      } else {
        // Normal homework: schedule in next free study slot (starting today)
        // We'll iterate next 14 days to find a slot
        const today = new Date();
        let scheduled = false;
        for (let offset = 0; offset < 14 && !scheduled; offset++) {
          const dt = new Date(today);
          dt.setDate(today.getDate() + offset);
          const dayName = weekdays[(dt.getDay() + 6) % 7];
          for (let h = studyStartH; h <= studyEndH; h++) {
            const time = String(h).padStart(2, "0") + ":00";
            if (!slotFree(dayName, time)) continue;
            if (!updated[dayName]) updated[dayName] = [];
            updated[dayName].push({
              id: uid(),
              content: `📘 ${hw.subject || "Homework"}: ${hw.description || ""}`,
              time,
              duration: 60,
              done: false,
              origin: hw.id,
              priority: "normal",
            });
            used.add(`${dayName}-${time}`);
            scheduled = true;
            break;
          }
          if (scheduled) break;
        }
        // if not scheduled within 14 days, skip
      }
    }

    setTasks(updated);
    // after scheduling, persist and maybe notify user
    localStorage.setItem("timetableTasks", JSON.stringify(updated));
    alert("Auto-schedule complete (scheduled items from TrackorA into free study blocks).");
  };

  const toggleFixedBlock = (day, time) => {
    const key = `${day}-${time}`;
    const updated = [...fixedSchedule];
    if (updated.includes(key)) {
      const idx = updated.indexOf(key);
      updated.splice(idx, 1);
    } else {
      updated.push(key);
    }
    setFixedSchedule(updated);
  };

  // Render helpers
  const renderTimeColumn = () => (
    <div className="time-column">
      {timeBlocks.map((t) => (
        <div key={t} className="time-row" style={{ height: HOUR_HEIGHT }}>
          <div className="time-label">{t}</div>
        </div>
      ))}
    </div>
  );

  // Render the day columns
  const renderDays = () =>
    weekdays.map((day) => {
      const dayTasks = (tasks[day] || []).slice().sort((a, b) => parseTimeToHour(a.time) - parseTimeToHour(b.time));
      return (
        <Droppable key={day} droppableId={day}>
          {(provided) => (
            <div className="day-column" ref={provided.innerRef} {...provided.droppableProps}>
              <div className="day-header">{day}</div>
              <div className="day-body">
                {/* placeholder empty hour rows */}
                <div style={{ position: "relative", minHeight: `${HOUR_HEIGHT * timeBlocks.length}px` }}>
                  {/* fixed schedule shading */}
                  {timeBlocks.map((tb, idx) => {
                    const blockKey = `${day}-${tb}`;
                    const blocked = fixedSchedule.includes(blockKey);
                    return (
                      <div
                        key={blockKey}
                        className={`hour-slot ${blocked ? "fixed-block" : ""}`}
                        style={{
                          height: HOUR_HEIGHT,
                        }}
                        onClick={() => {
                          /* small toggle for fixed schedule if user holds Alt (prevent accidental) */
                        }}
                      />
                    );
                  })}

                  {/* tasks positioned absolutely by hour */}
                  {dayTasks.map((task, index) => {
                    const top = parseTimeToHour(task.time) * HOUR_HEIGHT;
                    const height = ((task.duration || 60) / 60) * HOUR_HEIGHT;
                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
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
                              top,
                              height,
                              zIndex: 10,
                              padding: "8px",
                              boxSizing: "border-box",
                              borderLeft: task.priority === "high" ? "4px solid #e74c3c" : "4px solid #6c8cff",
                              background: task.done ? "#d1ffd1" : "#fffbe6",
                              ...draggableProvided.draggableProps.style,
                            }}
                            onContextMenu={(e) => onTaskContext(e, day, index)}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{task.content}</div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <div style={{ fontSize: "0.85rem", color: "#666" }}>{task.time}</div>
                                <button className="icon-btn" onClick={() => toggleDone(day, index)} title="Mark done">
                                  ✅
                                </button>
                                <button className="icon-btn" onClick={() => deleteTask(day, index)} title="Delete">
                                  🗑️
                                </button>
                              </div>
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "#666", marginTop: 6 }}>
                              {task.duration} min
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}

                  {provided.placeholder}
                </div>
              </div>
            </div>
          )}
        </Droppable>
      );
    });

  // scroll to current time button
  const handleScrollToNow = () => {
    const h = new Date().getHours();
    scrollToHour(h);
  };

  // simple notification: when a task's time is now or in next minute — this runs when auto-schedule calls or tasks change
  useEffect(() => {
    // set reminders for tasks in the future (simple: tasks in the next minute)
    const checkSoon = () => {
      const now = new Date();
      const nowH = now.getHours();
      const nowM = now.getMinutes();
      for (const day of weekdays) {
        const list = tasks[day] || [];
        for (const t of list) {
          const taskHour = parseTimeToHour(t.time);
          if (taskHour === nowH && nowM === 0) {
            // notify at exact hour (simple heuristic)
            if (Notification.permission === "granted") {
              new Notification("SchedulorA — Task starting now", {
                body: t.content,
              });
            }
            if (soundRef.current) soundRef.current.play().catch(() => {});
          }
        }
      }
    };
    const id = setInterval(checkSoon, 60 * 1000);
    // run once
    checkSoon();
    return () => clearInterval(id);
  }, [tasks]);

  // UI: small topbar for fixed schedule inputs and control buttons
  return (
    <div className="schedulora-root">
      <div className="schedulora-topbar">
        <div className="brand">
          <h2>SchedulorA — Timetable Generator</h2>
        </div>

        <div className="controls">
          <input type="date" value={new Date().toISOString().slice(0, 10)} readOnly style={{ display: "none" }} />
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {timeBlocks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input placeholder="Add task (also saved to TrackorA)" value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} />
          <input type="number" min="15" step="15" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} style={{ width: 110 }} />
          <button onClick={addTask} className="primary-btn">➕ Add</button>
          <button onClick={autoSchedule} className="primary-btn outline">🤖 Auto-schedule</button>
          <button onClick={handleScrollToNow} className="primary-btn">⏱ Now</button>
        </div>
      </div>

      <div className="schedulora-settings">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label>School start</label>
          <input value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} style={{ width: 100 }} />
          <label>School end</label>
          <input value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} style={{ width: 100 }} />
          <label>Study start</label>
          <input value={studyStart} onChange={(e) => setStudyStart(e.target.value)} style={{ width: 100 }} />
          <label>Study end</label>
          <input value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} style={{ width: 100 }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <small>Click a small hour inside a day column (Alt+Click) to toggle fixed block — small top bar keeps this control minimal.</small>
        </div>
      </div>

      <div className="schedulora-grid-wrap" ref={containerRef} style={{ position: "relative", overflowY: "auto", height: "64vh", padding: "12px" }}>
        {/* left times */}
        <div style={{ display: "flex", gap: 12 }}>
          {renderTimeColumn()}
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="days-grid" style={{ display: "flex", gap: 12, flex: 1 }}>
              {renderDays()}
            </div>
          </DragDropContext>
        </div>

        {/* Now line */}
        <div ref={nowLineRef} className="now-line" style={{
          position: "absolute",
          left: 110, // approximate; adjust if time column width changes
          right: 12,
          height: 2,
          background: "red",
          zIndex: 50,
          top: 0
        }} />
      </div>
    </div>
  );
};

export default TimetableGenerator;
