// src/pages/TimetableGenerator.js
import React, { useState, useEffect, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";

/*
  SchedulorA (TimetableGenerator)
  - Tailwind layout
  - 24h grid (30-min slots)
  - durations supported (minutes)
  - auto-schedule using homeworkEvents (and 4-day pre-exam study sessions)
  - fixed schedule modal at first visit
  - syncs deletions with homeworkEvents by id/heuristics
*/

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// generate times every 30 minutes as "HH:MM" strings
const generateTimes = (intervalMins = 30) => {
  const arr = [];
  for (let m = 0; m < 24 * 60; m += intervalMins) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    arr.push(`${hh}:${mm}`);
  }
  return arr;
};

const timeSlots = generateTimes(30);

// helpers
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const minutesToHHMM = (mins) => {
  mins = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
};

const defaultStudyWindow = { start: "17:00", end: "21:00" };
const defaultSchoolWindow = { start: "07:30", end: "15:15" };
const defaultSleepWindow = { start: "22:00", end: "06:30" };

const STORAGE_TASKS = "timetableTasks";
const STORAGE_HOMEWORK = "homeworkEvents";
const STORAGE_FIXED = "fixedScheduleSettings";

export default function TimetableGenerator() {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem(STORAGE_TASKS)) || {});
  const [selectedDay, setSelectedDay] = useState(weekdays[new Date().getDay() - 1] || "Monday");
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("17:00");
  const [newTaskDuration, setNewTaskDuration] = useState(60);
  const [showSetup, setShowSetup] = useState(() => !localStorage.getItem(STORAGE_FIXED));
  const [fixedSettings, setFixedSettings] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_FIXED));
    return (
      saved || {
        school: defaultSchoolWindow,
        study: defaultStudyWindow,
        sleep: defaultSleepWindow,
        blockedSlots: [], // optional specific blocks like "Monday-12:30"
      }
    );
  });
  const [editing, setEditing] = useState(null); // {day, index, open:boolean}
  const [searchingHomework, setSearchingHomework] = useState(false);

  // keep localStorage in sync
  useEffect(() => {
    localStorage.setItem(STORAGE_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_FIXED, JSON.stringify(fixedSettings));
  }, [fixedSettings]);

  // utility: mark slot blocked if inside any fixed window (school/sleep) for that day.
  const isBlocked = (day, hhmm) => {
    // blocked by explicit blocks:
    if (fixedSettings.blockedSlots?.includes(`${day}-${hhmm}`)) return true;
    const mins = toMinutes(hhmm);

    // school
    const schStart = toMinutes(fixedSettings.school.start);
    let schEnd = toMinutes(fixedSettings.school.end);
    if (schEnd <= schStart) schEnd += 24 * 60; // overnight
    let checkM = mins;
    if (checkM < schStart) checkM += 24 * 60;
    if (checkM >= schStart && checkM < schEnd) return true;

    // sleep
    const slpStart = toMinutes(fixedSettings.sleep.start);
    let slpEnd = toMinutes(fixedSettings.sleep.end);
    if (slpEnd <= slpStart) slpEnd += 24 * 60;
    checkM = mins;
    if (checkM < slpStart) checkM += 24 * 60;
    if (checkM >= slpStart && checkM < slpEnd) return true;

    return false;
  };

  // add a new task (also creates an id)
  const addTask = (day = selectedDay, text = newTaskText, time = newTaskTime, duration = newTaskDuration) => {
    if (!text.trim()) return;
    const id = Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8);
    const newItem = { id, content: text, time, duration, done: false, source: "manual" };

    const updated = { ...tasks };
    if (!updated[day]) updated[day] = [];
    updated[day].push(newItem);
    setTasks(updated);
    setNewTaskText("");
  };

  // toggle done
  const toggleDone = (day, index) => {
    const updated = { ...tasks };
    if (!updated[day]) return;
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
    // if this task came from homeworkEvents, sync it
    const hw = updated[day][index];
    if (hw && hw.homeworkId) {
      // mark done in homeworkEvents if present
      const all = JSON.parse(localStorage.getItem(STORAGE_HOMEWORK)) || [];
      const changed = all.map((h) => (h.id === hw.homeworkId ? { ...h, done: !h.done } : h));
      localStorage.setItem(STORAGE_HOMEWORK, JSON.stringify(changed));
    }
  };

  // delete task (and if it references homeworkEvents, remove or mark)
  const deleteTask = (day, index) => {
    const updated = { ...tasks };
    if (!updated[day]) return;
    const removed = updated[day].splice(index, 1)[0];
    setTasks(updated);

    // If task has homeworkId — remove matching homework event from storage
    if (removed?.homeworkId) {
      const all = JSON.parse(localStorage.getItem(STORAGE_HOMEWORK)) || [];
      const filtered = all.filter((h) => h.id !== removed.homeworkId);
      localStorage.setItem(STORAGE_HOMEWORK, JSON.stringify(filtered));
      // Also update TrackorA's events mapping if used (we attempt to remove matching event)
      const evts = JSON.parse(localStorage.getItem("events")) || {};
      const dateKey = removed?.date || null;
      if (dateKey && evts[dateKey]) {
        // remove by matching subject/description heuristics
        evts[dateKey] = evts[dateKey].filter(
          (e) =>
            !(
              (e.subject && removed.subject && e.subject === removed.subject) ||
              (e.description && removed.content && e.description === removed.content)
            )
        );
        localStorage.setItem("events", JSON.stringify(evts));
      }
    }
  };

  // onDragEnd: handle moving between days
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const srcDay = source.droppableId;
    const dstDay = destination.droppableId;
    if (!tasks[srcDay]) return;

    const srcArr = Array.from(tasks[srcDay]);
    const [moved] = srcArr.splice(source.index, 1);
    // allow time override when dropping into a different day: keep same time unless user edits
    const dstArr = Array.from(tasks[dstDay] || []);
    dstArr.splice(destination.index, 0, { ...moved });

    const updated = { ...tasks, [srcDay]: srcArr, [dstDay]: dstArr };
    setTasks(updated);
  };

  // Auto-scheduler reading homeworkEvents
  const autoSchedule = (options = { includeHomework: true, includeExams: true }) => {
    const hwList = JSON.parse(localStorage.getItem(STORAGE_HOMEWORK)) || [];
    if (!Array.isArray(hwList)) return;

    // helper: find first free slot on day for duration (in minutes)
    const findSlotOnDay = (day, duration) => {
      // iterate through timeSlots (30-min step). We'll try slot start times aligned to 30-min.
      for (let t of timeSlots) {
        // blocked check for every 30-min step of duration
        let startM = toMinutes(t);
        let ok = true;
        for (let offset = 0; offset < duration; offset += 30) {
          const chunkM = startM + offset;
          const hhmm = minutesToHHMM(chunkM);
          if (isBlocked(day, hhmm)) {
            ok = false;
            break;
          }
          // also ensure no existing task occupies overlapping minutes
          const existing = tasks[day] || [];
          for (let ex of existing) {
            const exStart = toMinutes(ex.time);
            const exEnd = exStart + (ex.duration || 60);
            const thisEnd = startM + duration;
            if (!(thisEnd <= exStart || startM >= exEnd)) {
              ok = false;
              break;
            }
          }
          if (!ok) break;
        }
        if (ok) return minutesToHHMM(startM);
      }
      return null;
    };

    // build updated tasks map copy
    const updated = { ...tasks };

    // usedSlots set to avoid collisions
    const usedSlots = new Set();

    // schedule exams with 4-day prior study plan first
    for (const hw of hwList) {
      // determine type heuristically
      const type =
        hw.type ||
        hw.eventType ||
        (/(exam|test|final|midterm)/i.test(String(hw.description || "") + String(hw.what || "")) ? "Exam" : "Homework");

      if (!options.includeExams && type === "Exam") continue;

      // if exam and has date, create study blocks 4 days before
      if (type === "Exam" && hw.date) {
        // parse date
        const examDate = new Date(hw.date);
        for (let d = 1; d <= 4; d++) {
          const dayDate = new Date(examDate);
          dayDate.setDate(examDate.getDate() - d);
          const dayName = weekdays[(dayDate.getDay() + 6) % 7]; // Mon=0 mapping
          // try to place a 60-min study slot (you can change)
          const dd = dayName;
          if (!updated[dd]) updated[dd] = [];
          // try find slot
          const slot = findSlotOnDay(dd, 60);
          if (slot) {
            updated[dd].push({
              id: "study-" + hw.id + "-" + d,
              content: `Study for ${hw.subject || hw.description || "Exam"}`,
              duration: 60,
              time: slot,
              homeworkId: hw.id,
              date: dayDate.toDateString(),
              done: false,
              source: "autoscheduled",
            });
            usedSlots.add(`${dd}-${slot}`);
          }
        }
      }
    }

    // then schedule plain homework items
    for (const hw of hwList) {
      const type =
        hw.type ||
        hw.eventType ||
        (/(exam|test|final|midterm)/i.test(String(hw.description || "") + String(hw.what || "")) ? "Exam" : "Homework");
      if (!options.includeHomework && type !== "Exam") continue;

      // If hw has an assigned date, try to schedule on that date; else across week
      const preferredDays = [];
      if (hw.date) {
        const d = new Date(hw.date);
        preferredDays.push(weekdays[(d.getDay() + 6) % 7]);
      } else {
        preferredDays.push(...weekdays);
      }

      const duration = hw.duration || 60;

      let placed = false;
      for (const day of preferredDays) {
        const slot = findSlotOnDay(day, duration);
        if (slot && !usedSlots.has(`${day}-${slot}`)) {
          if (!updated[day]) updated[day] = [];
          updated[day].push({
            id: "hw-" + hw.id,
            content: `${hw.subject ? `${hw.subject}: ` : ""}${hw.description || hw.what || "Homework"}`,
            time: slot,
            duration,
            done: false,
            homeworkId: hw.id,
            date: hw.date || null,
            source: "autoscheduled",
          });
          usedSlots.add(`${day}-${slot}`);
          placed = true;
          break;
        }
      }
      // if not placed, attempt to search entire week by timeSlots
      if (!placed) {
        for (const day of weekdays) {
          const slot = findSlotOnDay(day, duration);
          if (slot && !usedSlots.has(`${day}-${slot}`)) {
            if (!updated[day]) updated[day] = [];
            updated[day].push({
              id: "hw-" + hw.id,
              content: `${hw.subject ? `${hw.subject}: ` : ""}${hw.description || hw.what || "Homework"}`,
              time: slot,
              duration,
              done: false,
              homeworkId: hw.id,
              date: hw.date || null,
              source: "autoscheduled",
            });
            usedSlots.add(`${day}-${slot}`);
            break;
          }
        }
      }
    }

    setTasks(updated);
  };

  // small UI helper: edit a task (time/duration/content)
  const saveEdit = (day, index, edited) => {
    const updated = { ...tasks };
    if (!updated[day] || !updated[day][index]) return;
    updated[day][index] = { ...updated[day][index], ...edited };
    setTasks(updated);
    setEditing(null);
  };

  // clear all timetable (danger)
  const clearAll = () => {
    if (!window.confirm("Clear all timetable tasks?")) return;
    setTasks({});
    // do not touch homeworkEvents by default
  };

  // derived sorted tasks per day
  const sortedTasks = useMemo(() => {
    const copy = {};
    for (const d of weekdays) {
      copy[d] = (tasks[d] || []).slice().sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    }
    return copy;
  }, [tasks]);

  // small helper to display slot height (30 min => fixed)
  const heightPer30 = 36; // px per 30 min; change to alter grid density

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Topbar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">SchedulorA — Timetable Generator</h1>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-1 bg-indigo-600 text-white rounded-md"
            onClick={() => {
              setShowSetup(true);
            }}
          >
            Setup
          </button>
          <button className="px-3 py-1 bg-green-600 text-white rounded-md" onClick={() => autoSchedule()}>
            🤖 Auto-Schedule
          </button>
          <button className="px-3 py-1 bg-red-500 text-white rounded-md" onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>

      {/* Add quick task */}
      <div className="bg-white p-4 rounded-md shadow mb-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <select
          className="col-span-1 md:col-span-1 p-2 border rounded"
          value={selectedDay}
          onChange={(e) => setSelectedDay(e.target.value)}
        >
          {weekdays.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <select
          className="col-span-1 md:col-span-1 p-2 border rounded"
          value={newTaskTime}
          onChange={(e) => setNewTaskTime(e.target.value)}
        >
          {timeSlots.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          className="col-span-1 md:col-span-1 p-2 border rounded"
          value={newTaskDuration}
          onChange={(e) => setNewTaskDuration(Number(e.target.value))}
        >
          {[30, 45, 60, 90, 120].map((d) => (
            <option key={d} value={d}>
              {d} min
            </option>
          ))}
        </select>

        <input
          className="col-span-2 md:col-span-2 p-2 border rounded"
          placeholder="New task (e.g. Read Chapter 4)"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded"
            onClick={() => addTask()}
          >
            Add
          </button>
        </div>
      </div>

      {/* Grid + columns */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekdays.map((day) => (
            <Droppable droppableId={day} key={day}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="bg-white rounded-lg p-3 shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-lg font-medium">{day}</div>
                      <div className="text-xs text-gray-500">{/* date label can be added */}</div>
                    </div>
                    <div className="text-sm text-gray-600">{(sortedTasks[day] || []).length} tasks</div>
                  </div>

                  {/* time grid / slots (visual only) */}
                  <div className="mb-2">
                    <div className="grid grid-cols-1 gap-2">
                      {(sortedTasks[day] || []).length === 0 && (
                        <div className="text-xs text-gray-400">No scheduled tasks</div>
                      )}
                    </div>
                  </div>

                  {/* tasks listing (draggable cards) */}
                  <div className="space-y-2">
                    {(sortedTasks[day] || []).map((task, idx) => (
                      <Draggable key={task.id} draggableId={task.id} index={idx}>
                        {(prov) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`p-3 rounded border ${task.done ? "bg-green-50" : "bg-white"} shadow-sm`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <div className="text-sm font-medium">
                                  <span className="text-xs text-gray-500 mr-2">{task.time}</span>
                                  <span>{task.content}</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {task.duration || 60} min • {task.source}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex gap-2">
                                  <button
                                    title="Toggle done"
                                    className="p-1 rounded text-green-600"
                                    onClick={() => toggleDone(day, idx)}
                                  >
                                    {task.done ? "↺" : "✔"}
                                  </button>
                                  <button
                                    title="Edit"
                                    className="p-1 rounded text-blue-600"
                                    onClick={() => setEditing({ day, index: idx })}
                                  >
                                    ✎
                                  </button>
                                  <button
                                    title="Delete"
                                    className="p-1 rounded text-red-600"
                                    onClick={() => deleteTask(day, idx)}
                                  >
                                    🗑
                                  </button>
                                </div>
                                <div className="text-xs text-gray-400">{task.homeworkId ? "from TrackorA" : ""}</div>
                              </div>
                            </div>
                          </div>
                        )}
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

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow w-96">
            <h3 className="font-semibold mb-2">Edit task</h3>
            <TaskEditor
              day={editing.day}
              index={editing.index}
              task={tasks[editing.day][editing.index]}
              onSave={(ed) => saveEdit(editing.day, editing.index, ed)}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {/* Setup modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow w-11/12 md:w-2/3 lg:w-1/2">
            <h2 className="text-xl font-semibold mb-4">Initial Setup — Fixed Schedule</h2>
            <p className="text-sm text-gray-600 mb-3">
              Set school hours, preferred study hours, and sleep hours. SchedulorA will avoid these when auto-scheduling.
            </p>
            <div className="grid gap-3 md:grid-cols-3 mb-4">
              <div>
                <label className="block text-sm font-medium">School start</label>
                <input
                  type="time"
                  value={fixedSettings.school.start}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, school: { ...fixedSettings.school, start: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
                <label className="block text-sm font-medium mt-2">School end</label>
                <input
                  type="time"
                  value={fixedSettings.school.end}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, school: { ...fixedSettings.school, end: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Study start</label>
                <input
                  type="time"
                  value={fixedSettings.study.start}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, study: { ...fixedSettings.study, start: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
                <label className="block text-sm font-medium mt-2">Study end</label>
                <input
                  type="time"
                  value={fixedSettings.study.end}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, study: { ...fixedSettings.study, end: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Sleep start</label>
                <input
                  type="time"
                  value={fixedSettings.sleep.start}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, sleep: { ...fixedSettings.sleep, start: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
                <label className="block text-sm font-medium mt-2">Sleep end</label>
                <input
                  type="time"
                  value={fixedSettings.sleep.end}
                  onChange={(e) => setFixedSettings({ ...fixedSettings, sleep: { ...fixedSettings.sleep, end: e.target.value } })}
                  className="p-2 border rounded w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded bg-gray-200" onClick={() => setShowSetup(false)}>
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-indigo-600 text-white"
                onClick={() => {
                  localStorage.setItem(STORAGE_FIXED, JSON.stringify(fixedSettings));
                  setShowSetup(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* TaskEditor component (inline) */
function TaskEditor({ day, index, task, onSave, onClose }) {
  const [content, setContent] = useState(task.content || "");
  const [time, setTime] = useState(task.time || "17:00");
  const [duration, setDuration] = useState(task.duration || 60);

  return (
    <div>
      <div className="mb-2">
        <label className="block text-sm">Content</label>
        <input className="w-full p-2 border rounded" value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-sm">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label className="block text-sm">Duration (min)</label>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full p-2 border rounded">
            {[30, 45, 60, 90, 120, 180].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1 rounded bg-gray-200" onClick={onClose}>
          Cancel
        </button>
        <button
          className="px-3 py-1 rounded bg-indigo-600 text-white"
          onClick={() => onSave({ content, time, duration })}
        >
          Save
        </button>
      </div>
    </div>
  );
}
