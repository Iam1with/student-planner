import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

export default function SmartScheduler() {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const [tasks, setTasks] = useState({});
  const [fixedSchedule, setFixedSchedule] = useState([]);
  const [timeBlocks, setTimeBlocks] = useState(Array.from({ length: 24 }, (_, i) => `${i}:00`));
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showFixedBar, setShowFixedBar] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const parseTimeToHour = (time) => parseInt(time.split(':')[0], 10);
  const toggleFixedBlock = (day, hour) => {
    const blockKey = `${day}-${hour}`;
    setFixedSchedule((prev) =>
      prev.includes(blockKey) ? prev.filter((b) => b !== blockKey) : [...prev, blockKey]
    );
  };

  const addTask = (day, content) => {
    const hour = Math.max(currentTime.getHours() + 1, 8);
    const newTask = {
      id: `${day}-${Date.now()}`,
      content,
      time: `${hour}:00`,
      duration: 60,
      done: false,
    };
    setTasks((prev) => ({ ...prev, [day]: [...(prev[day] || []), newTask] }));
  };

  const toggleDone = (day, index) => {
    const dayTasks = [...(tasks[day] || [])];
    dayTasks[index].done = !dayTasks[index].done;
    setTasks({ ...tasks, [day]: dayTasks });
  };

  const deleteTask = (day, index) => {
    const dayTasks = [...(tasks[day] || [])];
    dayTasks.splice(index, 1);
    setTasks({ ...tasks, [day]: dayTasks });
  };

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const srcDay = source.droppableId;
    const destDay = destination.droppableId;
    const srcTasks = Array.from(tasks[srcDay] || []);
    const [removed] = srcTasks.splice(source.index, 1);
    const destTasks = Array.from(tasks[destDay] || []);
    destTasks.splice(destination.index, 0, removed);
    setTasks({ ...tasks, [srcDay]: srcTasks, [destDay]: destTasks });
  };

  const renderTimeIndicator = () => {
    const top = (currentTime.getHours() + currentTime.getMinutes() / 60) * 60;
    return (
      <div
        style={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height: '2px',
          background: 'red',
          zIndex: 20,
        }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Scheduler A 2.0</h1>
        <button
          onClick={() => setShowFixedBar(!showFixedBar)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
        >
          {showFixedBar ? 'Hide Fixed Bar' : 'Show Fixed Bar'}
        </button>
      </div>

      {showFixedBar && (
        <div className="bg-gray-200 rounded p-2 mb-4 flex justify-center gap-2">
          {weekdays.map((day) => (
            <button
              key={day}
              className="bg-white px-3 py-1 rounded hover:bg-blue-100"
              onClick={() => toggleFixedBlock(day, '8')}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-5 gap-2">
          {weekdays.map((day) => (
            <Droppable key={day} droppableId={day}>
              {(provided) => (
                <div
                  className="bg-white rounded-lg shadow-md p-2 relative h-[1440px] overflow-y-auto"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  <div className="sticky top-0 bg-white z-10 font-semibold border-b mb-1">
                    {day}
                    <button
                      className="ml-2 bg-green-500 text-white text-xs px-2 py-1 rounded"
                      onClick={() => addTask(day, 'New Task')}
                    >
                      +
                    </button>
                  </div>

                  {renderTimeIndicator()}

                  {timeBlocks.map((hour, i) => (
                    <div key={i} className="border-t h-[60px] text-xs text-gray-400 pl-1">
                      {hour}
                    </div>
                  ))}

                  {(tasks[day] || []).map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`absolute left-2 right-2 p-2 rounded shadow-md text-sm ${
                            task.done ? 'bg-green-100 border-l-4 border-green-500' : 'bg-yellow-100 border-l-4 border-yellow-400'
                          }`}
                          style={{
                            top: parseTimeToHour(task.time) * 60,
                            height: `${task.duration}px`,
                            ...provided.draggableProps.style,
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span>{task.content}</span>
                            <div className="flex gap-1">
                              <button
                                className="text-green-600 text-xs"
                                onClick={() => toggleDone(day, index)}
                              >
                                ✓
                              </button>
                              <button
                                className="text-red-600 text-xs"
                                onClick={() => deleteTask(day, index)}
                              >
                                ✕
                              </button>
                            </div>
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
}
