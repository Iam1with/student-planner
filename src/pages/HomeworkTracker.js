// HomeworkTracker.js
import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../App.css';

const HomeworkTracker = () => {
  const [subjects, setSubjects] = useState(() => {
    const saved = localStorage.getItem('subjects');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedSubject, setSelectedSubject] = useState('');
  const [whatYouDid, setWhatYouDid] = useState('');
  const [homework, setHomework] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState(() => {
    const saved = localStorage.getItem('events');
    return saved ? JSON.parse(saved) : {};
  });

  const [eventType, setEventType] = useState('');
  const [eventDescription, setEventDescription] = useState('');

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

  const addHomework = () => {
    if (!selectedSubject || !homework) return;
    const dateStr = selectedDate.toDateString();
    const newEvent = {
      type: 'Homework',
      subject: selectedSubject,
      description: homework,
      what: whatYouDid,
    };
    const dayEvents = events[dateStr] || [];
    setEvents({ ...events, [dateStr]: [...dayEvents, newEvent] });
    setWhatYouDid('');
    setHomework('');

    // Also save to homeworkEvents for AI timetable
    const homeworkData = {
      id: Date.now().toString(),
      subject: selectedSubject,
      description: homework,
      what: whatYouDid,
      date: dateStr,
    };
    const storedHomework = JSON.parse(localStorage.getItem("homeworkEvents")) || [];
    localStorage.setItem("homeworkEvents", JSON.stringify([...storedHomework, homeworkData]));
  };

  const addCustomEvent = () => {
    if (!selectedSubject || !eventType || !eventDescription) return;
    const dateStr = selectedDate.toDateString();
    const newEvent = {
      type: eventType,
      subject: selectedSubject,
      description: eventDescription,
    };
    const dayEvents = events[dateStr] || [];
    setEvents({ ...events, [dateStr]: [...dayEvents, newEvent] });
    setEventDescription('');
    setEventType('');
  };

 const removeEvent = (index) => {
  const dateStr = selectedDate.toDateString();
  const updatedEvents = events[dateStr].filter((_, i) => i !== index);

  // Update events
  const updated = { ...events, [dateStr]: updatedEvents };
  setEvents(updated);

  // Sync with homeworkEvents in localStorage
  const allHomework = JSON.parse(localStorage.getItem('homeworkEvents')) || [];
  const removed = events[dateStr][index];
  
  const filteredHomework = allHomework.filter(hw => {
    return !(hw.subject === removed.subject && hw.description === removed.description && hw.date === dateStr);
  });

  localStorage.setItem('homeworkEvents', JSON.stringify(filteredHomework));
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
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
        >
          <option value="">-- Choose Subject --</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
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
                className={`event-dot ${event.type === 'Homework' ? 'red' : 'blue'}`}
              ></div>
            ));
          }}
        />

        <h3>Events on {selectedDate.toDateString()}</h3>
        <ul>
          {(events[selectedDate.toDateString()] || []).map((event, i) => (
            <li key={i} style={{ marginBottom: '10px' }}>
              <div>
                <strong style={{ color: event.type === 'Homework' ? 'red' : 'blue' }}>
                  {event.type}
                </strong>{' '}- {event.subject}: {event.description || event.what}
              </div>
              <div className="event-buttons">
                <button className="event-btn done" onClick={() => removeEvent(i)}>✔</button>
                <button className="event-btn delete" onClick={() => removeEvent(i)}>❌</button>
              </div>
            </li>
          ))}
        </ul>

        <h3>Add Other Event</h3>
        <input
          type="text"
          placeholder="e.g. Webinar"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        />
        <textarea
          placeholder="Description"
          value={eventDescription}
          onChange={(e) => setEventDescription(e.target.value)}
        />
        <button onClick={addCustomEvent}>Add Event</button>
      </div>
    </div>
  );
};

export default HomeworkTracker;
