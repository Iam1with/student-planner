// src/pages/TimetableGenerator.js
import React, { useState, useEffect, useRef } from 'react';
import '../App.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

/*
  TimetableGenerator
  - Week view (7 days starting today)
  - Drag & drop tasks between days
  - Add tasks on left controls
  - Auto-schedule homework from localStorage 'homeworkEvents'
  - 4-day exam planner (for items with type === 'Exam')
  - Fixed schedule blocks (stored as ["YYYY-MM-DD-HH:MM" or "Weekday-HH:MM"] or "Monday-08:00")
  - Preferences (school/study windows) stored in 'userSchedule'
  - Tasks stored in 'timetableTasks' keyed by 'YYYY-MM-DD'
  - Notifications (simple) for today's tasks
  - Right-click context menu to edit time / priority / delete (syncs with homeworkEvents when originId present)
*/

const timeBlocks = [
  '06:00','07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'
];

function formatISODateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function parseToDate(dateLike) {
  // Accept Date, ISO YYYY-MM-DD, or toDateString
  if (!dateLike) return null;
  if (dateLike instanceof Date) return dateLike;
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/;
  if (isoMatch.test(dateLike)) return new Date(dateLike + 'T00:00:00');
  // fallback to Date() constructor
  return new Date(dateLike);
}

function getWeekDates(start = new Date()) {
  const arr = [];
  const base = new Date(start);
  base.setHours(0,0,0,0);
  for (let i=0;i<7;i++){
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    arr.push(d);
  }
  return arr;
}

