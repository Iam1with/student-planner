// src/pages/TimetableGenerator.js
import React, { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "../App.css";

/*
  SchedulorA 2.1
  - 24h vertical timeline with 1 hour blocks
  - Drag & drop between days
  - Auto-schedule exam study (4 sessions) and homework into study window
  - Duration edit (+ / - 15min), modal editing on double click
  - Auto-scroll to newly scheduled study or current time
  - Robust delete (no blank screen)
*/

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// 24 hourly slots: "00:00" .. "23:00"
const TIME_SLOTS = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, "0")}:00`
);

// mapping helpers
const parseHHMM = (hhmm) => {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
};
const hhmmFromMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};
// 1 minute => 1 px -> 60px per hour (you requested 1hr block size)
const minutesToPx = (m) => m;

const STORAGE_KEY = "timetableTasks";

const nowSnapToHour = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:00`;
};

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  });

  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedStart, setSelectedStart] = useState(nowSnapToHour());
  const [newTitle, setNewTitle] = useState("");
  const [schoolStart, setSchoolStart] = useState("07:30");
  const [schoolEnd, setSchoolEnd] = useState("15:15");
  const [studyStart, setStudyStart] = useState("16:00");
  const [studyEnd, setStudyEnd] = useState("21:00");
  const [fixedBlocks, setFixedBlocks] = useState(
    () => JSON.parse(localStorage.getItem("fixedSchedule")) || []
  );

  const [modalTask, setModalTask] = useState(null);
  const containerRef = useRef(null);

  // scroll target minutes (when set we auto-scroll)
  const [scrollToMinutes, setScrollToMinutes] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("fixedSchedule", JSON.stringify(fixedBlocks));
  }, [fixedBlocks]);

  useEffect(() => {
    if (scrollToMinutes === null) return;
    // compute pixel offset: top of timeline is 0 minutes => px
    // We want the container to scroll so the requested minutes are visible near top
    const px = minutesToPx(scrollToMinutes) - 80; // offset a bit
    if (containerRef.current) {
      const daysColumns = containerRef.current.querySelector(".days-columns");
      if (daysColumns) {
        // scroll the day's inner body to top px (vertical scroll)
        daysColumns.scrollTop = Math.max(0, px);
      }
    }
    // reset after short delay
    const id = setTimeout(() => setScrollToMinutes(null), 300);
    return () => clearTimeout(id);
  }, [scrollToMinutes]);

  // safe updater helpers
  const safeSetTasks = (updater) => {
    setTasks((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // ensure each weekday has array
      for (const d of weekdays) {
        if (!Array.isArray(next[d])) next[d] = next[d] ? next[d] : [];
      }
      return next;
    });
  };

  const createTask = ({ title, day, start, duration = 60, type = "task", originId = null }) => {
    return {
      id: "t-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      title,
      start: start || "09:00",
      duration: Number(duration) || 60,
      type,
      done: false,
      originId,
    };
  };

  const addTask = () => {
    if (!newTitle.trim()) return;
    const t = createTask({
      title: newTitle.trim(),
      day: selectedDay,
      start: selectedStart,
      duration: 60,
      type: "task",
    });
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[selectedDay] = (copy[selectedDay] || []).concat(t);
      return copy;
    });
    setNewTitle("");
    // scroll to the hour of new task
    setScrollToMinutes(parseHHMM(t.start));
  };

  const toggleFixed = (day, hhmm, duration = 60) => {
    const key = `${day}-${hhmm}-${duration}`;
    setFixedBlocks((prev) => {
      const copy = Array.from(prev || []);
      const idx = copy.indexOf(key);
      if (idx >= 0) copy.splice(idx, 1);
      else copy.push(key);
      return copy;
    });
  };

  // Remove task safely and also remove origin homework if present
  const removeTask = (day, taskId) => {
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[day] = (copy[day] || []).filter((t) => t.id !== taskId);
      return copy;
    });

    // remove from homeworkEvents if originId present
    const allHw = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    const any = Object.values(tasks).flat().find((t) => t.id === taskId);
    if (any && any.originId) {
      const filtered = allHw.filter((hw) => hw.id !== any.originId);
      localStorage.setItem("homeworkEvents", JSON.stringify(filtered));
    }
  };

  const toggleDone = (day, id) => {
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[day] = (copy[day] || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      return copy;
    });
  };

  // duration adjust by delta minutes (e.g., +15 or -15)
  const changeDuration = (day, id, delta) => {
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[day] = (copy[day] || []).map((t) =>
        t.id === id ? { ...t, duration: Math.max(15, (t.duration || 60) + delta) } : t
      );
      return copy;
    });
  };

  // Double click to edit
  const openEditor = (day, task) => {
    setModalTask({ ...task, day });
  };

  const saveModalTask = (edited) => {
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[edited.day] = (copy[edited.day] || []).map((t) => (t.id === edited.id ? edited : t));
      return copy;
    });
    setModalTask(null);
  };

  // Drag & drop handling
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    const from = source.droppableId;
    const to = destination.droppableId;
    if (!from || !to) return;
    // copy arrays
    const fromList = Array.from(tasks[from] || []);
    const [moved] = fromList.splice(source.index, 1);
    const toList = Array.from(tasks[to] || []);
    // when moved between days, keep same start; user can edit later
    toList.splice(destination.index, 0, moved);
    safeSetTasks((prev) => {
      const copy = { ...prev };
      copy[from] = fromList;
      copy[to] = toList;
      return copy;
    });
  };

  // Auto-scheduler -- similar logic as before but ensured to create four study sessions and scroll to them
  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    if (!homeworkList.length) {
      alert("No homeworkEvents found (TrackorA should save to 'homeworkEvents').");
      return;
    }
    // copy current
    const updated = { ...tasks };
    const used = new Set();

    // mark existing used slots
    for (const d of weekdays) {
      (updated[d] || []).forEach((tk) => {
        const startMin = parseHHMM(tk.start);
        const slots = Math.ceil((tk.duration || 60) / 60); // occupancy in hours for simplicity
        for (let s = 0; s < slots; s++) {
          used.add(`${d}-${hhmmFromMinutes(startMin + s * 60)}`);
        }
      });
    }

    // helper: blocked due to school or fixed
    const isBlocked = (day, hhmm) => {
      const curMin = parseHHMM(hhmm);
      const sMin = parseHHMM(schoolStart);
      const eMin = parseHHMM(schoolEnd);
      if (curMin >= sMin && curMin < eMin) return true;
      for (const b of fixedBlocks) {
        const [bd, btime, bdur] = b.split("-");
        if (bd !== day) continue;
        const start = parseHHMM(btime);
        const dur = Number(bdur || 60);
        if (curMin >= start && curMin < start + dur) return true;
      }
      return false;
    };

    // schedule exam study blocks first (4 days before) -> create 4 sessions (1hr each) across 4 days
    const exams = homeworkList.filter((hw) => /exam|test/i.test((hw.description || "") + (hw.subject || "")));
    const createdStudyTasks = [];
    for (const ex of exams) {
      let examDate = ex.date ? new Date(ex.date) : null;
      if (!examDate || isNaN(examDate.getTime())) {
        // if invalid use Date.parse of string
        try {
          examDate = new Date(ex.date);
        } catch { examDate = new Date(); }
      }
      // start scheduling 4 days before
      const startBase = new Date(examDate);
      startBase.setDate(startBase.getDate() - 4);

      for (let i = 0; i < 4; i++) {
        const d = new Date(startBase);
        d.setDate(startBase.getDate() + i);
        const dayName = weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1];
        // find earliest free hour in study window
        let placed = false;
        for (let minute = parseHHMM(studyStart); minute <= parseHHMM(studyEnd) - 60; minute += 60) {
          const slot = hhmmFromMinutes(minute);
          if (isBlocked(dayName, slot)) continue;
          if (used.has(`${dayName}-${slot}`)) continue;
          const t = createTask({
            title: `Study: ${ex.subject || ex.description || "Exam"}`,
            day: dayName,
            start: slot,
            duration: 60,
            type: "study",
            originId: ex.id,
          });
          if (!updated[dayName]) updated[dayName] = [];
          updated[dayName].push(t);
          used.add(`${dayName}-${slot}`);
          createdStudyTasks.push({ day: dayName, startMin: parseHHMM(slot) });
          placed = true;
          break;
        }
        // if couldn't place, continue to next day (we still attempt all 4)
      }
    }

    // schedule normal homework into next 7 days
    const normalHw = homeworkList.filter((hw) => !/exam|test/i.test((hw.description || "") + (hw.subject || "")));
    const today = new Date();
    for (const hw of normalHw) {
      let scheduled = false;
      for (let dOff = 0; dOff < 7 && !scheduled; dOff++) {
        const d = new Date(today);
        d.setDate(today.getDate() + dOff);
        const dayName = weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1];
        for (let minute = parseHHMM(studyStart); minute <= parseHHMM(studyEnd) - 60; minute += 60) {
          const slot = hhmmFromMinutes(minute);
          if (isBlocked(dayName, slot)) continue;
          if (used.has(`${dayName}-${slot}`)) continue;
          const t = createTask({
            title: `${hw.subject || "HW"}: ${hw.description || ""}`,
            day: dayName,
            start: slot,
            duration: 60,
            type: "homework",
            originId: hw.id,
          });
          if (!updated[dayName]) updated[dayName] = [];
          updated[dayName].push(t);
          used.add(`${dayName}-${slot}`);
          scheduled = true;
          break;
        }
      }
    }

    // finalize
    safeSetTasks(() => {
      // ensure updated has arrays for all days
      const finalCopy = {};
      for (const d of weekdays) finalCopy[d] = (updated[d] || []).slice();
      return finalCopy;
    });

    // auto-scroll to first created study if any, else to current hour
    if (createdStudyTasks.length) {
      const first = createdStudyTasks[0];
      setScrollToMinutes(first.startMin);
    } else {
      const now = new Date();
      setScrollToMinutes(now.getHours() * 60);
    }
    // small notify
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
    try { new Notification("SchedulorA", { body: "Auto-schedule complete" }); } catch {}
  };

  // compute top px from hhmm: minutes since 00:00
  const computeTopPx = (hhmm) => minutesToPx(parseHHMM(hhmm));

  // render helpers
  const renderTaskCard = (task, day) => {
    const top = computeTopPx(task.start);
    const height = minutesToPx(task.duration || 60);
    const doneStyle = task.done ? { background: "#d4f7d4", borderLeft: "4px solid #28a745" } : {};
    const baseStyle = {
      top: `${top}px`,
      height: `${height}px`,
    };

    return (
      <Draggable key={task.id} draggableId={task.id} index={0}>
        {(prov) => (
          <div
            ref={prov.innerRef}
            {...prov.draggableProps}
            {...prov.dragHandleProps}
            className={`task-card ${task.type} ${task.done ? "done" : ""}`}
            style={{ ...baseStyle, position: "absolute", left: 8, right: 8, zIndex: 4, ...doneStyle }}
            onDoubleClick={() => openEditor(day, task)}
            title={`${task.title} • ${task.start} • ${task.duration} min`}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 700, minWidth: 56 }}>{task.start}</div>
              <div style={{ fontSize: 13 }}>{task.title}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDone(day, task.id);
                }}
                style={{
                  border: "none",
                  background: task.done ? "#28a745" : "#6c8cff",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                title="Mark done"
              >
                ✔
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  changeDuration(day, task.id, -15);
                }}
                style={{
                  border: "none",
                  background: "#eee",
                  color: "#333",
                  padding: "6px 6px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                title="-15 min"
              >
                −
              </button>

              <div style={{ fontSize: 12, minWidth: 42, textAlign: "center" }}>{task.duration}m</div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  changeDuration(day, task.id, +15);
                }}
                style={{
                  border: "none",
                  background: "#eee",
                  color: "#333",
                  padding: "6px 6px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                title="+15 min"
              >
                +
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeTask(day, task.id);
                }}
                style={{
                  border: "none",
                  background: "#ff6b6b",
                  color: "#fff",
                  padding: "6px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
                title="Delete"
              >
                🗑
              </button>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  // ensure tasks object has arrays for all days to avoid undefined access
  const safeTasksForRender = {};
  for (const d of weekdays) safeTasksForRender[d] = tasks[d] ? tasks[d] : [];

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>SchedulorA — Timetable Generator</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={selectedStart}
            onChange={(e) => setSelectedStart(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            placeholder="Task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button onClick={addTask} className="btn">
            ➕ Add
          </button>
          <button onClick={autoScheduleHomework} className="btn" style={{ background: "#4059c9", color: "#fff" }}>
            🤖 Auto-schedule
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 12, color: "#333" }}>School start</label>
            <input type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#333" }}>School end</label>
            <input type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#333" }}>Study start</label>
            <input type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#333" }}>Study end</label>
            <input type="time" value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} />
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{ display: "flex", gap: 12, marginTop: 12, height: "75vh", overflow: "hidden" }} className="schedulor-container">
        {/* time column */}
        <div style={{ width: 72, background: "#fff", borderRadius: 8, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)", overflow: "auto" }}>
          <div style={{ position: "relative" }}>
            {TIME_SLOTS.map((s) => (
              <div key={s} style={{ height: `${minutesToPx(60)}px`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #f1f1f1", fontSize: 12, color: "#333" }}>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* days columns (scrollY inside) */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="days-columns" style={{ display: "flex", gap: 12, overflowX: "auto", overflowY: "auto", flex: 1 }}>
            {weekdays.map((day) => (
              <Droppable droppableId={day} key={day}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      width: 220,
                      minWidth: 220,
                      background: "#fff",
                      borderRadius: 8,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.04)",
                      position: "relative",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ padding: 10, borderBottom: "1px solid #f2f2f2", fontWeight: 700 }}>{day}</div>

                    <div style={{ position: "relative", height: `${minutesToPx(60) * TIME_SLOTS.length}px`, overflow: "hidden" }}>
                      {/* fixed blocks */}
                      {fixedBlocks.filter((b) => b.startsWith(`${day}-`)).map((b) => {
                        const [, start, dur] = b.split("-");
                        const top = computeTopPx(start);
                        const height = minutesToPx(Number(dur));
                        return <div key={b} style={{ position: "absolute", left: 8, right: 8, top: `${top}px`, height: `${height}px`, background: "rgba(200,200,200,0.22)", borderRadius: 6, border: "1px dashed rgba(0,0,0,0.06)" }} />;
                      })}

                      {/* tasks */}
                      {(safeTasksForRender[day] || [])
                        .sort((a, b) => parseHHMM(a.start) - parseHHMM(b.start))
                        .map((task, idx) => (
                          <Draggable key={task.id} draggableId={task.id} index={idx}>
                            {(prov) => {
                              const top = computeTopPx(task.start);
                              const height = minutesToPx(task.duration || 60);
                              const doneStyle = task.done ? { background: "#e6ffe6", borderLeft: "4px solid #28a745" } : {};
                              return (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  style={{
                                    position: "absolute",
                                    left: 8,
                                    right: 8,
                                    top: `${top}px`,
                                    height: `${height}px`,
                                    borderRadius: 8,
                                    padding: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    boxSizing: "border-box",
                                    boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
                                    background: task.type === "homework" ? "#fff6f6" : task.type === "study" ? "#fffaf0" : "#fffbe6",
                                    borderLeft: `4px solid ${task.type === "study" ? "#ffb84d" : task.type === "homework" ? "#ff6b6b" : "#6c8cff"}`,
                                    ...doneStyle,
                                  }}
                                  onDoubleClick={() => openEditor(day, task)}
                                >
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <div style={{ fontWeight: 700, minWidth: 56 }}>{task.start}</div>
                                    <div style={{ fontSize: 13 }}>{task.title}</div>
                                  </div>

                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggleDone(day, task.id); }}
                                      style={{ background: task.done ? "#28a745" : "#6c8cff", color: "#fff", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
                                      title="Mark done"
                                    >
                                      ✔
                                    </button>

                                    <button onClick={(e) => { e.stopPropagation(); changeDuration(day, task.id, -15); }} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }} title="-15">
                                      −
                                    </button>
                                    <div style={{ minWidth: 46, textAlign: "center", fontSize: 12 }}>{task.duration}m</div>
                                    <button onClick={(e) => { e.stopPropagation(); changeDuration(day, task.id, +15); }} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }} title="+15">
                                      +
                                    </button>

                                    <button onClick={(e) => { e.stopPropagation(); removeTask(day, task.id); }} style={{ background: "#ff6b6b", color: "#fff", border: "none", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }} title="Delete">
                                      🗑
                                    </button>
                                  </div>
                                </div>
                              );
                            }}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Modal */}
      {modalTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: 18, width: 420 }}>
            <h3 style={{ marginTop: 0 }}>Edit task</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={modalTask.title} onChange={(e) => setModalTask({ ...modalTask, title: e.target.value })} />
              <select value={modalTask.day} onChange={(e) => setModalTask({ ...modalTask, day: e.target.value })}>
                {weekdays.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
              <input type="time" value={modalTask.start} onChange={(e) => setModalTask({ ...modalTask, start: e.target.value })} />
              <input type="number" value={modalTask.duration} onChange={(e) => setModalTask({ ...modalTask, duration: Number(e.target.value) })} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setModalTask(null)} style={{ padding: "8px 12px", borderRadius: 6 }}>Cancel</button>
                <button onClick={() => saveModalTask(modalTask)} style={{ padding: "8px 12px", borderRadius: 6, background: "#4059c9", color: "#fff" }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableGenerator;
