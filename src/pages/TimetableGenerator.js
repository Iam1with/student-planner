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

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('timetableTasks')) || {};
    setTasks(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
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
    updated[day].splice(index, 1);
    setTasks(updated);
  };

  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const updated = { ...tasks };
    let usedSlots = new Set();

    for (const hw of homeworkList) {
      for (const day of weekdays) {
        for (const time of timeBlocks) {
          if (
            (!fixedSchedule.includes(`${day}-${time}`)) &&
            !(updated[day] || []).some(t => t.time === time) &&
            !usedSlots.has(`${day}-${time}`)
          ) {
            if (!updated[day]) updated[day] = [];
            updated[day].push({
              content: `📘 ${hw.subject}: ${hw.description}`,
              time,
              done: false
            });
            usedSlots.add(`${day}-${time}`);
            break;
          }
        }
      }
    }
    setTasks(updated);
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;

    const sourceTasks = Array.from(tasks[source.droppableId] || []);
    const [movedTask] = sourceTasks.splice(source.index, 1);

    const destTasks = Array.from(tasks[destination.droppableId] || []);
    movedTask.time = selectedTime; // Optionally allow time override
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
        <h2>📅 Timetable Generator</h2>
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
          <button onClick={autoScheduleHomework}>🤖</button>
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