export default function TimetableGenerator() {
  const [weekDates, setWeekDates] = useState(getWeekDates());
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('timetableTasks')) || {});
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('17:00');
  const [newTaskDate, setNewTaskDate] = useState(formatISODateKey(new Date()));
  const [fixedSchedule, setFixedSchedule] = useState(() => JSON.parse(localStorage.getItem('fixedSchedule')) || []);
  const [userSchedule, setUserSchedule] = useState(() => JSON.parse(localStorage.getItem('userSchedule')) || {
    schoolStart: '07:30',
    schoolEnd: '15:15',
    studyStart: '16:00',
    studyEnd: '21:00'
  });

  // context menu state
  const [contextMenu, setContextMenu] = useState({visible:false, x:0, y:0, dayKey:null, index:null});
  const contextRef = useRef(null);

  // load homeworkEvents on mount for auto-scheduling / sync
  useEffect(() => {
    // ensure weekDates start from today each load
    setWeekDates(getWeekDates());
  }, []);

  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('fixedSchedule', JSON.stringify(fixedSchedule));
  }, [fixedSchedule]);

  useEffect(() => {
    localStorage.setItem('userSchedule', JSON.stringify(userSchedule));
  }, [userSchedule]);

  useEffect(() => {
    // schedule notifications for today's tasks (simple)
    if (Notification && Notification.permission !== 'granted') {
      Notification.requestPermission().catch(()=>{});
    }
    scheduleTodayNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Helper: add a task object {id, content, time, done, originId?, priority}
  function addTask(dateKey, taskObj) {
    const updated = {...tasks};
    if (!updated[dateKey]) updated[dateKey] = [];
    updated[dateKey].push(taskObj);
    // sort by time
    updated[dateKey].sort((a,b)=> timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time));
    setTasks(updated);
  }

  function handleAddNewTask() {
    if (!newTaskText.trim()) return;
    const id = Date.now().toString();
    const task = { id, content: newTaskText.trim(), time: newTaskTime, done:false, priority:'normal' };
    addTask(newTaskDate, task);

    // If user wants, also add to homeworkEvents for cross-sync
    const hwEvents = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    // create a lightweight homework record so it can be auto-synced/backed-up
    const hw = { id, subject: 'Manual', description: newTaskText.trim(), date: newTaskDate };
    localStorage.setItem('homeworkEvents', JSON.stringify([...hwEvents, hw]));

    setNewTaskText('');
  }

  function toggleDone(dayKey, idx) {
    const updated = {...tasks};
    updated[dayKey][idx].done = !updated[dayKey][idx].done;
    setTasks(updated);
    // if originId exists and toggled done maybe reflect in homeworkEvents? skip by default
  }

  function deleteTask(dayKey, idx) {
    const updated = {...tasks};
    const removed = updated[dayKey].splice(idx,1)[0];
    setTasks(updated);

    // If the task had an originId (homework id) try remove it from homeworkEvents
    if (removed && removed.originId) {
      const hw = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
      const filtered = hw.filter(h => h.id !== removed.originId);
      localStorage.setItem('homeworkEvents', JSON.stringify(filtered));
    }
  }

  function scheduleTodayNotifications() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      const todayKey = formatISODateKey(new Date());
      const todays = tasks[todayKey] || [];
      // show a quick summary notification
      if (todays.length) {
        const n = new Notification('PlanorA — Today', {
          body: `You have ${todays.length} task(s) today.`,
          silent: true
        });
        // optionally schedule per-task notifications if you want more complex logic
      }
    } catch (e) {
      // ignore
    }
  }

  // Auto-schedule homework from homeworkEvents
  function autoScheduleHomework() {
    const hwList = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    if (!hwList.length) return;

    const updated = {...tasks};
    let usedSlots = new Set();

    // We'll schedule across the upcoming 14 days (or the week shown)
    const horizon = getWeekDates(new Date()); // 7-day window starting today
    for (const hw of hwList) {
      // Normalize hw.date to ISO YYYY-MM-DD if present
      const hwDate = parseToDate(hw.date);
      const hwDateKey = hwDate ? formatISODateKey(hwDate) : null;

      // If hw is an Exam type -> schedule study sessions starting 4 days before date
      if (hw.type === 'Exam' && hwDateKey) {
        for (let offset = 4; offset >= 1; offset--) {
          const studyDate = new Date(hwDate);
          studyDate.setDate(hwDate.getDate() - offset);
          const studyKey = formatISODateKey(studyDate);
          // choose time inside study window
          const studyTime = userSchedule.studyStart || '17:00';
          if (!isBlocked(studyDate, studyTime, updated, usedSlots)) {
            if (!updated[studyKey]) updated[studyKey] = [];
            updated[studyKey].push({
              id: `study-${hw.id}-${offset}`,
              content: `📚 Study for ${hw.subject || hw.description}`,
              time: studyTime,
              done:false,
              originId: hw.id,
              priority: 'high'
            });
            usedSlots.add(`${studyKey}-${studyTime}`);
          }
        }
        continue; // exam scheduling done
      }

      // Normal homework: schedule on the homework date if free, else find nearest free slot within horizon
      const targetDates = horizon.map(d => formatISODateKey(d));
      let scheduled = false;
      // prefer hw.date if present and within horizon
      if (hwDateKey && targetDates.includes(hwDateKey)) {
        if (tryPlaceAtDateKey(hwDateKey, hw, updated, usedSlots)) {
          scheduled = true;
        }
      }
      if (!scheduled) {
        // find earliest date in horizon with free slot (respect study window)
        for (const d of horizon) {
          const key = formatISODateKey(d);
          if (tryPlaceAtDateKey(key, hw, updated, usedSlots)) {
            scheduled = true;
            break;
          }
        }
      }
    }

    // sort each day by time
    Object.keys(updated).forEach(k => {
      updated[k].sort((a,b)=> timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time));
    });

    setTasks(updated);
  }

  function tryPlaceAtDateKey(dateKey, hw, updated, usedSlots) {
    // Choose preferred time: first free time in user's study window, else any free timeBlocks
    const date = parseToDate(dateKey);
    const studyStart = userSchedule.studyStart || '16:00';
    const studyEnd = userSchedule.studyEnd || '21:00';
    const availableTimes = timeBlocks.filter(t => t >= studyStart && t <= studyEnd);

    if (!updated[dateKey]) updated[dateKey] = [];
    // find free slot
    for (const t of availableTimes) {
      if (isBlocked(date, t, updated, usedSlots)) continue;
      // place
      updated[dateKey].push({
        id: `hw-${hw.id}-${dateKey}-${t}`,
        content: `📘 ${hw.subject || hw.description}`,
        time: t,
        done:false,
        originId: hw.id,
        priority: 'normal'
      });
      usedSlots.add(`${dateKey}-${t}`);
      return true;
    }

    // fallback: any free slot
    for (const t of timeBlocks) {
      if (isBlocked(date, t, updated, usedSlots)) continue;
      updated[dateKey].push({
        id: `hw-${hw.id}-${dateKey}-${t}`,
        content: `📘 ${hw.subject || hw.description}`,
        time: t,
        done:false,
        originId: hw.id,
        priority: 'normal'
      });
      usedSlots.add(`${dateKey}-${t}`);
      return true;
    }
    return false;
  }

  function isBlocked(dateObj, timeStr, updatedTasks = tasks, usedSlots = new Set()) {
    // Check fixed schedule: fixedSchedule may contain blocks like "Monday-08:00" or "YYYY-MM-DD-08:00"
    const weekdayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const wname = weekdayNames[dateObj.getDay()];
    const dateKey = formatISODateKey(dateObj);
    // blocked by fixedSchedule:
    if (fixedSchedule.includes(`${wname}-${timeStr}`)) return true;
    if (fixedSchedule.includes(`${dateKey}-${timeStr}`)) return true;
    if (usedSlots.has(`${dateKey}-${timeStr}`)) return true;
    // blocked by existing scheduled task at same slot
    const dayTasks = (updatedTasks[dateKey] || []);
    if (dayTasks.some(t => t.time === timeStr)) return true;

    // respect school hours: if time inside school, block
    const schoolStart = userSchedule.schoolStart || '07:30';
    const schoolEnd = userSchedule.schoolEnd || '15:15';
    if (timeStr >= schoolStart && timeStr <= schoolEnd) return true;

    return false;
  }

  // drag & drop handlers
  function onDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;
    const fromKey = source.droppableId;
    const toKey = destination.droppableId;
    const fromList = Array.from(tasks[fromKey] || []);
    const toList = Array.from(tasks[toKey] || []);
    const [moved] = fromList.splice(source.index, 1);
    // If destination index, insert. We keep moved.time as-is unless user changes time via context menu.
    toList.splice(destination.index, 0, moved);
    const updated = {...tasks, [fromKey]: fromList, [toKey]: toList};
    // cleanup empty arrays
    if (updated[fromKey] && updated[fromKey].length === 0) delete updated[fromKey];
    setTasks(updated);
  }

  // context menu handlers
  function onRightClick(e, dayKey, index) {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.pageX,
      y: e.pageY,
      dayKey,
      index
    });
  }

  function closeContext() {
    setContextMenu({visible:false, x:0, y:0, dayKey:null, index:null});
  }

  function handleChangeTime(newTime) {
    const {dayKey, index} = contextMenu;
    if (!dayKey) return;
    const updated = {...tasks};
    updated[dayKey][index].time = newTime;
    // re-sort
    updated[dayKey].sort((a,b)=> timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time));
    setTasks(updated);
    closeContext();
  }

  function handleChangePriority(newPriority) {
    const {dayKey, index} = contextMenu;
    const updated = {...tasks};
    updated[dayKey][index].priority = newPriority;
    setTasks(updated);
    closeContext();
  }

  function handleContextDelete() {
    const {dayKey, index} = contextMenu;
    if (!dayKey) return;
    const removed = tasks[dayKey][index];
    deleteTask(dayKey, index);
    // also try to remove from homeworkEvents if originId present (deleteTask does that)
    closeContext();
  }

  // UI helpers to render week columns
  function renderDayColumn(dateObj) {
    const key = formatISODateKey(dateObj);
    const dayName = dateObj.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
    const dayTasks = tasks[key] || [];
    return (
      <Droppable droppableId={key} key={key}>
        {(provided) => (
          <div className="day-column" {...provided.droppableProps} ref={provided.innerRef}>
            <div className="day-header">{dayName}</div>
            {dayTasks.length === 0 && <div className="empty-note">No tasks</div>}
            {dayTasks
              .sort((a,b)=> timeBlocks.indexOf(a.time) - timeBlocks.indexOf(b.time))
              .map((task, idx) => (
              <Draggable draggableId={`${key}-${task.id}`} index={idx} key={`${key}-${task.id}`}>
                {(prov) => (
                  <div
                    className={`task-card ${task.done ? 'done' : ''}`}
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    {...prov.dragHandleProps}
                    onContextMenu={(e)=>onRightClick(e, key, idx)}
                  >
                    <div>
                      <div className="task-time">{task.time}</div>
                      <div className="task-content">{task.content}</div>
                      {task.priority === 'high' && <div className="priority-pill">High</div>}
                    </div>
                    <div className="task-actions">
                      <button className="icon-btn" onClick={()=>toggleDone(key, idx)} title="Toggle done">✔</button>
                      <button className="icon-btn" onClick={()=>deleteTask(key, idx)} title="Delete">🗑</button>
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
  }

  // UI: toggle fixed schedule slot (weekday or specific date)
  function toggleFixedSlot(blockKey) {
    const copy = [...fixedSchedule];
    const idx = copy.indexOf(blockKey);
    if (idx >= 0) copy.splice(idx,1); else copy.push(blockKey);
    setFixedSchedule(copy);
  }

  // small helper to set default newTaskDate to first week date
  useEffect(()=>{
    if (weekDates && weekDates.length > 0) {
      setNewTaskDate(formatISODateKey(weekDates[0]));
    }
  },[weekDates]);

  // Render
  return (
    <div className="todoist-layout">
      <div className="topbar" style={{display:'flex', alignItems:'center', gap:12, padding:12}}>
        <h2 style={{margin:0}}>SchedulorA — Timetable Generator</h2>

        <div style={{marginLeft:'auto', display:'flex', gap:8, alignItems:'center'}}>
          <select value={newTaskDate} onChange={(e)=>setNewTaskDate(e.target.value)}>
            {weekDates.map(d => {
              const k = formatISODateKey(d);
              return <option key={k} value={k}>{d.toLocaleDateString()}</option>;
            })}
          </select>

          <select value={newTaskTime} onChange={(e)=>setNewTaskTime(e.target.value)}>
            {timeBlocks.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <input
            type="text"
            placeholder="Add task (also saved to TrackorA)"
            value={newTaskText}
            onChange={(e)=>setNewTaskText(e.target.value)}
            style={{minWidth:200}}
          />
          <button onClick={handleAddNewTask}>➕ Add</button>
          <button onClick={autoScheduleHomework}>🤖 Auto-schedule</button>
        </div>
      </div>

      <div style={{display:'flex', gap:12, padding:12}}>
        <div style={{flex:1}}>
          <div style={{display:'flex', gap:8, marginBottom:8}}>
            <div>
              <label>School start</label>
              <input value={userSchedule.schoolStart} onChange={(e)=>setUserSchedule({...userSchedule, schoolStart:e.target.value})} />
            </div>
            <div>
              <label>School end</label>
              <input value={userSchedule.schoolEnd} onChange={(e)=>setUserSchedule({...userSchedule, schoolEnd:e.target.value})} />
            </div>
            <div>
              <label>Study start</label>
              <input value={userSchedule.studyStart} onChange={(e)=>setUserSchedule({...userSchedule, studyStart:e.target.value})} />
            </div>
            <div>
              <label>Study end</label>
              <input value={userSchedule.studyEnd} onChange={(e)=>setUserSchedule({...userSchedule, studyEnd:e.target.value})} />
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12}}>
            <div style={{gridColumn:'1 / span 4', marginBottom:8}}>
              <strong>Fixed Schedule (click to toggle block)</strong>
              <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
                {/* show weekday-time toggles */}
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((wd,wi)=>(
                  timeBlocks.map(tb=> {
                    const key = `${wd}-${tb}`;
                    const active = fixedSchedule.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={()=>toggleFixedSlot(key)}
                        style={{
                          padding:'6px 8px',
                          borderRadius:6,
                          border: active ? '2px solid #3a7' : '1px solid #ddd',
                          background: active ? '#e9fff0' : '#fff'
                        }}
                      >
                        {wd} {tb}
                      </button>
                    );
                  })
                ))}
              </div>
            </div>
          </div>

          <div style={{marginTop:12}}>
            <strong>Week view</strong>
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="day-columns" style={{display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:12, marginTop:8}}>
                {weekDates.map(d => renderDayColumn(d))}
              </div>
            </DragDropContext>
          </div>
        </div>

        <div style={{width:320}}>
          <div style={{padding:12, borderRadius:8, background:'#fff', boxShadow:'0 1px 6px rgba(0,0,0,0.06)'}}>
            <h3>Quick controls</h3>
            <p style={{marginTop:0}}>Auto-schedule will attempt to place TrackorA homework into free study slots respecting fixed schedule and school hours.</p>
            <button onClick={()=>{ localStorage.removeItem('timetableTasks'); setTasks({}); }}>Clear timetable</button>
            <button onClick={()=>{ localStorage.removeItem('homeworkEvents'); alert('homeworkEvents cleared'); }}>Clear homeworkEvents</button>
            <div style={{marginTop:12}}>
              <strong>Notes</strong>
              <ul>
                <li>Right-click a task to edit time / priority / delete.</li>
                <li>Deleting a task with origin will remove its homeworkEvents entry.</li>
                <li>Notifications: allow browser notifications for reminders.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          ref={contextRef}
          style={{
            position:'absolute',
            left:contextMenu.x,
            top:contextMenu.y,
            background:'#fff',
            border:'1px solid #ddd',
            padding:8,
            zIndex:999,
            borderRadius:6,
            boxShadow:'0 4px 12px rgba(0,0,0,0.12)'
          }}
          onMouseLeave={closeContext}
        >
          <div><strong>Edit task</strong></div>
          <div style={{marginTop:8}}>
            <label>Time</label>
            <select onChange={(e)=>handleChangeTime(e.target.value)} defaultValue={ (() => {
              const dkey = contextMenu.dayKey;
              const idx = contextMenu.index;
              if (!dkey||idx==null) return '17:00';
              return (tasks[dkey] && tasks[dkey][idx] && tasks[dkey][idx].time) || '17:00';
            })()}>
              {timeBlocks.map(t=> <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{marginTop:8}}>
            <label>Priority</label>
            <div style={{display:'flex', gap:6, marginTop:4}}>
              <button onClick={()=>handleChangePriority('low')}>Low</button>
              <button onClick={()=>handleChangePriority('normal')}>Normal</button>
              <button onClick={()=>handleChangePriority('high')}>High</button>
            </div>
          </div>
          <div style={{marginTop:8, display:'flex', gap:8}}>
            <button onClick={handleContextDelete} style={{background:'#ffdddd'}}>Delete</button>
            <button onClick={closeContext}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
