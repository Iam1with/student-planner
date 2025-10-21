// src/pages/HomeworkTracker.js
import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../App.css';

const HomeworkTracker = () => {
  const [subjects, setSubjects] = useState(() => JSON.parse(localStorage.getItem('subjects') || '[]'));
  const [selectedSubject, setSelectedSubject] = useState('');
  const [whatYouDid, setWhatYouDid] = useState('');
  const [homework, setHomework] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState(() => JSON.parse(localStorage.getItem('events') || '{}'));
  const [eventType, setEventType] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventTime, setEventTime] = useState('17:00');
  const [eventDuration, setEventDuration] = useState(60); // minutes

  useEffect(() => {
    localStorage.setItem('subjects', JSON.stringify(subjects));
    localStorage.setItem('events', JSON.stringify(events));
  }, [subjects, events]);

  const addSubject = () => {
    if (selectedSubject && !subjects.includes(selectedSubject)) {
      setSubjects([...subjects, selectedSubject]);
      setSelectedSubject('');
    }
  };

  const deleteSubject = (subjectToDelete) => {
    setSubjects(subjects.filter((s) => s !== subjectToDelete));
  };

  const saveToHomeworkEvents = (obj) => {
    const stored = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    localStorage.setItem('homeworkEvents', JSON.stringify([...stored, obj]));
  };

  const addHomework = () => {
    if (!selectedSubject || !homework) return;
    const dateStr = selectedDate.toDateString();
    const newEvent = {
      type: 'Homework',
      subject: selectedSubject,
      description: homework,
      what: whatYouDid,
      time: eventTime,
      duration: eventDuration,
    };
    const dayEvents = events[dateStr] || [];
    const updated = { ...events, [dateStr]: [...dayEvents, newEvent] };
    setEvents(updated);

    // save to scheduler
    saveToHomeworkEvents({
      id: Date.now().toString(),
      subject: selectedSubject,
      description: homework,
      date: dateStr,
      time: eventTime,
      duration: eventDuration,
      type: 'Homework',
    });

    setWhatYouDid('');
    setHomework('');
  };

  const addCustomEvent = () => {
    if (!selectedSubject || !eventType || !eventDescription) return;
    const dateStr = selectedDate.toDateString();
    const newEvent = {
      type: eventType,
      subject: selectedSubject,
      description: eventDescription,
      time: eventTime,
      duration: eventDuration,
    };
    const dayEvents = events[dateStr] || [];
    const updated = { ...events, [dateStr]: [...dayEvents, newEvent] };
    setEvents(updated);

    // save to scheduler
    saveToHomeworkEvents({
      id: Date.now().toString(),
      subject: selectedSubject,
      description: eventDescription,
      date: dateStr,
      time: eventTime,
      duration: eventDuration,
      type: eventType,
    });

    setEventDescription('');
    setEventType('');
  };

  const removeEvent = (index) => {
    const dateStr = selectedDate.toDateString();
    const updatedEvents = (events[dateStr] || []).filter((_, i) => i !== index);
    const updated = { ...events, [dateStr]: updatedEvents };
    setEvents(updated);

    // Sync with homeworkEvents
    const allHomework = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
    const removed = events[dateStr][index];
    const filtered = allHomework.filter(
      (hw) =>
        !(
          hw.subject === removed.subject &&
          hw.description === removed.description &&
          hw.date === dateStr
        )
    );
    localStorage.setItem('homeworkEvents', JSON.stringify(filtered));
  };

  return (
    <div className="tracker-container">
      <div className="tracker-left">
        <h1>📘 Homework & Activity Tracker</h1>

        <h3>Add / Delete Subjects</h3>
        <input
          type="text"
          placeholder="Add subject"
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
        />
        <button onClick={addSubject}>Add Subject</button>
        <div className="subject-buttons">
          {subjects.map((subj) => (
            <button
              key={subj}
              className="delete-btn"
              onClick={() => deleteSubject(subj)}
            >
              ❌ {subj}
            </button>
          ))}
        </div>

        <h3>Select Subject</h3>
        <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
          <option value="">-- Choose Subject --</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <h3>Activity</h3>
        <textarea
          placeholder="What did you do?"
          value={whatYouDid}
          onChange={(e) => setWhatYouDid(e.target.value)}
        />

        <h3>Homework</h3>
        <textarea
          placeholder="Homework given"
          value={homework}
          onChange={(e) => setHomework(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
          <select value={eventDuration} onChange={(e) => setEventDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hr</option>
            <option value={120}>2 hr</option>
          </select>
        </div>
        <button onClick={addHomework}>Add Homework</button>
      </div>

      <div className="tracker-right">
        <h2>📅 Calendar</h2>
        <Calendar
          onChange={setSelectedDate}
          value={selectedDate}
          tileContent={({ date }) => {
            const dateStr = date.toDateString();
            return events[dateStr]?.map((event, i) => (
              <div
                key={i}
                className={`event-dot ${event.type === 'Exam' ? 'red' : event.type === 'Homework' ? 'orange' : 'blue'}`}
              ></div>
            ));
          }}
        />

        <h3>Events on {selectedDate.toDateString()}</h3>
        <ul>
          {(events[selectedDate.toDateString()] || []).map((event, i) => (
            <li key={i} style={{ marginBottom: '10px' }}>
              <div>
                <strong style={{ color: event.type === 'Exam' ? 'red' : event.type === 'Homework' ? 'orange' : 'blue' }}>
                  {event.type}
                </strong>{' '}
                - {event.subject}: {event.description} ({event.time}, {event.duration}m)
              </div>
              <button className="event-btn delete" onClick={() => removeEvent(i)}>❌</button>
            </li>
          ))}
        </ul>

        <h3>Add Other Event (e.g. Exam)</h3>
        <input
          type="text"
          placeholder="Type (Exam / Seminar)"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        />
        <textarea
          placeholder="Description"
          value={eventDescription}
          onChange={(e) => setEventDescription(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
          <select value={eventDuration} onChange={(e) => setEventDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hr</option>
            <option value={90}>1.5 hr</option>
            <option value={120}>2 hr</option>
          </select>
        </div>
        <button onClick={addCustomEvent}>Add Event</button>
      </div>
    </div>
  );
};

export default HomeworkTracker;
