// src/pages/TimetableGenerator.js
import React, { useEffect, useRef, useState } from 'react';
import '../App.css';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Weekdays and hourly time blocks (24-hour)
const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const timeBlocks = Array.from({length:24}, (_,i) => (i<10? '0'+i : ''+i) + ':00'); // "00:00" .. "23:00"

// helper: convert "HH:MM" to minutes since midnight
const hhmmToMinutes = (hhmm) => {
  const [h,m] = hhmm.split(':').map(Number);
  return h*60 + (m||0);
};

// helper: minutes -> "HH:MM"
const minutesToHHMM = (mins) => {
  const h = Math.floor(mins/60);
  const m = mins%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
};

const TimetableGenerator = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('timetableTasks')) || {}); // { Monday: [{id,content,time,duration,done,sourceId}] }
  const [fixedSchedule, setFixedSchedule] = useState(() => JSON.parse(localStorage.getItem('fixedSchedule')) || []); // [{day, start, end}]
  const [homeworkEventsKey] = useState('homeworkEvents'); // where TrackorA stores items
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedDay, setSelectedDay] = useState(weekdays[new Date().getDay()===0?6:new Date().getDay()-1]); // default today
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2,'0')}:00`;
  });
  const [selectedDuration, setSelectedDuration] = useState(60); // minutes
  const containerRef = useRef(null);
  const audioRef = useRef(null);

  // sound and notification audio (simple beep)
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YRAAAAAA'); // tiny silent placeholder; browsers may block unless user interacted
  }, []);

  // persist tasks
  useEffect(() => {
    localStorage.setItem('timetableTasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('fixedSchedule', JSON.stringify(fixedSchedule));
  }, [fixedSchedule]);

  // ensure tasks is always object with keys for weekdays
  useEffect(() => {
    setTasks(prev => {
      const copy = {...prev};
      weekdays.forEach(d => { if(!copy[d]) copy[d]=[]; });
      return copy;
    });
    // auto-scroll to current hour on mount
    setTimeout(() => {
      scrollToCurrentHour();
    }, 200);
  }, []);

  // utility: check if a time range (start,duration) intersects any fixedSchedule for that day
  const isBlocked = (day, startHHMM, duration) => {
    const startMin = hhmmToMinutes(startHHMM);
    const endMin = startMin + duration;
    const blocks = fixedSchedule.filter(b => b.day === day);
    for (const b of blocks) {
      const bStart = hhmmToMinutes(b.start);
      const bEnd = hhmmToMinutes(b.end);
      if (Math.max(bStart, startMin) < Math.min(bEnd, endMin)) return true;
    }
    return false;
  };

  // Add new manual task (also add to homeworkEvents so TrackorA can see it)
  const addTask = () => {
    if (!newTaskText.trim()) return;
    const id = Date.now().toString();
    const item = { id, content: newTaskText.trim(), time: selectedTime, duration: selectedDuration, done: false, sourceId: null };
    setTasks(prev => {
      const copy = {...prev};
      copy[selectedDay] = copy[selectedDay] ? [...copy[selectedDay], item] : [item];
      return copy;
    });
    // also add to homeworkEvents to keep TrackorA sync (so user can find it there)
    const hw = JSON.parse(localStorage.getItem(homeworkEventsKey)) || [];
    hw.push({ id, subject: '(Custom)', description: newTaskText.trim(), date: null, type: 'Task', scheduled: true });
    localStorage.setItem(homeworkEventsKey, JSON.stringify(hw));
    setNewTaskText('');
  };

  // toggle done
  const toggleDone = (day, index) => {
    setTasks(prev => {
      const copy = {...prev};
      copy[day][index].done = !copy[day][index].done;
      return copy;
    });
  };

  // delete task (also remove matching item from homeworkEvents if present)
  const deleteTask = (day, index) => {
    setTasks(prev => {
      const copy = {...prev};
      const removed = copy[day].splice(index,1)[0];
      // sync: remove matching homeworkEvents item by id or by content/description
      const hw = JSON.parse(localStorage.getItem(homeworkEventsKey)) || [];
      const filtered = hw.filter(h => {
        if (!removed) return true;
        if (h.id && removed.id && h.id === removed.id) return false;
        // fall back to matching subject/description
        if (h.description && removed.content && h.description === removed.content) return false;
        return true;
      });
      localStorage.setItem(homeworkEventsKey, JSON.stringify(filtered));
      return copy;
    });
  };

  // Drag & Drop handling
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    const srcDay = source.droppableId;
    const dstDay = destination.droppableId;
    const srcIndex = source.index;
    const dstIndex = destination.index;

    setTasks(prev => {
      const copy = {...prev};
      const sourceList = Array.from(copy[srcDay] || []);
      const [moved] = sourceList.splice(srcIndex,1);
      // If moved to different day, keep its time but you might want to change it later via edit
      const destList = Array.from(copy[dstDay] || []);
      destList.splice(dstIndex,0,moved);

      copy[srcDay] = sourceList;
      copy[dstDay] = destList;
      return copy;
    });
  };

  // Auto-schedule: reads homeworkEvents and schedules homework + exam study sessions
  // One button does both: schedule homework items, and for items with examDate, schedule 4 study sessions 4 days before exam.
  const autoScheduleAll = () => {
    const hwList = JSON.parse(localStorage.getItem(homeworkEventsKey)) || [];
    let updated = {...tasks};
    let usedSlots = new Set();

    // Helper: find a free slot on or after a set startDay across the week within study hours (we'll read fixedSchedule study-block or fallback)
    const findFreeSlot = (duration, preferDayIndex=0) => {
      // We attempt slots day-by-day, hourly starting from 00:00
      for (let di = preferDayIndex; di < preferDayIndex + 7; di++){
        const day = weekdays[di % 7];
        for (const t of timeBlocks) {
          if (isBlocked(day, t, duration)) continue;
          const already = (updated[day] || []).some(x => {
            const s = hhmmToMinutes(x.time);
            const e = s + (x.duration || 60);
            const ns = hhmmToMinutes(t);
            const ne = ns + duration;
            return Math.max(s, ns) < Math.min(e, ne); // overlap
          });
          if (already) continue;
          const slotKey = `${day}-${t}`;
          if (usedSlots.has(slotKey)) continue;
          return { day, time: t };
        }
      }
      return null;
    };

    // schedule homework items (type !== 'Exam' or type missing)
    for (const hw of hwList.filter(h => h.type !== 'Exam')) {
      // skip if already scheduled in tasks (match by id)
      const alreadyScheduled = Object.values(updated).flat().some(t => t.sourceId === hw.id || (t.content && hw.description && t.content.includes(hw.description)));
      if (alreadyScheduled) continue;
      const slot = findFreeSlot(60, 0);
      if (!slot) continue;
      if (!updated[slot.day]) updated[slot.day] = [];
      const id = hw.id || Date.now().toString() + Math.random();
      updated[slot.day].push({ id, content: `📘 ${hw.subject}: ${hw.description}`, time: slot.time, duration: 60, done:false, sourceId: hw.id || id });
      usedSlots.add(`${slot.day}-${slot.time}`);
    }

    // schedule exam study sessions: for each hw with examDate, schedule 4 sessions, starting 4 days before exam
    for (const hw of hwList.filter(h => h.type === 'Exam' || h.examDate)) {
      // parse examDate
      const examISO = hw.examDate || hw.date || hw.exam; // some formats
      let examDateObj = examISO ? new Date(examISO) : null;
      if (!examDateObj || isNaN(examDateObj)) {
        // try parse toDateString form
        try { examDateObj = new Date(hw.date); } catch (e) { examDateObj = null; }
      }
      if (!examDateObj || isNaN(examDateObj)) continue;

      // schedule 4 study sessions: examDate - [4,3,2,1] days
      for (let daysBefore = 4; daysBefore >= 1; daysBefore--) {
        const target = new Date(examDateObj);
        target.setDate(target.getDate() - daysBefore);
        // pick weekday name
        const jsDay = target.getDay(); // 0 Sun ..6 Sat
        const weekdayIndex = jsDay === 0 ? 6 : jsDay - 1; // Monday=0
        const preferredStartDayIndex = weekdayIndex;
        const slot = findFreeSlot(60, preferredStartDayIndex);
        if (!slot) continue;
        if (!updated[slot.day]) updated[slot.day] = [];
        const id = hw.id ? `${hw.id}-exam-${daysBefore}` : Date.now().toString()+Math.random();
        updated[slot.day].push({ id, content: `🔴 Study for ${hw.subject} (exam on ${examDateObj.toDateString()})`, time: slot.time, duration: 60, done:false, sourceId: hw.id || id, examSession:true });
        usedSlots.add(`${slot.day}-${slot.time}`);
      }
    }

    setTasks(updated);
    // persist automatically via useEffect
    // scroll to current hour area
    setTimeout(() => scrollToCurrentHour(), 200);
  };

  // Auto-notify: runs every minute to check tasks starting in 15 min
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const in15 = new Date(now.getTime() + 15*60000);
      const hhmm = `${in15.getHours().toString().padStart(2,'0')}:00`; // checking hourly slots
      const todayWeekday = weekdays[now.getDay()===0?6:now.getDay()-1];
      const todayTasks = tasks[todayWeekday] || [];
      for (const t of todayTasks) {
        if (!t.notified) {
          // if scheduled time equals hhmm (or within same hour) and starts within next 15 min
          const taskMin = hhmmToMinutes(t.time);
          const diff = taskMin - (now.getHours()*60 + now.getMinutes());
          if (diff > -1 && diff <= 15) {
            // notify
            try {
              if (Notification && Notification.permission === 'granted') {
                new Notification('SchedulorA — upcoming task', { body: `${t.content} at ${t.time}` });
              }
            } catch(e){}
            // play sound
            try { audioRef.current && audioRef.current.play().catch(()=>{}); } catch(e){}
            // mark notified so we don't spam
            t.notified = true;
            setTasks(prev => ({...prev}));
          }
        }
      }
    }, 60*1000);
    return () => clearInterval(interval);
  }, [tasks]);

  // request permission for notifications on first user gesture (we can ask when user clicks Auto-Schedule)
  const requestNotificationPermission = async () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      try { await Notification.requestPermission(); } catch(e) {}
    }
  };

  // scroll helper
  const scrollToCurrentHour = () => {
    if (!containerRef.current) return;
    const now = new Date();
    const hour = now.getHours();
    const selector = containerRef.current.querySelector(`.time-row[data-time="${hour.toString().padStart(2,'0')}:00"]`);
    if (selector) selector.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // UI render helpers
  const renderTaskCard = (task, day, index) => {
    return (
      <div className={`task-card ${task.done ? 'done' : ''}`} style={{ borderLeft:`4px solid ${task.examSession? '#d9534f':'#6c8cff'}` }}>
        <div className="task-left">
          <div className="task-time">{task.time}</div>
          <div className="task-content">{task.content}</div>
          <div className="task-duration">{task.duration} min</div>
        </div>
        <div className="task-actions">
          <button title="Mark done" onClick={() => toggleDone(day, index)} style={{marginRight:8}}>✅</button>
          <button title="Delete" onClick={() => deleteTask(day, index)}>🗑️</button>
        </div>
      </div>
    );
  };

  // Right-click edit support (simple prompt for time/duration)
  const editTask = (day, index) => {
    const t = tasks[day][index];
    const newTime = prompt('Enter new start time (HH:MM)', t.time);
    if (!newTime) return;
    const newDur = prompt('Duration in minutes (e.g. 60)', t.duration || 60);
    if (!newDur) return;
    setTasks(prev => {
      const copy = {...prev};
      copy[day][index] = {...copy[day][index], time: newTime, duration: Number(newDur)};
      return copy;
    });
  };

  // minimal UI: top controls + week columns with draggable tasks
  return (
    <div className="timetable-container" style={{padding:20}}>
      <div className="topbar" style={{display:'flex', gap:12, alignItems:'center', marginBottom:12}}>
        <h2 style={{margin:0}}>SchedulorA — Timetable Generator</h2>
        <div style={{marginLeft:20, display:'flex', gap:8, alignItems:'center'}}>
          <select value={selectedDay} onChange={(e)=>setSelectedDay(e.target.value)}>
            {weekdays.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={selectedTime} onChange={(e)=>setSelectedTime(e.target.value)}>
            {timeBlocks.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={selectedDuration} onChange={(e)=>setSelectedDuration(Number(e.target.value))}>
            {[30,45,60,90,120].map(x => <option key={x} value={x}>{x} min</option>)}
          </select>
          <input placeholder="New task text" value={newTaskText} onChange={(e)=>setNewTaskText(e.target.value)} style={{minWidth:260, padding:8}}/>
          <button onClick={addTask}>➕ Add</button>
          <button onClick={() => { requestNotificationPermission(); autoScheduleAll(); }}>🤖 Auto-Schedule</button>
          <button onClick={() => { localStorage.removeItem('timetableTasks'); setTasks({}); }}>Reset</button>
        </div>
      </div>

      <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
        {/* Left: vertical time labels */}
        <div style={{width:80}}>
          {timeBlocks.map(tb => (
            <div key={tb} className="time-row" data-time={tb} style={{height:60, borderBottom:'1px solid #eee', textAlign:'right', paddingRight:10, fontSize:12}}>
              {tb}
            </div>
          ))}
        </div>

        {/* Right: day columns */}
        <div style={{flex:1, display:'grid', gridTemplateColumns:`repeat(${weekdays.length}, 1fr)`, gap:12}} ref={containerRef}>
          <DragDropContext onDragEnd={onDragEnd}>
            {weekdays.map(day => (
              <Droppable droppableId={day} key={day}>
                {(provided) => (
                  <div className="day-column" ref={provided.innerRef} {...provided.droppableProps} style={{background:'#fff',borderRadius:8, padding:8, minHeight:600, boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                      <strong>{day}</strong>
                      {/* show blocked indicator if whole day holiday or some blocks */}
                      {fixedSchedule.filter(b => b.day===day).length>0 && <small style={{color:'#999'}}>fixed</small>}
                    </div>

                    {/* hour grid */}
                    <div style={{display:'flex', flexDirection:'column', gap:6}}>
                      {/* For layout alignment we still show time rows */}
                      {timeBlocks.map(hour => (
                        <div key={hour} style={{minHeight:56, borderBottom:'1px dashed #f0f0f0', position:'relative'}}>
                          {/* tasks that start at this hour */}
                          {(tasks[day] || []).filter(t => t.time === hour).map((t, idx) => (
                            <Draggable key={`${day}-${t.id || idx}`} draggableId={`${day}-${t.id || idx}`} index={ (tasks[day]||[]).findIndex(x=>x===t) }>
                              {(p) => (
                                <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} style={{...p.draggableProps.style, marginBottom:6}}>
                                  <div className={`task-card ${t.done ? 'done' : ''}`} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:8, background: t.done ? '#d1ffd1' : '#fffbe6', borderRadius:6, border:'1px solid #e5e5e5'}}>
                                    <div style={{maxWidth: '85%'}}>
                                      <div style={{fontWeight:600}}>{t.content}</div>
                                      <div style={{fontSize:12, color:'#555'}}>{t.time} • {t.duration} min</div>
                                    </div>
                                    <div style={{display:'flex', gap:6}}>
                                      <button onClick={() => toggleDone(day, (tasks[day]||[]).indexOf(t))}>✅</button>
                                      <button onClick={() => editTask(day, (tasks[day]||[]).indexOf(t))}>✏️</button>
                                      <button onClick={() => deleteTask(day, (tasks[day]||[]).indexOf(t))}>🗑️</button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                        </div>
                      ))}
                    </div>

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </DragDropContext>
        </div>
      </div>
    </div>
  );
};

export default TimetableGenerator;
