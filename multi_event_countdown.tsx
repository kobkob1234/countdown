import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export default function CountdownTimer() {
  const [events, setEvents] = useState([]);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  const colorSchemes = [
    { from: 'from-purple-500', to: 'to-purple-600', light: 'purple-100' },
    { from: 'from-blue-500', to: 'to-blue-600', light: 'blue-100' },
    { from: 'from-green-500', to: 'to-green-600', light: 'green-100' },
    { from: 'from-pink-500', to: 'to-pink-600', light: 'pink-100' },
    { from: 'from-orange-500', to: 'to-orange-600', light: 'orange-100' },
    { from: 'from-red-500', to: 'to-red-600', light: 'red-100' },
    { from: 'from-teal-500', to: 'to-teal-600', light: 'teal-100' },
    { from: 'from-indigo-500', to: 'to-indigo-600', light: 'indigo-100' },
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const calculateTimeLeft = (targetDate) => {
    const difference = targetDate - currentTime;
    
    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      expired: false
    };
  };

  const addEvent = () => {
    if (eventName && eventDate) {
      const newEvent = {
        id: Date.now(),
        name: eventName,
        date: new Date(eventDate)
      };
      setEvents([...events, newEvent]);
      setEventName('');
      setEventDate('');
    }
  };

  const deleteEvent = (id) => {
    setEvents(events.filter(event => event.id !== id));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-white text-center mb-8 drop-shadow-lg">
          Event Countdown Timer
        </h1>

        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Add New Event</h2>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Event Name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 text-lg"
            />
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 text-lg"
            />
            <button
              onClick={addEvent}
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add Event
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {events.length === 0 ? (
            <div className="bg-white bg-opacity-90 rounded-2xl shadow-xl p-12 text-center">
              <p className="text-gray-500 text-xl">No events yet. Add your first event above!</p>
            </div>
          ) : (
            [...events].sort((a, b) => a.date - b.date).map((event, index) => {
              const timeLeft = calculateTimeLeft(event.date);
              const colorScheme = colorSchemes[index % colorSchemes.length];
              return (
                <div
                  key={event.id}
                  className="bg-white bg-opacity-95 rounded-2xl shadow-xl p-8 backdrop-blur-sm"
                >
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-3xl font-bold text-gray-800">{event.name}</h3>
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>

                  {timeLeft.expired ? (
                    <div className="text-center py-8">
                      <p className="text-4xl font-bold text-gray-400">Event Has Passed</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-4">
                      <div className={`bg-gradient-to-br ${colorScheme.from} ${colorScheme.to} rounded-xl p-6 text-center`}>
                        <div className="text-5xl font-bold text-white mb-2">
                          {timeLeft.days}
                        </div>
                        <div className={`text-${colorScheme.light} text-lg font-medium`}>Days</div>
                      </div>
                      <div className={`bg-gradient-to-br ${colorScheme.from} ${colorScheme.to} rounded-xl p-6 text-center`}>
                        <div className="text-5xl font-bold text-white mb-2">
                          {timeLeft.hours}
                        </div>
                        <div className={`text-${colorScheme.light} text-lg font-medium`}>Hours</div>
                      </div>
                      <div className={`bg-gradient-to-br ${colorScheme.from} ${colorScheme.to} rounded-xl p-6 text-center`}>
                        <div className="text-5xl font-bold text-white mb-2">
                          {timeLeft.minutes}
                        </div>
                        <div className={`text-${colorScheme.light} text-lg font-medium`}>Minutes</div>
                      </div>
                      <div className={`bg-gradient-to-br ${colorScheme.from} ${colorScheme.to} rounded-xl p-6 text-center`}>
                        <div className="text-5xl font-bold text-white mb-2">
                          {timeLeft.seconds}
                        </div>
                        <div className={`text-${colorScheme.light} text-lg font-medium`}>Seconds</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-center text-gray-600">
                    {event.date.toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}