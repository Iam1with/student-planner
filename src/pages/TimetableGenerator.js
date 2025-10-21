// src/pages/TimetableGenerator.js
import React, { useEffect, useState, useRef } from "react";
import "../App.css";
import {
  DragDropContext,
  Droppable,
  Draggable
} from "@hello-pangea/dnd";

/**
 * SchedulorA 2.0
 *
 * Features:
 * - Vertical days, horizontal time-grid implemented as per-slot droppables
 * - Auto-schedule from TrackorA (localStorage 'homeworkEvents')
 * - 4-day exam study planner
 * - Sync delete with TrackorA homeworkEvents
 * - Right-click edit time/priority/delete prompts
 * - Browser notifications (in-session)
 */

// configuration
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const timeBlocks = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00"
];

const slotId = (day, time) => `${day}|||${time}`;

function parseDateKey(d) {
  if (!d) return null;
  const date = new Date(d);
  return date.toDateString();
}

function isExamEvent(hw) {
  if (!hw) return false;
  if (hw.type && hw.type.toLowerCase() === "exam") return true;
  if (hw.description && /exam/i.test(hw.description)) return true;
  return false;
}

const TimetableGenerator = () => {
  const [slots, setSlots] = useState(() => {
    // structure: { "Monday|||08:00": [task, ...], ... }
    const cached = JSON.parse(localStorage.getItem("timetableTasks")) || {};
    return cached;
  });

  const [prefs, setPrefs] = useState(() => {
    const p = JSON.parse(localStorage.getItem("schedPreferences") || "{}");
    return {
      schoolStart: p.schoolStart || "07:30",
      schoolEnd: p.schoolEnd || "15:15",
      studyStart: p.studyStart || "16:00",
      studyEnd: p.studyEnd || "21:00",
      ...p
    };
  });

  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDay, setNewTaskDay] = useState(weekdays[0]);
  const [newTaskTime, setNewTaskTime] = useState("17:00");
  const [saveToTrackor, setSaveToTrackor] = useState(true);

  const notificationTimersRef = useRef({}); // to store timeout ids for session notifications

  // build all slot keys if not present
  useEffect(() => {
    setSlots((prev) => {
      let updated = { ...prev };
      for (const d of weekdays) {
        for (const t of timeBlocks) {
          const id = slotId(d, t);
          if (!Array.isArray(updated[id])) updated[id] = [];
        }
      }
      localStorage.setItem("timetableTasks", JSON.stringify(updated));
      return updated;
    });
    // ask for notification permission
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("timetableTasks", JSON.stringify(slots));
    // schedule in-session notifications for upcoming tasks
    scheduleNotificationsForAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  useEffect(() => {
    localStorage.setItem("schedPreferences", JSON.stringify(prefs));
  }, [prefs]);

  // helper: push a task into a slot
  const pushTaskToSlot = (day, time, task) => {
    const id = slotId(day, time);
    setSlots((prev) => {
      const copy = { ...prev };
      copy[id] = copy[id] ? [...copy[id], task] : [task];
      return copy;
    });
  };

  // helper: remove a task from a specific slot by its id
  const removeTaskFromSlotById = (slotKey, taskId) => {
    setSlots((prev) => {
      const copy = { ...prev };
      copy[slotKey] = (copy[slotKey] || []).filter((t) => t.id !== taskId);
      return copy;
    });
  };

  // create a normalized task object
  const createTaskObject = ({
    content,
    subject,
    type = "Other",
    origin = null, // if from TrackorA homeworkEvents store id
    time,
    dateStr,
    priority = "normal"
  }) => {
    return {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7),
      content: String(content || ""),
      subject: subject || "",
      type: type || "Other",
      origin: origin || null,
      time,
      date: dateStr, // day-of-week date string or date string (for reference)
      priority
    };
  };

  // add new task UI -> slot
  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    const task = createTaskObject({
      content: newTaskText.trim(),
      subject: "",
      type: "Manual",
      origin: null,
      time: newTaskTime,
      dateStr: newTaskDay
    });
    pushTaskToSlot(newTaskDay, newTaskTime, task);

    // optionally save to TrackorA (homeworkEvents) — only minimal info
    if (saveToTrackor) {
      const hw = {
        id: task.id,
        subject: task.subject || "General",
        description: task.content,
        date: new Date().toDateString(),
        type: "Manual"
      };
      const storedHomework = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
      storedHomework.push(hw);
      localStorage.setItem("homeworkEvents", JSON.stringify(storedHomework));
      // set task origin to the homework id for syncing
      setSlots((prev) => {
        const copy = { ...prev };
        const k = slotId(newTaskDay, newTaskTime);
        copy[k] = (copy[k] || []).map((t) =>
          t.id === task.id ? { ...t, origin: hw.id } : t
        );
        return copy;
      });
    }

    setNewTaskText("");
  };

  // delete task and sync if necessary
  const handleDeleteTask = (slotKey, task) => {
    // remove from timetable
    removeTaskFromSlotById(slotKey, task.id);

    // if originated from homeworkEvents, remove from that array too
    if (task.origin) {
      const all = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
      const filtered = all.filter((hw) => hw.id !== task.origin);
      localStorage.setItem("homeworkEvents", JSON.stringify(filtered));
    }
  };

  // right-click edit
  const handleEditTask = (slotKey, task) => {
    // simple prompt-based edit: change time or priority or delete
    const newContent = window.prompt("Edit task text (leave blank to keep):", task.content);
    if (newContent === null) return; // cancelled
    const timeInput = window.prompt(
      `Change time for the task (HH:MM) — valid options: ${timeBlocks.join(", ")}`,
      task.time
    );
    if (timeInput === null) return;
    const chosenTime = timeBlocks.includes(timeInput) ? timeInput : task.time;
    const priority = window.prompt("Set priority (low/normal/high):", task.priority || "normal");
    // modify
    setSlots((prev) => {
      const copy = { ...prev };
      // remove old
      copy[slotKey] = (copy[slotKey] || []).filter((t) => t.id !== task.id);
      // update and push to new slot
      const updatedTask = { ...task, content: newContent || task.content, time: chosenTime, priority: priority || task.priority };
      const targetSlot = slotId(slotKey.split("|||")[0], chosenTime);
      copy[targetSlot] = copy[targetSlot] ? [...copy[targetSlot], updatedTask] : [updatedTask];

      // if origin exists, update homeworkEvents entry with new description/time if needed
      if (task.origin) {
        const allHW = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
        const idx = allHW.findIndex((h) => h.id === task.origin);
        if (idx >= 0) {
          allHW[idx] = { ...allHW[idx], description: updatedTask.content, scheduledTime: chosenTime };
          localStorage.setItem("homeworkEvents", JSON.stringify(allHW));
        }
      }

      return copy;
    });
  };

  // drag end handler for @hello-pangea/dnd
  // we use droppableId = slotKey (day|||time)
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    const sourceId = source.droppableId;
    const destId = destination.droppableId;

    if (sourceId === destId && source.index === destination.index) return;

    setSlots((prev) => {
      const copy = { ...prev };
      const sourceArr = Array.from(copy[sourceId] || []);
      const [moved] = sourceArr.splice(source.index, 1);
      // update moved time and date
      const [destDay, destTime] = destId.split("|||");
      moved.time = destTime;
      moved.date = destDay;
      // insert into dest arr at index
      const destArr = Array.from(copy[destId] || []);
      destArr.splice(destination.index, 0, moved);
      copy[sourceId] = sourceArr;
      copy[destId] = destArr;

      // If moved task has origin (homeworkEvents), update that array with new scheduledTime/date
      if (moved.origin) {
        const all = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
        const idx = all.findIndex((h) => h.id === moved.origin);
        if (idx >= 0) {
          all[idx].scheduledTime = moved.time;
          all[idx].scheduledDay = moved.date;
          localStorage.setItem("homeworkEvents", JSON.stringify(all));
        }
      }

      return copy;
    });
  };

  // helper: find first free slot between studyStart and studyEnd for a given day
  const findFirstFreeStudySlot = (day, usedSlotsSet = new Set()) => {
    // find timeBlock indexes within study hours
    const [ssH, ssM] = prefs.studyStart.split(":").map(Number);
    const [seH, seM] = prefs.studyEnd.split(":").map(Number);
    const startIndex = timeBlocks.findIndex((t) => {
      const [h, m] = t.split(":").map(Number);
      return h > ssH || (h === ssH && m >= ssM);
    });
    const endIndex = timeBlocks.findIndex((t) => {
      const [h, m] = t.split(":").map(Number);
      return h > seH || (h === seH && m > seM);
    });
    const low = startIndex >= 0 ? startIndex : 0;
    const high = endIndex >= 0 ? endIndex : timeBlocks.length - 1;
    for (let i = low; i <= high; i++) {
      const t = timeBlocks[i];
      const id = slotId(day, t);
      if (usedSlotsSet.has(id)) continue;
      if ((slots[id] || []).length === 0) return t;
    }
    return null;
  };

  // auto-schedule algorithm:
  // - load homeworkEvents
  // - for exams -> create study sessions 4 days before
  // - otherwise, place homework into first free study slot respecting prefs and fixed schedule
  const autoSchedule = () => {
    const homeworkList = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    // we will use a set to avoid double-using same slot
    const used = new Set();
    const updated = { ...slots };

    // helper to add if free
    const addToFirstFree = (hw, day) => {
      const free = findFirstFreeStudySlot(day, used);
      if (!free) return false;
      const tsk = createTaskObject({
        content: hw.description || `Homework: ${hw.subject || "Unknown"}`,
        subject: hw.subject || "",
        type: hw.type || "Homework",
        origin: hw.id || null,
        time: free,
        dateStr: day
      });
      const idk = slotId(day, free);
      updated[idk] = updated[idk] ? [...updated[idk], tsk] : [tsk];
      used.add(idk);
      return true;
    };

    // 1) schedule exam study sessions: For each hw marked exam, schedule study sessions 4 days before exam date
    const exams = homeworkList.filter((h) => isExamEvent(h));
    for (const ex of exams) {
      // parse ex.date — expecting ex.date to be a parseable date or date string
      const examDate = new Date(ex.date);
      if (isNaN(examDate)) continue;
      // build 4 days before
      for (let d = 1; d <= 4; d++) {
        const dt = new Date(examDate);
        dt.setDate(examDate.getDate() - d);
        const dayName = weekdays[dt.getDay() === 0 ? 6 : dt.getDay() - 1]; // convert Sunday=0 to index mapping
        // add study session
        addToFirstFree({ id: ex.id + "-study-" + d, subject: ex.subject, description: `Study: ${ex.subject}`, type: "Study", origin: ex.id }, dayName);
      }
    }

    // 2) schedule regular homework (non-exam)
    const nonEx = homeworkList.filter((h) => !isExamEvent(h));
    // iterate days in week order, attempt to place items on their original date first (if provided) else earliest available
    for (const hw of nonEx) {
      let placed = false;
      // try if hw.date provided and maps to a weekday (if format allows)
      if (hw.date) {
        const d = new Date(hw.date);
        if (!isNaN(d)) {
          const dayName = weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1];
          placed = addToFirstFree(hw, dayName);
        }
      }
      // else try today's weekday onward
      if (!placed) {
        for (const day of weekdays) {
          if (addToFirstFree(hw, day)) {
            placed = true;
            break;
          }
        }
      }
    }

    // merge updated into state
    setSlots(updated);
  };

  // notifications: schedule notifications for tasks occurring in the future (in-session only)
  const scheduleNotificationsForAll = () => {
    // clear existing timers
    for (const k in notificationTimersRef.current) {
      clearTimeout(notificationTimersRef.current[k]);
    }
    notificationTimersRef.current = {};

    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const now = new Date();
    for (const key of Object.keys(slots)) {
      const arr = slots[key] || [];
      if (arr.length === 0) continue;
      const [day, time] = key.split("|||");
      // compute next date for that weekday (this week)
      const today = new Date();
      const targetWeekdayIndex = weekdays.indexOf(day); // 0..6
      if (targetWeekdayIndex < 0) continue;
      // find next date with that weekday (including today)
      const currentWeekdayIndex = (today.getDay() + 6) % 7; // convert Sun=0 -> index mapping
      let deltaDays = targetWeekdayIndex - currentWeekdayIndex;
      if (deltaDays < 0) deltaDays += 7;
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + deltaDays);
      const [h, m] = time.split(":").map(Number);
      candidate.setHours(h, m, 0, 0);
      // schedule notifications for each task in that slot
      for (const task of arr) {
        const msUntil = candidate.getTime() - now.getTime() - 15 * 60 * 1000; // 15 minutes before
        if (msUntil > 0 && msUntil < 7 * 24 * 3600 * 1000) {
          const timerId = setTimeout(() => {
            new Notification(`Upcoming: ${task.content}`, {
              body: `${task.subject ? task.subject + " — " : ""}${task.type} at ${time}`,
            });
          }, msUntil);
          notificationTimersRef.current[task.id] = timerId;
        }
      }
    }
  };

  // helper UI to clear timetable or homeworkEvents
  const clearTimetable = () => {
    const newSlots = {};
    for (const d of weekdays) {
      for (const t of timeBlocks) {
        newSlots[slotId(d, t)] = [];
      }
    }
    setSlots(newSlots);
  };

  const clearHomeworkEvents = () => {
    localStorage.setItem("homeworkEvents", JSON.stringify([]));
    // also remove timetable items that link to those origins
    setSlots((prev) => {
      const copy = { ...prev };
      for (const k of Object.keys(copy)) {
        copy[k] = (copy[k] || []).filter((t) => !t.origin);
      }
      return copy;
    });
  };

  // UI helpers
  const getSlotKeyIndex = (d, t) => ({ id: slotId(d, t) });

  // Right-click handler wrapper (prevent default)
  const onContextMenu = (e, slotKey, task) => {
    e.preventDefault();
    handleEditTask(slotKey, task);
  };

  // Render helpers
  const renderSlot = (d, t) => {
    const key = slotId(d, t);
    const list = slots[key] || [];
    return (
      <Droppable droppableId={key} key={key}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`slot-cell ${snapshot.isDraggingOver ? "drag-over" : ""}`}
            style={{
              minHeight: 48,
              padding: 6,
              borderRadius: 6,
              background: snapshot.isDraggingOver ? "#eef6ff" : "transparent"
            }}
          >
            {list.map((task, idx) => (
              <Draggable key={task.id} draggableId={task.id} index={idx}>
                {(prov) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                    onContextMenu={(e) => onContextMenu(e, key, task)}
                    className={`task-pill ${task.priority === "high" ? "priority-high" : task.priority === "low" ? "priority-low" : ""}`}
                    style={{
                      padding: "6px 8px",
                      marginBottom: 6,
                      borderRadius: 8,
                      background: task.type === "Study" ? "#f0f7e6" : task.type === "Homework" ? "#fff3e6" : "#e8f0ff",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      ...prov.draggableProps.style
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{task.content}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {task.subject ? `${task.subject} • ` : ""}{task.type} • {task.time}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        title="Mark done"
                        onClick={() => {
                          // mark done simply toggles done class and doesn't affect origin sync
                          setSlots((prev) => {
                            const copy = { ...prev };
                            copy[key] = (copy[key] || []).map((t) => t.id === task.id ? { ...t, done: !t.done } : t);
                            return copy;
                          });
                        }}
                        className="icon-btn"
                      >
                        ✅
                      </button>
                      <button
                        title="Delete"
                        onClick={() => handleDeleteTask(key, task)}
                        className="icon-btn"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <div className="schedulor-container" style={{ padding: 18 }}>
      <div className="header" style={{ marginBottom: 12 }}>
        <h2 style={{ display: "inline-block", marginRight: 12 }}>🔷 SchedulorA — Timetable Generator</h2>
        <div style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 12 }}>
          <button onClick={autoSchedule} style={{ marginRight: 8 }} className="btn-primary">Auto-schedule (TrackorA)</button>
          <button onClick={clearTimetable} style={{ marginRight: 8 }} className="btn-ghost">Clear timetable</button>
          <button onClick={clearHomeworkEvents} className="btn-ghost">Clear homeworkEvents</button>
        </div>
      </div>

      {/* Preferences */}
      <div className="prefs" style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>School start</label>
          <input type="time" value={prefs.schoolStart} onChange={(e) => setPrefs({ ...prefs, schoolStart: e.target.value })} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>School end</label>
          <input type="time" value={prefs.schoolEnd} onChange={(e) => setPrefs({ ...prefs, schoolEnd: e.target.value })} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>Study start</label>
          <input type="time" value={prefs.studyStart} onChange={(e) => setPrefs({ ...prefs, studyStart: e.target.value })} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>Study end</label>
          <input type="time" value={prefs.studyEnd} onChange={(e) => setPrefs({ ...prefs, studyEnd: e.target.value })} />
        </div>
      </div>

      {/* Add task */}
      <div className="add-row" style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <select value={newTaskDay} onChange={(e) => setNewTaskDay(e.target.value)}>
          {weekdays.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)}>
          {timeBlocks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Add task (also saved to TrackorA)" style={{ flex: 1 }} value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)} />
        <button onClick={handleAddTask} className="btn-primary">➕ Add</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={saveToTrackor} onChange={(e) => setSaveToTrackor(e.target.checked)} /> Save to TrackorA
        </label>
      </div>

      {/* Grid header (time labels) */}
      <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekdays.length}, 1fr)`, gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Time</div>
        {weekdays.map((d) => <div key={d} style={{ fontWeight: 700 }}>{d}</div>)}
      </div>

      {/* Grid body */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${weekdays.length}, 1fr)`, gap: 12, marginTop: 8, alignItems: "start" }}>
          {timeBlocks.map((t) => (
            <React.Fragment key={t}>
              {/* time label column */}
              <div style={{ padding: 8, borderRadius: 8, background: "#fafafa", minHeight: 64, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
                {t}
              </div>
              {/* for each weekday, render the slot for this time */}
              {weekdays.map((d) => (
                <div key={`${d}-${t}`} style={{ minHeight: 64 }}>
                  {renderSlot(d, t)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </DragDropContext>

      <div style={{ marginTop: 18 }}>
        <h3>Notes</h3>
        <ul>
          <li>Right-click task to edit text/time/priority or delete.</li>
          <li>Deleting a task with TrackorA origin will remove it from TrackorA's <code>homeworkEvents</code>.</li>
          <li>Auto-schedule places TrackorA items into free study slots respecting school & fixed schedule.</li>
        </ul>
      </div>
    </div>
  );
};

export default TimetableGenerator;
