// src/pages/TimetableGenerator.js
import React, { useEffect, useState, useRef } from "react";
import '../App.css';
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

/*
  SchedulorA 2.0 - TimetableGenerator
  - Vertical 24h columns for each weekday
  - Drag & drop tasks between days and reposition in time (snaps to 30 min)
  - Auto-schedule homework and exam-study sessions (4 days before exam)
  - Syncs with localStorage keys: "homeworkEvents" and "timetableTasks"
*/

const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// generate 30-min time slots from 00:00 to 23:30
const generateSlots = () => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${h.toString().padStart(2,'0')}:00`);
    slots.push(`${h.toString().padStart(2,'0')}:30`);
  }
  return slots;
};
const TIME_SLOTS = generateSlots();

const nowToHHMM = (date = new Date()) => {
  return date.getHours().toString().padStart(2,'0') + ':' + Math.floor(date.getMinutes() / 30) * 30
    .toString().padStart(2,'0');
};

const snapToSlot = (hhmm) => {
  // Ensure hh:mm is one of TIME_SLOTS; if mm not 00/30 round down
  const [h, m] = hhmm.split(':').map(Number);
  const mm = m >= 30 ? '30' : '00';
  return `${h.toString().padStart(2,'0')}:${mm}`;
};

const minutesToPx = (min) => {
  // visual scale: 30 min = 30px -> 1 min = 1px
  // tweak as you like for height scale
  return Math.round(min);
};

function parseHHMM(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function hhmmFromMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2,'0')}`;
}

