import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "../App.css";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const timeBlocks = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, "0")}:00`
);

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState({});
  const [newTask, setNewTask] = useState("");
  const [selectedDay, setSelectedDay] = useState("Monday");
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [schoolTime, setSchoolTime] = useState({
    start: "08:00",
    end: "15:00",
  });
  const [studyTime, setStudyTime] = useState({
    start: "16:00",
    end: "21:00",
  });

  // Load saved tasks
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("timetableTasks")) || {};
    setTasks(stored);
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("timetableTasks", JSON.stringify(tasks));
  }, [tasks]);

  // Add manual task
  const addTask = () => {
    if (!newTask.trim()) return;
    const updated = { ...tasks };
    if (!updated[selectedDay]) updated[selectedDay] = [];

    updated[selectedDay].push({
      content: newTask,
      time: selectedTime,
      duration: selectedDuration,
      done: false,
    });

    setTasks(updated);
    setNewTask("");
  };

  // Mark task as done
  const toggleDone = (day, index) => {
    const updated = { ...tasks };
    updated[day][index].done = !updated[day][index].done;
    setTasks(updated);
  };

  // Delete a task
  const deleteTask = (day, index) => {
    const updated = { ...tasks };
    updated[day].splice(index, 1);
    setTasks(updated);
  };

  // Auto-scheduler
  const autoScheduleHomework = () => {
    const homeworkList = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    if (!homeworkList.length) {
      alert("No homework events found!");
      return;
    }

    const updated = { ...tasks };
    const studyStart = parseInt(studyTime.start.split(":")[0]);
    const studyEnd = parseInt(studyTime.end.split(":")[0]);

    homeworkList.forEach((hw) => {
      const isExam = /exam|test/i.test(hw.description || "");
      const baseDayIndex = new Date(hw.date).getDay();
      const examSessions = isExam ? 4 : 1;

      for (let i = 0; i < examSessions; i++) {
        const dayIndex = (baseDayIndex - 4 + i + 7) % 7;
        const dayName = weekdays[dayIndex];
        if (!updated[dayName]) updated[dayName] = [];

        let timeSlot = `${(studyStart + i) % 24}:00`;
        if (parseInt(timeSlot) > studyEnd) timeSlot = studyStart + ":00";

        updated[dayName].push({
          content: isExam
            ? `📘 Study for ${hw.subject || "Exam"}`
            : `📕 ${hw.subject || "Homework"}: ${hw.description}`,
          time: timeSlot,
          duration: 60,
          done: false,
        });
      }
    });

    setTasks(updated);
    alert("✅ Auto-schedule complete!");
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const newTasks = { ...tasks };

    const [moved] = newTasks[source.droppableId].splice(source.index, 1);
    newTasks[destination.droppableId].splice(destination.index, 0, moved);

    setTasks(newTasks);
  };

  return (
    <div className="scheduler-container">
      <div className="top-controls">
        <h2>📅 SchedulorA 2.1</h2>
        <div className="inputs-row">
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
          >
            {weekdays.map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
          />
          <select
            value={selectedDuration}
            onChange={(e) => setSelectedDuration(Number(e.target.value))}
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hour</option>
            <option value={120}>2 hours</option>
          </select>
          <input
            type="text"
            placeholder="Add new task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
          />
          <button onClick={addTask}>➕</button>
          <button onClick={autoScheduleHomework}>🤖 Auto Schedule</button>
        </div>
      </div>

      <div className="fixed-times">
        <h4>🕒 Set School & Study Hours</h4>
        <div className="time-inputs">
          <label>
            School:{" "}
            <input
              type="time"
              value={schoolTime.start}
              onChange={(e) =>
                setSchoolTime({ ...schoolTime, start: e.target.value })
              }
            />{" "}
            -{" "}
            <input
              type="time"
              value={schoolTime.end}
              onChange={(e) =>
                setSchoolTime({ ...schoolTime, end: e.target.value })
              }
            />
          </label>
          <label>
            Study:{" "}
            <input
              type="time"
              value={studyTime.start}
              onChange={(e) =>
                setStudyTime({ ...studyTime, start: e.target.value })
              }
            />{" "}
            -{" "}
            <input
              type="time"
              value={studyTime.end}
              onChange={(e) =>
                setStudyTime({ ...studyTime, end: e.target.value })
              }
            />
          </label>
        </div>
      </div>

      <div className="calendar-container">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="calendar-grid">
            {weekdays.map((day) => (
              <Droppable droppableId={day} key={day}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="day-column"
                  >
                    <h3>{day}</h3>
                    {(tasks[day] || []).map((task, index) => (
                      <Draggable
                        key={`${day}-${index}`}
                        draggableId={`${day}-${index}`}
                        index={index}
                      >
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`task ${
                              task.done ? "task-done" : "task-pending"
                            }`}
                          >
                            <div className="task-time">
                              {task.time} ({task.duration}m)
                            </div>
                            <div className="task-content">{task.content}</div>
                            <div className="task-buttons">
                              <button onClick={() => toggleDone(day, index)}>
                                ✅
                              </button>
                              <button onClick={() => deleteTask(day, index)}>
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
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
};

export default TimetableGenerator;
