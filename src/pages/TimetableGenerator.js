import React, { useState, useEffect } from 'react';
import '../App.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const timeBlocks = [
  '06:00', '07:00', '08:00', '09:00', '10:00',
  '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
];

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState({});
  const [newTask, setNewTask] = useState('');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [selectedTime, setSelectedTime] = useState('17:00');
  const [fixedSchedule, setFixedSchedule] = useState(() => JSON.parse(localStorage.getItem('fixedSchedule')) || []);

  // ✅ Request notification permission once
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, []);

  // ✅ Load saved timetable
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('timetableTasks')) || {};
    setTasks(stored);
  }, []);

  // ✅ Save timetable changes
  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
  }, [tasks]);

  // 🔔 Notification helper
  const sendNotification = (title, body) => {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  // ⏰ Schedule notifications for upcoming tasks
  useEffect(() => {
    Object.keys(tasks).forEach(day => {
      (tasks[day] || []).forEach(task => {
        const now = new Date();
        const taskTime = new Date();
        const [hours, minutes] = task.time.split(':');
        const dayIndex = weekdays.indexOf(day);
        const todayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;

        const diffDays = (dayIndex - todayIndex + 7) % 7;
        taskTime.setDate(now.getDate() + diffDays);
        taskTime.setHours(hours, minutes, 0, 0);

        const diffMs = taskTime - now;
        if (diffMs > 0 && diffMs < 86400000) {
          setTimeout(() => {
            sendNotification('📅 Task Reminder', `${task.content} at ${task.time}`);
          }, diffMs - 5 * 60 * 1000); // 5 min before
        }
      });
    });
  }, [tasks]);

  const addTask = () => {
    if (!newTask.trim()) return;
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];
    updated[selectedDay].push({ content: newTask, time: selectedTime, done: false });
    setTasks(updated);
    setNewTask('');
  };

  const toggleDone = (day, index) => {
    const updated = { ...tasks };
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
  };

  const deleteTask = (day, index) => {
    const updated = { ...tasks };
    const deletedTask = updated[day][index];
    updated[day].splice(index, 1);
    setTasks(updated);

    // 🧩 Sync deletion with TrackorA
    const homework = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const filtered = homework.filter(hw => !deletedTask.content.includes(hw.description));
    localStorage.setItem('homeworkEvents', JSON.stringify(filtered));
  };

  // 🧠 Smart Auto Scheduler: Adds tasks from TrackorA
  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const updated = { ...tasks };

    homeworkList.forEach(hw => {
      const dueDate = new Date(hw.date);
      const dueDay = weekdays[dueDate.getDay() === 0 ? 6 : dueDate.getDay() - 1];

      if (!updated[dueDay]) updated[dueDay] = [];
      updated[dueDay].push({
        content: `📘 ${hw.subject}: ${hw.description}`,
        time: selectedTime,
        done: false
      });

      // 🧩 Auto 4-day Exam Study Plan
      if (hw.type === 'Exam' || hw.subject.toLowerCase().includes('exam')) {
        for (let i = 1; i <= 4; i++) {
          const studyDate = new Date(dueDate);
          studyDate.setDate(studyDate.getDate() - i);
          const studyDay = weekdays[studyDate.getDay() === 0 ? 6 : studyDate.getDay() - 1];
          if (!updated[studyDay]) updated[studyDay] = [];
          updated[studyDay].push({
            content: `🧠 Study Session for ${hw.subject} (${i} days left)`,
            time: '17:00',
            done: false
          });
        }
      }
    });

    setTasks(updated);
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceTasks = Array.from(tasks[source.droppableId] || []);
    const [movedTask] = sourceTasks.splice(source.index, 1);

    const destTasks = Array.from(tasks[destination.droppableId] || []);
    destTasks.splice(destination.index, 0, movedTask);

    const updated = {
      ...tasks,
      [source.droppableId]: sourceTasks,
      [destination.droppableId]: destTasks,
    };

    setTasks(updated);
  };

  return (
    <div className="todoist-layout">
      <div className="topbar">
        <h2>📅 SchedulorA</h2>
        <div className="topbar-controls">
          <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
            {weekdays.map(day => <option key={day}>{day}</option>)}
          </select>
          <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
            {timeBlocks.map(time => <option key={time}>{time}</option>)}
          </select>
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add new task"
          />
          <button onClick={addTask}>➕</button>
          <button onClick={autoScheduleHomework}>🤖 Auto Schedule</button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="day-columns">
          {weekdays.map(day => (
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
                      <Draggable key={`${day}-${index}`} draggableId={`${day}-${index}`} index={index}>
                        {(provided) => (
                          <div
                            className={`task-item ${task.done ? 'done' : ''}`}
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
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