const STORAGE_KEY = "timetableTasks";

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY)) || {});
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [selectedStart, setSelectedStart] = useState(nowToHHMM());
  const [newTitle, setNewTitle] = useState('');
  const [schoolStart, setSchoolStart] = useState('07:30');
  const [schoolEnd, setSchoolEnd] = useState('15:15');
  const [studyStart, setStudyStart] = useState('16:00');
  const [studyEnd, setStudyEnd] = useState('21:00');
  const [fixedBlocks, setFixedBlocks] = useState(() => JSON.parse(localStorage.getItem('fixedSchedule')) || []);
  const [modalTask, setModalTask] = useState(null); // task object for editor modal
  const containerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('fixedSchedule', JSON.stringify(fixedBlocks));
  }, [fixedBlocks]);

  // helper: create a new task object
  const createTask = ({ title, day, start, duration = 60, type = 'task', originId = null }) => {
    return {
      id: 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6),
      title,
      start: snapToSlot(start),
      duration, // minutes
      type,
      done: false,
      originId, // optional pointer to homeworkEvents id in TrackorA
    };
  };

  const addTask = () => {
    if (!newTitle.trim()) return;
    const t = createTask({ title: newTitle.trim(), day: selectedDay, start: snapToSlot(selectedStart), duration: 60, type: 'task' });
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push(t);
    setTasks(updated);
    setNewTitle('');
    notify(`Task added: ${t.title}`, 5);
  };

  // Notification helper
  const notify = (text, timeoutSeconds = 5) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      const n = new Notification("SchedulorA", { body: text });
      if (timeoutSeconds) setTimeout(() => n.close(), timeoutSeconds * 1000);
    } else {
      Notification.requestPermission();
    }
  };

  // Toggle a fixed block (format day-HH:MM-durationMinutes)
  const toggleFixed = (day, hhmm, duration = 60) => {
    const key = `${day}-${hhmm}-${duration}`;
    let updated = [...fixedBlocks];
    if (updated.includes(key)) updated = updated.filter(k => k !== key);
    else updated.push(key);
    setFixedBlocks(updated);
  };

  // Remove task and if it has originId, sync with TrackorA homeworkEvents
  const removeTask = (day, taskId) => {
    const updated = { ...tasks };
    const idx = updated[day]?.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const [removed] = updated[day].splice(idx,1);
    setTasks(updated);

    // remove from homeworkEvents if originId present
    if (removed.originId) {
      const hwAll = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
      const filtered = hwAll.filter(hw => hw.id !== removed.originId);
      localStorage.setItem('homeworkEvents', JSON.stringify(filtered));
    }
    notify(`Deleted: ${removed.title}`, 3);
  };

  // Toggle done
  const toggleDone = (day, id) => {
    const updated = { ...tasks };
    const t = updated[day].find(x => x.id === id);
    if (t) t.done = !t.done;
    setTasks(updated);
  };

  // Called when a drag ends
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    const fromDay = source.droppableId;
    const toDay = destination.droppableId;

    const sourceList = Array.from(tasks[fromDay] || []);
    const [moved] = sourceList.splice(source.index, 1);

    const destList = Array.from(tasks[toDay] || []);

    // Estimate new start time based on index position -> keep same start, but if moved within same column reorder
    // For better UX we allow the user to edit start time in modal; for now keep moved task same start.
    destList.splice(destination.index, 0, moved);

    const updated = { ...tasks, [fromDay]: sourceList, [toDay]: destList };
    setTasks(updated);
  };

  // open editor modal
  const openEditor = (day, task) => {
    setModalTask({ ...task, day });
  };

  const saveModalTask = (edited) => {
    const updated = { ...tasks };
    const list = updated[edited.day] || [];
    const idx = list.findIndex(t => t.id === edited.id);
    if (idx !== -1) {
      // snap start to slot and ensure duration numeric
      edited.start = snapToSlot(edited.start);
      edited.duration = Number(edited.duration) || 60;
      list[idx] = edited;
      updated[edited.day] = list;
      setTasks(updated);
    }
    setModalTask(null);
  };

  // ===== AUTO SCHEDULER =====
  // schedule homework into free study slots while respecting fixed schedule and school hours
  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    if (!homeworkList.length) {
      alert("No homeworkEvents found in localStorage (TrackorA should save to key 'homeworkEvents').");
      return;
    }

    // copy existing tasks (don't mutate state directly)
    const updated = { ...tasks };
    const used = new Set(); // used day-slot strings

    // mark used slots from existing tasks
    for (const d of weekdays) {
      (updated[d] || []).forEach(t => {
        const startMin = parseHHMM(t.start);
        const slotsCount = Math.ceil(t.duration / 30);
        let mm = startMin;
        for (let s = 0; s < slotsCount; s++) {
          used.add(`${d}-${hhmmFromMinutes(mm)}`);
          mm += 30;
        }
      });
    }

    // helper to check if slot blocked (returns true if blocked)
    const isBlocked = (day, hhmm) => {
      // school hours
      const sMin = parseHHMM(schoolStart);
      const eMin = parseHHMM(schoolEnd);
      const curMin = parseHHMM(hhmm);
      if (curMin >= sMin && curMin < eMin) return true;
      // fixedBlocks check (blocks by exact slot)
      for (const b of fixedBlocks) {
        // b format day-HH:MM-duration
        const [bd, btime, bdur] = b.split('-');
        if (bd !== day) continue;
        const start = parseHHMM(btime);
        const dur = Number(bdur || 60);
        if (curMin >= start && curMin < start + dur) return true;
      }
      return false;
    };

    // place exam study sessions first
    const examEvents = homeworkList.filter(hw => /exam|test/i.test(hw.description || hw.subject || ""));
    for (const ex of examEvents) {
      // parse exam date string -> try to schedule study sessions 4 days before
      // homeworkEvents should contain date in human readable form; fallback: schedule into next available
      // We'll schedule study blocks 4 days before the exam date at preferred study hours
      let examDate = new Date(ex.date || Date.now());
      // if string like "Sun Jul 20 2025" Date can parse
      if (typeof ex.date === 'string') examDate = new Date(ex.date);
      // compute start day (4 days before)
      const startDay = new Date(examDate);
      startDay.setDate(examDate.getDate() - 4);

      // generate 4 days list
      const daysToFill = [];
      for (let i = 0; i < 4; i++) {
        const d = new Date(startDay);
        d.setDate(startDay.getDate() + i);
        daysToFill.push(d);
      }

      // default 2 hours total study (can be adjusted); we will split into 1hr/day as you wanted default 1hr
      const totalMinutes = 60 * 4; // 4 hours total across 4 days -> 1 hr/day
      const perDay = Math.max(30, Math.round(totalMinutes / daysToFill.length)); // default 60

      for (const dDate of daysToFill) {
        const dayName = weekdays[dDate.getDay() === 0 ? 6 : dDate.getDay()-1]; // map Sun=0 -> index 6
        // find first free slot in study window
        let placed = false;
        for (let minute = parseHHMM(studyStart); minute <= parseHHMM(studyEnd) - perDay; minute += 30) {
          const hh = hhmmFromMinutes(minute);
          if (isBlocked(dayName, hh)) continue;
          if (used.has(`${dayName}-${hh}`)) continue;
          // place study session of perDay minutes starting at hh
          const studyTask = createTask({
            title: `Study: ${ex.subject}`,
            day: dayName,
            start: hh,
            duration: perDay,
            type: 'study',
            originId: ex.id,
          });
          if (!updated[dayName]) updated[dayName] = [];
          updated[dayName].push(studyTask);

          // mark used slots
          let m = parseHHMM(hh);
          const slotsCount = Math.ceil(perDay / 30);
          for (let s = 0; s < slotsCount; s++) {
            used.add(`${dayName}-${hhmmFromMinutes(m)}`);
            m += 30;
          }
          placed = true;
          break;
        }
        // if not placed, try next day - we prioritized study window; if can't find, skip
      }
    }

    // schedule regular homework (non-exam)
    const normalHw = homeworkList.filter(hw => !/exam|test/i.test(hw.description || hw.subject || ""));
    for (const hw of normalHw) {
      // try putting it into the next 7 days starting today
      const today = new Date();
      let scheduled = false;
      for (let dOff = 0; dOff < 7 && !scheduled; dOff++) {
        const d = new Date(today);
        d.setDate(today.getDate() + dOff);
        const dayName = weekdays[d.getDay() === 0 ? 6 : d.getDay()-1];
        for (let minute = parseHHMM(studyStart); minute <= parseHHMM(studyEnd) - 60; minute += 30) {
          const hh = hhmmFromMinutes(minute);
          if (isBlocked(dayName, hh)) continue;
          if (used.has(`${dayName}-${hh}`)) continue;
          // place 60-min homework block
          const hwTask = createTask({
            title: `${hw.subject}: ${hw.description}`,
            day: dayName,
            start: hh,
            duration: 60,
            type: 'homework',
            originId: hw.id,
          });
          if (!updated[dayName]) updated[dayName] = [];
          updated[dayName].push(hwTask);
          // mark used slots
          let m = parseHHMM(hh);
          for (let s = 0; s < 2; s++) { // 2 * 30min = 60
            used.add(`${dayName}-${hhmmFromMinutes(m)}`);
            m += 30;
          }
          scheduled = true;
          break;
        }
      }
    }

    setTasks(updated);
    notify("Auto-schedule complete");
  };

  // helper: compute vertical position in pixels for task -- based on start minutes since 00:00
  const computeTopPx = (hhmm) => {
    const min = parseHHMM(hhmm);
    // mapping 1 minute -> 1px (we used minutesToPx), you can adjust scale
    return minutesToPx(min);
  };

  // UI renderers
  return (
    <div className="schedulor-page">
      <div className="schedulor-top">
        <div className="brand">
          <h1>SchedulorA — Timetable Generator</h1>
        </div>

        <div className="controls">
          <div className="control-row">
            <label>School start</label>
            <input type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} />
            <label>School end</label>
            <input type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} />
            <label>Study start</label>
            <input type="time" value={studyStart} onChange={(e) => setStudyStart(e.target.value)} />
            <label>Study end</label>
            <input type="time" value={studyEnd} onChange={(e) => setStudyEnd(e.target.value)} />
          </div>

          <div className="control-row">
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {weekdays.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <input type="time" value={selectedStart} onChange={(e) => setSelectedStart(e.target.value)} />
            <input placeholder="Task title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button onClick={addTask} className="btn">➕ Add</button>
            <button onClick={autoScheduleHomework} className="btn primary">🤖 Auto-schedule</button>
          </div>
        </div>
      </div>

      <div className="schedule-area" ref={containerRef}>
        <div className="time-column">
          {TIME_SLOTS.map(slot => (
            <div key={slot} className="time-slot">
              <div className="time-label">{slot}</div>
            </div>
          ))}
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="days-columns">
            {weekdays.map(day => (
              <Droppable droppableId={day} key={day}>
                {(provided) => (
                  <div className="day-column" ref={provided.innerRef} {...provided.droppableProps}>
                    <div className="day-header">{day}</div>
                    <div className="day-body">
                      {/* render fixed blocks as faded overlay */}
                      {fixedBlocks.filter(b => b.startsWith(`${day}-`)).map((b, idx) => {
                        const [, start, dur] = b.split('-');
                        const top = computeTopPx(start);
                        const height = minutesToPx(Number(dur));
                        return <div key={b} className="fixed-block" style={{ top, height }} />;
                      })}

                      {/* tasks */}
                      {(tasks[day] || []).map((task, index) => {
                        const top = computeTopPx(task.start);
                        const height = minutesToPx(task.duration);
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(prov) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={`task-card ${task.type} ${task.done ? 'done' : ''}`}
                                style={{ top, height }}
                                onDoubleClick={() => openEditor(day, task)}
                                title={`${task.title} — ${task.start} (${task.duration}m)`}
                              >
                                <div className="task-info">
                                  <div className="task-time">{task.start}</div>
                                  <div className="task-title">{task.title}</div>
                                </div>
                                <div className="task-actions">
                                  <button onClick={() => toggleDone(day, task.id)}>✔</button>
                                  <button onClick={() => removeTask(day, task.id)}>🗑</button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}

                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Modal editor */}
      {modalTask && (
        <div className="modal-overlay" onClick={() => setModalTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Task</h3>
            <label>Title</label>
            <input value={modalTask.title} onChange={(e) => setModalTask({ ...modalTask, title: e.target.value })} />
            <label>Day</label>
            <select value={modalTask.day} onChange={(e) => setModalTask({ ...modalTask, day: e.target.value })}>
              {weekdays.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <label>Start</label>
            <input type="time" value={modalTask.start} onChange={(e) => setModalTask({ ...modalTask, start: e.target.value })} />
            <label>Duration (minutes)</label>
            <input type="number" value={modalTask.duration} onChange={(e) => setModalTask({ ...modalTask, duration: Number(e.target.value) })} />
            <label>Type</label>
            <select value={modalTask.type} onChange={(e) => setModalTask({ ...modalTask, type: e.target.value })}>
              <option value="task">Task</option>
              <option value="homework">Homework</option>
              <option value="exam">Exam</option>
              <option value="study">Study</option>
              <option value="other">Other</option>
            </select>

            <div className="modal-actions">
              <button onClick={() => saveModalTask(modalTask)} className="btn">Save</button>
              <button onClick={() => setModalTask(null)} className="btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableGenerator;
