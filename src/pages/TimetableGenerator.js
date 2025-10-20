// src/pages/TimetableGenerator.js
import React, { useState, useEffect, useRef } from 'react';
import '../App.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Weekday labels starting Monday to match your earlier mapping
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const timeBlocks = [
  '06:00','07:00','08:00','09:00','10:00',
  '11:00','12:00','13:00','14:00','15:00',
  '16:00','17:00','18:00','19:00','20:00','21:00'
];

// helper: parse "HH:MM" to {h,m}
const parseHM = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return { h, m };
};

// helper: format Date -> weekday string like "Monday"
const weekdayOf = (date) => weekdays[(date.getDay() + 6) % 7]; // JS Sun=0, we want Mon=0

// helper: make Date at day (Date) + time "HH:MM"
const makeDateAtTime = (baseDate, timeStr) => {
  const d = new Date(baseDate);
  const { h, m } = parseHM(timeStr);
  d.setHours(h, m, 0, 0);
  return d;
};

// get timeline of candidate slots from now until daysAhead (default 14)
const generateCandidateSlots = (now = new Date(), daysAhead = 14) => {
  const slots = [];
  for (let offset = 0; offset <= daysAhead; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    // for the current day, only include future times
    timeBlocks.forEach((t) => {
      const slotDate = makeDateAtTime(day, t);
      if (slotDate > now) slots.push({ date: slotDate, dayKey: weekdayOf(slotDate), time: t });
    });
  }
  return slots;
};

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('timetableTasks')) || {});
  const [newTask, setNewTask] = useState('');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [selectedTime, setSelectedTime] = useState('17:00');
  const [fixedSchedule, setFixedSchedule] = useState(() => JSON.parse(localStorage.getItem('fixedSchedule')) || []);
  const notificationTimersRef = useRef([]);

  // request permission for notifications once
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
    // reschedule notifications each time tasks change
    clearAllNotificationTimers();
    scheduleNotificationsForTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('fixedSchedule', JSON.stringify(fixedSchedule));
  }, [fixedSchedule]);

  const clearAllNotificationTimers = () => {
    notificationTimersRef.current.forEach((id) => clearTimeout(id));
    notificationTimersRef.current = [];
  };

  const sendNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (e) {
        // ignore
      }
    }
  };

  // Schedule notifications for visible upcoming tasks (next 7 days)
  const scheduleNotificationsForTasks = () => {
    const now = new Date();
    const horizonDays = 7;
    Object.keys(tasks).forEach((dayKey) => {
      (tasks[dayKey] || []).forEach((task) => {
        // convert dayKey + task.time to a real Date near now (next occurrence)
        // We'll look through next horizonDays to find the exact date that matches the weekday & time
        for (let offset = 0; offset <= horizonDays; offset++) {
          const candidate = new Date(now);
          candidate.setDate(now.getDate() + offset);
          if (weekdayOf(candidate) === dayKey) {
            const taskDt = makeDateAtTime(candidate, task.time);
            const msUntil = taskDt.getTime() - now.getTime();
            if (msUntil > 0 && msUntil < 1000 * 60 * 60 * 24 * horizonDays) {
              // notify 5 minutes before when within horizon
              const notifyMs = msUntil - 5 * 60 * 1000;
              if (notifyMs > 0) {
                const id = setTimeout(() => {
                  sendNotification('Task starting soon', `${task.time} — ${task.content}`);
                }, notifyMs);
                notificationTimersRef.current.push(id);
              }
            }
            break;
          }
        }
      });
    });
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push({ content: newTask, time: selectedTime, done: false, id: Date.now().toString() });
    setTasks(updated);
    setNewTask('');
  };

  const toggleDone = (day, index) => {
    const updated = { ...tasks };
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
  };

  // delete task and try to remove corresponding homeworkEvents entry
  const deleteTask = (day, index) => {
    const updated = { ...tasks };
    const [removed] = updated[day].splice(index, 1);
    setTasks(updated);

    // Basic sync: remove matching homeworkEvents entries that match description substring
    try {
      const hw = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
      const hwFiltered = hw.filter((h) => {
        const searchStr = `${h.subject} ${h.description}`.toLowerCase();
        return !(removed.content && removed.content.toLowerCase().includes(h.description?.toLowerCase() || '') && removed.content.toLowerCase().includes(h.subject?.toLowerCase() || '') );
      });
      localStorage.setItem('homeworkEvents', JSON.stringify(hwFiltered));
    } catch (e) {
      // ignore parsing errors
    }
  };

  // Auto schedule homework taking current time into account.
  // Strategy:
  //  - Build list of candidate slots (from now -> next N days)
  //  - For each homework event, try to place it at earliest candidate slot BEFORE or ON due date (if provided). If no due date, place earliest after now.
  //  - Respect fixedSchedule blocks and existing tasks.
  //  - For Exams: also add study sessions 4 days before (at a default study time).
  const autoScheduleHomework = (daysHorizon = 14) => {
    const hwList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    if (!hwList.length) return;
    const now = new Date();
    const candidates = generateCandidateSlots(now, daysHorizon); // [{date,dayKey,time}, ...]
    const updated = { ...tasks };
    const used = new Set(); // track taken blocks as `${YYYY-MM-DD}-${time}`

    // mark already taken slots in used
    Object.entries(updated).forEach(([dayKey, arr]) => {
      (arr || []).forEach((t) => {
        // try to find actual date for that dayKey in next daysHorizon range
        for (let off=0; off<=daysHorizon; off++){
          const d = new Date(now); d.setDate(now.getDate()+off);
          if (weekdayOf(d) === dayKey) {
            const dateKey = d.toISOString().slice(0,10); // YYYY-MM-DD
            used.add(`${dateKey}-${t.time}`);
            break;
          }
        }
      });
    });

    const tryReserveSlot = (latestDateAllowed = null) => {
      // find first candidate with date <= latestDateAllowed (if provided) and not in fixedSchedule
      for (const c of candidates) {
        const dateKey = c.date.toISOString().slice(0,10);
        if (latestDateAllowed && c.date > latestDateAllowed) continue;
        if (fixedSchedule.includes(`${c.dayKey}-${c.time}`)) continue;
        if (used.has(`${dateKey}-${c.time}`)) continue;
        // accept
        used.add(`${dateKey}-${c.time}`);
        return { date: c.date, dayKey: c.dayKey, time: c.time };
      }
      return null;
    };

    for (const hw of hwList) {
      // compute latest allowed date (dueDate at 23:59) if hw.date exists
      let latest = null;
      if (hw.date) {
        const d = new Date(hw.date);
        d.setHours(23,59,59,999);
        latest = d;
      }
      // find earliest slot BEFORE 'latest' if present, otherwise earliest after now
      const slot = tryReserveSlot(latest);
      if (slot) {
        if (!updated[slot.dayKey]) updated[slot.dayKey] = [];
        updated[slot.dayKey].push({
          content: `📘 ${hw.subject}: ${hw.description}`,
          time: slot.time,
          done: false,
          id: `hw-${hw.id || Date.now()}`
        });
      }

      // If exam, schedule 4-day study plan before exam date (if hw.date exists)
      if ((hw.type && hw.type.toLowerCase().includes('exam')) || (hw.description && hw.description.toLowerCase().includes('exam'))) {
        if (hw.date) {
          const due = new Date(hw.date);
          for (let i = 1; i <= 4; i++) {
            const studyDay = new Date(due);
            studyDay.setDate(due.getDate() - i);
            // choose a default evening study time (e.g., 18:00). Find nearest free time on that day.
            const dayCandidates = candidates.filter(c => c.dayKey === weekdayOf(studyDay) && c.date.toISOString().slice(0,10) === studyDay.toISOString().slice(0,10));
            const chosen = dayCandidates.find(c => !fixedSchedule.includes(`${c.dayKey}-${c.time}`) && !used.has(`${c.date.toISOString().slice(0,10)}-${c.time}`));
            if (chosen) {
              const dk = chosen.dayKey;
              if (!updated[dk]) updated[dk] = [];
              updated[dk].push({
                content: `🧠 Study ${hw.subject} — ${i} days before exam`,
                time: chosen.time,
                done: false,
                id: `study-${hw.id || Date.now()}-${i}`
              });
              used.add(`${chosen.date.toISOString().slice(0,10)}-${chosen.time}`);
            }
          }
        }
      }
    }

    // Sort each day's tasks by time
    Object.keys(updated).forEach((dayKey) => {
      updated[dayKey].sort((a, b) => timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time));
    });

    setTasks(updated);
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceTasks = Array.from(tasks[source.droppableId] || []);
    const [moved] = sourceTasks.splice(source.index, 1);

    const destTasks = Array.from(tasks[destination.droppableId] || []);
    // if you want to update moved task's time to a default or keep same — keeping same time here
    destTasks.splice(destination.index, 0, moved);

    const updated = {
      ...tasks,
      [source.droppableId]: sourceTasks,
      [destination.droppableId]: destTasks,
    };
    setTasks(updated);
  };

  const handleFixedToggle = (block) => {
    let updated = [...fixedSchedule];
    if (updated.includes(block)) updated = updated.filter(b => b !== block);
    else updated.push(block);
    setFixedSchedule(updated);
  };

  return (
    <div className="todoist-layout">
      <div className="topbar">
        <h2>📅 SchedulorA</h2>
        <div className="topbar-controls">
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map(day => <option key={day} value={day}>{day}</option>)}
          </select>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {timeBlocks.map(time => <option key={time} value={time}>{time}</option>)}
          </select>
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add new task"
          />
          <button onClick={addTask}>➕</button>
          <button onClick={() => autoScheduleHomework(14)}>🤖 Auto-Schedule (14d)</button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="day-columns">
          {weekdays.map((day) => (
            <Droppable key={day} droppableId={day}>
              {(provided) => (
                <div
                  className="day-column"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  <h4>{day}</h4>
                  {(tasks[day] || [])
                    .sort((a, b) => timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time))
                    .map((task, index) => (
                      <Draggable key={task.id || `${day}-${index}`} draggableId={task.id || `${day}-${index}`} index={index}>
                        {(prov) => (
                          <div
                            className={`task-item ${task.done ? 'done' : ''}`}
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                          >
                            <div>{task.time} – {task.content}</div>
                            <div className="task-actions">
                              <button onClick={() => toggleDone(day, index)}>✅</button>
                              <button onClick={() => deleteTask(day, index)}>🗑️</button>
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
  );
};

export default TimetableGenerator;
