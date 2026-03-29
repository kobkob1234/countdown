// ============ DAILY REMINDER ============
import { ctx } from '../context.js';

const $ = id => document.getElementById(id);

export function initDailyReminder() {
  const closeReminderBtn = $("closeReminderBtn");
  const reminderDate = $("reminderDate");
  const todayTasksList = $("todayTasksList");
  const tomorrowTasksList = $("tomorrowTasksList");
  const todayTasksSection = $("todayTasksSection");
  const tomorrowTasksSection = $("tomorrowTasksSection");
  const reminderModal = $("reminderModal");

  function showDailyReminder() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    reminderDate.textContent = now.toLocaleDateString('he-IL', dateOptions);

    const tasks = ctx.tasks || [];

    const todayTasks = tasks.filter(t => {
      if (!t.dueDate || t.completed) return false;
      const due = new Date(t.dueDate);
      return due >= today && due < tomorrow;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const tomorrowTasks = tasks.filter(t => {
      if (!t.dueDate || t.completed) return false;
      const due = new Date(t.dueDate);
      return due >= tomorrow && due < dayAfterTomorrow;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (todayTasks.length > 0) {
      todayTasksSection.style.display = 'block';
      todayTasksList.innerHTML = todayTasks.map(t => renderReminderTask(t)).join('');
    } else {
      todayTasksSection.style.display = 'block';
      todayTasksList.innerHTML = '<div class="reminder-empty"><span class="icon" style="font-size:16px;vertical-align:middle">celebration</span> אין משימות להיום!</div>';
    }

    if (tomorrowTasks.length > 0) {
      tomorrowTasksSection.style.display = 'block';
      tomorrowTasksList.innerHTML = tomorrowTasks.map(t => renderReminderTask(t)).join('');
    } else {
      tomorrowTasksSection.style.display = 'none';
    }

    reminderModal.classList.add('open');
  }

  function renderReminderTask(task) {
    const priorityColors = {
      urgent: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e',
      none: '#6b7280'
    };
    const color = priorityColors[task.priority || 'none'];
    const time = task.dueDate ? new Date(task.dueDate).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';
    const escapeHtml = ctx.escapeHtml;

    return `
    <div class="reminder-task-item">
      <div class="task-priority-dot" style="background: ${color};"></div>
      <div class="task-info">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${time ? `<div class="task-time"><span class="icon" style="font-size:16px;vertical-align:middle">alarm</span> ${time}</div>` : ''}
      </div>
    </div>
  `;
  }

  closeReminderBtn.onclick = () => {
    reminderModal.classList.remove('open');
    localStorage.setItem('lastReminderDate', new Date().toDateString());
  };

  function checkDailyReminder() {
    const now = new Date();
    const lastReminder = localStorage.getItem('lastReminderDate');
    const todayString = now.toDateString();

    if (lastReminder === todayString) return;

    // Show between 8:00–10:59 (wider window so it's not missed at exactly 9:30)
    if (now.getHours() >= 8 && now.getHours() <= 10) {
      const tasks = ctx.tasks || [];
      const subjects = ctx.subjects || [];
      if (tasks.length > 0 || subjects.length > 0) {
        showDailyReminder();
      }
    }
  }

  setInterval(checkDailyReminder, 60000);
  setTimeout(checkDailyReminder, 3000);
}
