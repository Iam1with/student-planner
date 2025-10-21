// src/pages/TimetableGenerator.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "../App.css";

/**
 * TimetableGenerator (SchedulorA)
 * - 7 vertical day columns (Monday..Sunday)
 * - 24h time slots (30min)
 * - duration support
 * - auto-schedule from homeworkEvents (localStorage)
 * - exam prep: if "exam" in description, schedule study sessions starting 4 days before
 * - right-click edit (time/duration/delete)
 * - drag/drop tasks between days
 * - notification (browser) for tasks (simple)
 */

// constants
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// generate 30-min times from 00:00 to 23:30 as "HH:MM"
const generateTimeBlocks = () => {
  const blocks = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      blocks.push(`${hh}:${mm}`);
    }
  }
  return blocks;
};
const TIME_BLOCKS = generateTimeBlocks();
const DEFAULT_DURATION = 60; // minutes

// helpers
const timeToMinutes = (t) => {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
};
const minutesToTime = (mins) => {
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const overlaps = (aStart, aDur, bStart, bDur) => {
  return aStart < bStart + bDur && bStart < aStart + aDur;
};
const isExamHomework = (hw) =>
  hw.description && hw.description.toLowerCase().includes("exam");

// localStorage keys
const LS_TIMETABLE = "timetableTasks"; // saved tasks per day
const LS_HOMEWORK = "homeworkEvents"; // from TrackorA
const LS_SETTINGS = "schedSettings"; // school/study settings

export default function TimetableGenerator() {
  // tasks: { Monday: [{id, content, time, duration, done, origin, homeworkId}], ... }
  const [tasks, setTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_TIMETABLE)) || {};
    } catch {
      return {};
    }
  });

  // controls
  const [selectedDay, setSelectedDay] = useState(weekdays[0]);
  const [selectedTime, setSelectedTime] = useState("17:00");
  const [newTask, setNewTask] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_DURATION);
  const [notifyBefore, setNotifyBefore] = useState(10); // minutes before
  const notificationTimers = useRef([]);

  // settings: schoolStart/schoolEnd/studyStart/studyEnd (HH:MM)
  const [settings, setSettings] = useState(() => {
    const def = {
      schoolStart: "07:30",
      schoolEnd: "15:15",
      studyStart: "16:00",
      studyEnd: "21:00",
    };
    try {
      return JSON.parse(localStorage.getItem(LS_SETTINGS)) || def;
    } catch {
      return def;
    }
  });

  // small state for right-click edit
  const [contextTask, setContextTask] = useState(null); // {day,index}
  const [contextMenuPos, setContextMenuPos] = useState(null);

  // load homeworkEvents from TrackorA (localStorage) to display counts / used by auto-schedule
  const homeworkList = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_HOMEWORK)) || [];
    } catch {
      return [];
    }
  }, [/* no deps; reading directly when needed */]);

  // persist tasks
  useEffect(() => {
    localStorage.setItem(LS_TIMETABLE, JSON.stringify(tasks));
    // when tasks change, reschedule notifications (simple)
    scheduleNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, notifyBefore]);

  // persist settings
  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // request notification permission on first render
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // utility: place a task object at a day/time if free (checking duration)
  function canPlaceAt(day, startTime, duration) {
    const dayList = tasks[day] || [];
    const startMin = timeToMinutes(startTime);
    for (const t of dayList) {
      const tStart = timeToMinutes(t.time);
      if (overlaps(startMin, duration, tStart, t.duration || DEFAULT_DURATION)) {
        return false;
      }
    }
    // also check fixed schedule (school hours) from settings
    const schoolStart = timeToMinutes(settings.schoolStart);
    const schoolEnd = timeToMinutes(settings.schoolEnd);
    // if start is inside school hours, can't
    if (startMin < schoolEnd && startMin + duration > schoolStart) {
      // overlapping school time: block
      return false;
    }
    // Respect study hours: prefer placing inside study window; but allow outside if allowed? We'll require placement inside study window.
    const studyStart = timeToMinutes(settings.studyStart);
    const studyEnd = timeToMinutes(settings.studyEnd);
    if (startMin < studyStart || startMin + duration > studyEnd) {
      return false;
    }
    return true;
  }

  // add a manual task (also saved to tasks)
  const addTask = () => {
    if (!newTask.trim()) return;
    const id = `m-${Date.now()}`;
    const item = {
      id,
      content: newTask.trim(),
      time: selectedTime,
      duration: durationMinutes,
      done: false,
      origin: "manual",
    };
    setTasks((prev) => {
      const copy = { ...prev };
      if (!copy[selectedDay]) copy[selectedDay] = [];
      copy[selectedDay].push(item);
      // sort by time
      copy[selectedDay].sort(
        (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
      );
      return copy;
    });
    setNewTask("");
    scheduleNotifications(); // update timers
  };

  // toggle done
  const toggleDone = (day, index) => {
    setTasks((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy[day] || !copy[day][index]) return prev;
      copy[day][index].done = !copy[day][index].done;
      return copy;
    });
  };

  // delete task & sync homeworkEvents and TrackorA events if origin indicates homework
  const deleteTask = (day, index) => {
    setTasks((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const removed = (copy[day] || []).splice(index, 1)[0];
      // sync deletion to homeworkEvents if it has homeworkId
      try {
        if (removed && removed.homeworkId) {
          const hwAll = JSON.parse(localStorage.getItem(LS_HOMEWORK)) || [];
          const newHw = hwAll.filter((h) => h.id !== removed.homeworkId);
          localStorage.setItem(LS_HOMEWORK, JSON.stringify(newHw));
        }
      } catch {}
      // also try to remove from TrackorA's 'events' object if present (best-effort)
      try {
        const eventsObj = JSON.parse(localStorage.getItem("events") || "{}");
        // find event matching content & remove from that date
        if (removed && removed.origin === "homework" && removed.homeworkDate) {
          const dateKey = new Date(removed.homeworkDate).toDateString();
          if (eventsObj[dateKey]) {
            eventsObj[dateKey] = eventsObj[dateKey].filter(
              (e) =>
                !(e.subject === removed.subject && e.homework === removed.content)
            );
            localStorage.setItem("events", JSON.stringify(eventsObj));
          }
        }
      } catch {}
      scheduleNotifications();
      return copy;
    });
  };

  // AUTO-schedule function:
  // - Pulls homeworkEvents from localStorage
  // - For 'exam' items: schedule study sessions starting 4 days before
  // - For regular homework: try to place it on its due date in a free slot
  const autoScheduleHomework = () => {
    const hwList = JSON.parse(localStorage.getItem(LS_HOMEWORK) || "[]");
    if (!hwList || hwList.length === 0) {
      alert("No homeworkEvents found in localStorage (TrackorA).");
      return;
    }
    const updated = JSON.parse(JSON.stringify(tasks || {}));
    const used = new Set(); // day-time used in this run

    // helper to try placing an item on a specific date/day name
    const tryPlaceOnDate = (dateObj, content, duration, hwId, subject, originDate) => {
      const dayName = weekdays[(dateObj.getDay() + 6) % 7]; // convert JS Sun=0 to our Monday=0
      // attempt to find a time inside study window
      const studyStartMin = timeToMinutes(settings.studyStart);
      const studyEndMin = timeToMinutes(settings.studyEnd);
      for (let start = studyStartMin; start + duration <= studyEndMin; start += 30) {
        const startTime = minutesToTime(start);
        const slotKey = `${dayName}-${startTime}`;
        if (used.has(slotKey)) continue;
        // check conflicts
        if ((updated[dayName] || []).some((t) => overlaps(start, duration, timeToMinutes(t.time), t.duration || DEFAULT_DURATION))) {
          continue;
        }
        // place
        if (!updated[dayName]) updated[dayName] = [];
        updated[dayName].push({
          id: hwId ? `hw-${hwId}-${Date.now()}` : `a-${Date.now()}`,
          content,
          time: startTime,
          duration,
          done: false,
          origin: hwId ? "homework" : "auto",
          homeworkId: hwId || null,
          subject: subject || null,
          homeworkDate: originDate || null,
        });
        used.add(slotKey);
        return true;
      }
      return false;
    };

    // iterate homework list
    for (const hw of hwList) {
      const dateStr = hw.date; // homework has date field (due date) from TrackorA
      if (!dateStr) {
        // try schedule next available
        const today = new Date();
        tryPlaceOnDate(today, `📘 ${hw.subject}: ${hw.description}`, DEFAULT_DURATION, hw.id, hw.subject, dateStr);
        continue;
      }
      const due = new Date(dateStr);
      if (isExamHomework(hw)) {
        // schedule 1 study session per day for 4 days prior (or until can place)
        for (let d = 4; d >= 1; d--) {
          const dayDate = new Date(due);
          dayDate.setDate(due.getDate() - d);
          tryPlaceOnDate(dayDate, `🧪 Study: ${hw.subject}`, 60, hw.id, hw.subject, dateStr);
        }
      } else {
        // try place on the due date; if not, place earlier that week (backwards)
        let placed = false;
        for (let offset = 0; offset <= 6 && !placed; offset++) {
          const dayDate = new Date(due);
          dayDate.setDate(due.getDate() - offset);
          placed = tryPlaceOnDate(dayDate, `📘 ${hw.subject}: ${hw.description}`, DEFAULT_DURATION, hw.id, hw.subject, dateStr);
        }
        if (!placed) {
          // as fallback, place on next available day from today
          const today = new Date();
          for (let i = 0; i < 14 && !placed; i++) {
            const tryDate = new Date(today);
            tryDate.setDate(today.getDate() + i);
            placed = tryPlaceOnDate(tryDate, `📘 ${hw.subject}: ${hw.description}`, DEFAULT_DURATION, hw.id, hw.subject, dateStr);
          }
        }
      }
    }

    // sort tasks each day by time
    for (const d of Object.keys(updated)) {
      updated[d].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }
    setTasks(updated);
    // schedule notifications now
    scheduleNotifications();
  };

  // Drag & drop handlers
  const onDragEnd = (result) => {
    const { destination, source } = result;
    if (!destination) return;

    const sourceDay = source.droppableId;
    const destDay = destination.droppableId;
    const sourceIndex = source.index;
    const destIndex = destination.index;

    setTasks((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const sourceList = Array.from(copy[sourceDay] || []);
      const [moved] = sourceList.splice(sourceIndex, 1);
      if (!copy[destDay]) copy[destDay] = [];
      // preserve time/duration. When moving across days, keep same time. If overlapping, we keep and rely on user to adjust.
      copy[destDay].splice(destIndex, 0, moved);
      copy[sourceDay] = sourceList;
      // sort by time to keep ordering
      copy[destDay].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      if (sourceDay !== destDay) {
        copy[sourceDay].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      }
      return copy;
    });
  };

  // Right-click context menu (simple) — edit time/duration/delete
  const onTaskContext = (e, day, index) => {
    e.preventDefault();
    setContextTask({ day, index });
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeContext = () => {
    setContextTask(null);
    setContextMenuPos(null);
  };

  const applyContextEdit = () => {
    if (!contextTask) return;
    const newTime = prompt("Enter new start time (HH:MM)", tasks[contextTask.day][contextTask.index].time);
    if (!newTime) {
      closeContext();
      return;
    }
    const newDur = parseInt(prompt("Duration in minutes (e.g. 30, 45, 60)", String(tasks[contextTask.day][contextTask.index].duration || DEFAULT_DURATION)), 10);
    if (!newDur || isNaN(newDur)) {
      alert("Invalid duration.");
      closeContext();
      return;
    }
    setTasks((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const t = copy[contextTask.day][contextTask.index];
      t.time = newTime;
      t.duration = newDur;
      // attempt sort
      copy[contextTask.day].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      return copy;
    });
    closeContext();
  };

  // delete via context
  const applyContextDelete = () => {
    if (!contextTask) return;
    if (!window.confirm("Delete this task?")) {
      closeContext();
      return;
    }
    deleteTask(contextTask.day, contextTask.index);
    closeContext();
  };

  // Notifications: basic scheduling in-memory (non-persistent)
  function scheduleNotifications() {
    // clear old timers
    notificationTimers.current.forEach((t) => clearTimeout(t));
    notificationTimers.current = [];
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    // find upcoming tasks within next 24h
    const now = new Date();
    for (const day of weekdays) {
      const dayList = tasks[day] || [];
      for (const t of dayList) {
        // compute next date matching this weekday within next 7 days
        const nowDay = (now.getDay() + 6) % 7; // Monday=0
        const targetDayIndex = weekdays.indexOf(day);
        let daysUntil = (targetDayIndex - nowDay + 7) % 7;
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + daysUntil);
        // set time
        const [hh, mm] = t.time.split(":").map(Number);
        candidate.setHours(hh, mm, 0, 0);
        // skip past
        const notifyAt = new Date(candidate.getTime() - notifyBefore * 60000);
        const timeUntil = notifyAt.getTime() - Date.now();
        if (timeUntil > 0 && timeUntil < 7 * 24 * 3600 * 1000) {
          const timer = setTimeout(() => {
            try {
              new Notification(`Upcoming: ${t.content}`, {
                body: `Starts at ${t.time} (${t.duration || DEFAULT_DURATION}m)`,
              });
            } catch {}
          }, timeUntil);
          notificationTimers.current.push(timer);
        }
      }
    }
  }

  // UI: small helper to render time axis left (optional)
  const renderTimeAxis = () => {
    return (
      <div className="time-axis">
        {TIME_BLOCKS.map((tb) => (
          <div className="time-block" key={tb}>
            {tb}
          </div>
        ))}
      </div>
    );
  };

  // reset helpers
  const clearTimetable = () => {
    if (!window.confirm("Clear all timetable tasks?")) return;
    setTasks({});
  };

  // small convenience to import all homeworkEvents into timetable as tasks (without auto placement)
  const importAllHomeworkAsTasks = () => {
    const hw = JSON.parse(localStorage.getItem(LS_HOMEWORK) || "[]");
    const copy = JSON.parse(JSON.stringify(tasks || {}));
    for (const h of hw) {
      // place on its homework date if possible
      let dayName = "Monday";
      if (h.date) {
        const dt = new Date(h.date);
        dayName = weekdays[(dt.getDay() + 6) % 7];
      } else {
        // if no date, place today
        const dt = new Date();
        dayName = weekdays[(dt.getDay() + 6) % 7];
      }
      if (!copy[dayName]) copy[dayName] = [];
      // push at study start
      copy[dayName].push({
        id: `hw-${h.id}`,
        content: `📘 ${h.subject}: ${h.description}`,
        time: settings.studyStart,
        duration: DEFAULT_DURATION,
        done: false,
        origin: "homework",
        homeworkId: h.id,
        subject: h.subject,
        homeworkDate: h.date || null,
      });
    }
    // sort each day
    for (const d of Object.keys(copy)) {
      copy[d].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    }
    setTasks(copy);
  };

  // UI rendering
  return (
    <div className="schedulor-page" style={{ padding: 16 }}>
      <div className="topbar" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>SchedulorA — Timetable Generator</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {TIME_BLOCKS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input style={{ minWidth: 240 }} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add task (also saved to timetable only)" />
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
            {[30,45,60,90,120,180].map(d => <option key={d} value={d}>{d} min</option>)}
          </select>
          <button onClick={addTask}>➕ Add</button>
          <button onClick={autoScheduleHomework}>🤖 Auto-schedule</button>
          <button onClick={importAllHomeworkAsTasks}>⬇ Import HW</button>
          <button onClick={clearTimetable}>🧹 Clear</button>
        </div>
      </div>

      <div className="settings-row" style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div>
          <div><strong>School start</strong></div>
          <input value={settings.schoolStart} onChange={(e) => setSettings({...settings, schoolStart: e.target.value})}/>
        </div>
        <div>
          <div><strong>School end</strong></div>
          <input value={settings.schoolEnd} onChange={(e) => setSettings({...settings, schoolEnd: e.target.value})}/>
        </div>
        <div>
          <div><strong>Study start</strong></div>
          <input value={settings.studyStart} onChange={(e) => setSettings({...settings, studyStart: e.target.value})}/>
        </div>
        <div>
          <div><strong>Study end</strong></div>
          <input value={settings.studyEnd} onChange={(e) => setSettings({...settings, studyEnd: e.target.value})}/>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <div><strong>Notify (min before)</strong></div>
          <input type="number" value={notifyBefore} onChange={(e) => setNotifyBefore(Number(e.target.value))} style={{ width: 80 }} />
        </div>
      </div>

      {/* main grid: time axis + day columns */}
      <div className="scheduler-grid" style={{ display: "flex", gap: 12 }}>
        {/* left time axis */}
        <div style={{ width: 80 }}>
          <div style={{ fontWeight: "bold", marginBottom: 6 }}>Time</div>
          <div style={{ height: "60vh", overflowY: "auto", borderRadius: 6, paddingRight: 8 }}>
            {TIME_BLOCKS.map((t) => (
              <div key={t} className="time-row" style={{ height: 32, color: "#666", paddingLeft: 6 }}>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* day columns */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: "flex", gap: 12, flexGrow: 1, overflowX: "auto" }}>
            {weekdays.map((day) => (
              <Droppable key={day} droppableId={day}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      minWidth: 300,
                      background: "#fff",
                      borderRadius: 8,
                      padding: 12,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                      height: "60vh",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <strong>{day}</strong>
                      <span style={{ color: "#888", fontSize: 12 }}>{(tasks[day] || []).length} tasks</span>
                    </div>

                    {(tasks[day] || []).length === 0 && <div style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>No tasks</div>}

                    {(tasks[day] || []).map((task, idx) => (
                      <Draggable key={task.id || `${day}-${idx}`} draggableId={task.id || `${day}-${idx}`} index={idx}>
                        {(prov) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            onContextMenu={(e) => onTaskContext(e, day, idx)}
                            style={{
                              padding: 8,
                              marginBottom: 8,
                              borderRadius: 6,
                              background: task.done ? "#e6ffe6" : "#fffbe6",
                              border: "1px solid #ddd",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              ...prov.draggableProps.style,
                            }}
                          >
                            <div style={{ maxWidth: "75%" }}>
                              <div style={{ fontWeight: "600" }}>{task.time} • {task.content}</div>
                              <div style={{ fontSize: 12, color: "#666" }}>
                                {task.duration || DEFAULT_DURATION} min {task.origin === "homework" ? `• hw` : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button title="Done" onClick={() => toggleDone(day, idx)} style={{ cursor: "pointer" }}>✅</button>
                              <button title="Delete" onClick={() => deleteTask(day, idx)} style={{ cursor: "pointer" }}>🗑️</button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Context menu for right-click */}
      {contextMenuPos && contextTask && (
        <div
          style={{
            position: "fixed",
            top: contextMenuPos.y,
            left: contextMenuPos.x,
            background: "#fff",
            border: "1px solid #ccc",
            padding: 8,
            zIndex: 9999,
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)"
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <strong>Edit task</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={applyContextEdit}>Edit time/duration</button>
            <button onClick={applyContextDelete} style={{ background: "#f8d7da" }}>Delete</button>
            <button onClick={closeContext}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, color: "#555", fontSize: 13 }}>
        <p><strong>Notes:</strong> Right-click tasks to edit time/duration. Auto-scheduler reads TrackorA homeworkEvents (localStorage key <code>homeworkEvents</code>) and will schedule study sessions before exams (4 days). Deleting a task that came from homework will remove its homeworkEvents entry.</p>
      </div>
    </div>
  );
}
