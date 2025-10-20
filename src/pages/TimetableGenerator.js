// src/pages/SchedulorA.js
import React, { useState, useEffect, useRef } from 'react';
import '../App.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const timeBlocks = [
  '06:00','07:00','08:00','09:00','10:00',
  '11:00','12:00','13:00','14:00','15:00',
  '16:00','17:00','18:00','19:00','20:00','21:00'
];

// helper
const weekdayOf = (d) => weekdays[(d.getDay() + 6) % 7];
const parseHM = (s) => { const [h,m]=s.split(':').map(Number); return {h,m}; };
const makeDateAtTime = (date, time) => {
  const d = new Date(date);
  const {h,m} = parseHM(time);
  d.setHours(h,m,0,0);
  return d;
};

const SchedulorA = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('timetableTasks')) || {});
  const [newTask, setNewTask] = useState('');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [selectedTime, setSelectedTime] = useState('17:00');
  const notifyRef = useRef([]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
    clearTimers();
    scheduleNotifs();
  }, [tasks]);

  const clearTimers = () => {
    notifyRef.current.forEach(clearTimeout);
    notifyRef.current = [];
  };

  const sendNotif = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };

  const scheduleNotifs = () => {
    const now = new Date();
    Object.keys(tasks).forEach(day => {
      (tasks[day] || []).forEach(task => {
        const d = new Date();
        while (weekdayOf(d) !== day) d.setDate(d.getDate() + 1);
        const when = makeDateAtTime(d, task.time);
        const diff = when - now - 10 * 60 * 1000;
        if (diff > 0 && diff < 7 * 24 * 3600 * 1000) {
          const id = setTimeout(() => sendNotif('Upcoming Task', `${task.content} at ${task.time}`), diff);
          notifyRef.current.push(id);
        }
      });
    });
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push({ content: newTask, time: selectedTime, done: false });
    setTasks(updated);
    setNewTask('');
  };

  const toggleDone = (day, i) => {
    const updated = { ...tasks };
    updated[day][i].done = !updated[day][i].done;
    setTasks(updated);
  };

  const deleteTask = (day, i) => {
    const updated = { ...tasks };
    const removed = updated[day].splice(i, 1)[0];
    setTasks(updated);

    // also remove from homeworkEvents
    const allHW = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const filtered = allHW.filter(
      (hw) =>
        !removed.content.includes(hw.subject) ||
        !removed.content.includes(hw.description)
    );
    localStorage.setItem('homeworkEvents', JSON.stringify(filtered));
  };

  // Auto schedule everything from TrackorA
  const autoSchedule = () => {
    const hwList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const updated = { ...tasks };
    const now = new Date();

    for (const hw of hwList) {
      const due = new Date(hw.date);
      const dayKey = weekdayOf(due);
      const time = '17:00'; // default
      if (!updated[dayKey]) updated[dayKey] = [];
      // skip if already scheduled
      const exists = updated[dayKey].some(t => t.content.includes(hw.subject) && t.content.includes(hw.description));
      if (!exists) {
        updated[dayKey].push({
          content: `📘 ${hw.subject}: ${hw.description}`,
          time,
          done: false
        });
      }

      // 4-day exam planner
      if (hw.description.toLowerCase().includes('exam') || hw.type?.toLowerCase().includes('exam')) {
        for (let i = 1; i <= 4; i++) {
          const study = new Date(due);
          study.setDate(due.getDate() - i);
          const dk = weekdayOf(study);
          if (!updated[dk]) updated[dk] = [];
          const existStudy = updated[dk].some(t => t.content.includes('Study') && t.content.includes(hw.subject));
          if (!existStudy) {
            updated[dk].push({
              content: `🧠 Study ${hw.subject} — ${i} days before exam`,
              time: '18:00',
              done: false
            });
          }
        }
      }
    }

    Object.keys(updated).forEach(day => {
      updated[day].sort((a,b) => timeBlocks.indexOf(a.time)-timeBlocks.indexOf(b.time));
    });
    setTasks(updated);
  };

  const onDragEnd = (res) => {
    const { source, destination } = res;
    if (!destination) return;
    const src = Array.from(tasks[source.droppableId] || []);
    const [moved] = src.splice(source.index, 1);
    const dest = Array.from(tasks[destination.droppableId] || []);
    dest.splice(destination.index, 0, moved);
    const updated = { ...tasks, [source.droppableId]: src, [destination.droppableId]: dest };
    setTasks(updated);
  };

  return (
    <div className="todoist-layout">
      <div className="topbar">
        <h2>📅 SchedulorA</h2>
        <div className="topbar-controls">
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {timeBlocks.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add task"
          />
          <button onClick={addTask}>➕</button>
          <button onClick={autoSchedule}>🤖 Auto Schedule</button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="day-columns">
          {weekdays.map((day) => (
            <Droppable key={day} droppableId={day}>
              {(provided) => (
                <div className="day-column" {...provided.droppableProps} ref={provided.innerRef}>
                  <h4>{day}</h4>
                  {(tasks[day] || []).map((task, i) => (
                    <Draggable key={`${day}-${i}`} draggableId={`${day}-${i}`} index={i}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          className={`task-item ${task.done ? 'done' : ''}`}
                        >
                          <div>{task.time} — {task.content}</div>
                          <div className="task-actions">
                            <button onClick={() => toggleDone(day, i)}>✅</button>
                            <button onClick={() => deleteTask(day, i)}>🗑️</button>
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

export default SchedulorA;
