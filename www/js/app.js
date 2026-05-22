/* ===== Database Layer ===== */
const DB_NAME = 'TeacherSchedule';
const DB_VERSION = 1;
const STORE_NAME = 'courses';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('dateTime', 'dateTime', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbPut(db, course) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(course);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/* ===== Utility Functions ===== */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
}

function calculateEndTime(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + (durationMinutes || 0);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function calcFee(durationMinutes) {
  return Math.round((durationMinutes / 60) * 70 * 100) / 100;
}

function formatDateTime(dateStr, timeStr) {
  return `${formatDate(dateStr)} ${formatTime(timeStr || '00:00')}`;
}

function parseDateOnly(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  return formatDate(new Date());
}

function statusText(status) {
  const map = { pending: '待上课', completed: '已完成', cancelled: '已取消' };
  return map[status] || status;
}

function feedbackText(sent) {
  return sent ? '反馈已发' : '反馈未发';
}

/* ===== Toast ===== */
let toastTimer;
function showToast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ===== App State ===== */
let db = null;
let courses = [];
let currentView = 'list';
let calendarYear, calendarMonth;
let selectedDay = null;

/* ===== DOM Elements ===== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const listView = $('#list-view');
const calendarView = $('#calendar-view');
const statsView = $('#stats-view');
const courseList = $('#course-list');
const emptyState = $('#empty-state');
const courseModal = $('#course-modal');
const dayModal = $('#day-modal');
const courseForm = $('#course-form');
const modalTitle = $('#modal-title');
const courseIdInput = $('#course-id');
const calMonthLabel = $('#cal-month-label');
const calendarGrid = $('#calendar-grid');
const dayCoursesTitle = $('#day-courses-title');
const dayCoursesList = $('#day-courses-list');
const statusFilter = $('#status-filter');
const sortOrder = $('#sort-order');
const monthlyBreakdown = $('#monthly-breakdown');

/* ===== Tab Navigation ===== */
$$('#tab-bar .tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    const viewName = tab.dataset.view;
    switchView(viewName);
  });
});

function switchView(viewName) {
  currentView = viewName;
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.tab').forEach(t => t.classList.remove('active'));

  if (viewName === 'list') {
    listView.classList.add('active');
    document.querySelector('[data-view="list"]').classList.add('active');
    $('#header-title').textContent = '课程管理';
    renderCourseList();
  } else if (viewName === 'calendar') {
    calendarView.classList.add('active');
    document.querySelector('[data-view="calendar"]').classList.add('active');
    $('#header-title').textContent = '课程日历';
    initCalendar();
    renderCalendar();
  } else if (viewName === 'stats') {
    statsView.classList.add('active');
    document.querySelector('[data-view="stats"]').classList.add('active');
    $('#header-title').textContent = '课程统计';
    renderStats();
  }
}

/* ===== Modal Management ===== */
function showModal(modalEl) {
  modalEl.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideModal(modalEl) {
  modalEl.classList.remove('show');
  document.body.style.overflow = '';
}

// Close modals on backdrop click
$$('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', () => {
    hideModal(courseModal);
    hideModal(dayModal);
  });
});

$$('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    hideModal(courseModal);
    hideModal(dayModal);
  });
});

/* ===== Course CRUD ===== */
async function loadCourses() {
  if (!db) db = await openDB();
  courses = await dbGetAll(db);
}

async function saveCourse(courseData) {
  if (!db) db = await openDB();
  const duration = parseInt(courseData.duration) || 60;
  const course = {
    id: courseData.id || generateId(),
    studentName: courseData.studentName.trim(),
    date: courseData.date,
    time: courseData.time,
    dateTime: courseData.date + 'T' + courseData.time,
    duration: duration,
    fee: calcFee(duration),
    status: courseData.status || 'pending',
    feedbackSent: !!courseData.feedbackSent,
    notes: courseData.notes.trim(),
    createdAt: courseData.createdAt || new Date().toISOString()
  };
  await dbPut(db, course);
  await loadCourses();
  return course;
}

async function deleteCourse(id) {
  if (!db) db = await openDB();
  await dbDelete(db, id);
  await loadCourses();
}

function openCourseForm(course = null) {
  if (course) {
    modalTitle.textContent = '编辑课程';
    courseIdInput.value = course.id;
    $('#student-name').value = course.studentName;
    $('#course-date').value = course.date;
    $('#course-time').value = course.time;
    $('#course-duration').value = course.duration;
    $('#course-fee').value = course.fee;
    $('#course-status').value = course.status;
    $('#course-notes').value = course.notes || '';
    courseForm.dataset.mode = 'edit';
    courseForm.dataset.feedbackSent = course.feedbackSent ? '1' : '0';
  } else {
    modalTitle.textContent = '添加课程';
    courseForm.reset();
    courseIdInput.value = '';
    $('#course-date').value = todayStr();
    $('#course-time').value = '08:00';
    $('#course-duration').value = '60';
    $('#course-fee').value = calcFee(60);
    $('#course-status').value = 'pending';
    courseForm.dataset.mode = 'add';
    courseForm.dataset.feedbackSent = '0';
  }
  showModal(courseModal);
  setTimeout(() => $('#student-name').focus(), 300);
}

$('#add-btn').addEventListener('click', () => openCourseForm());
$('#btn-cancel').addEventListener('click', () => hideModal(courseModal));

$('#course-duration').addEventListener('input', () => {
  const d = parseInt($('#course-duration').value) || 0;
  $('#course-fee').value = calcFee(d);
});

courseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const duration = parseInt($('#course-duration').value) || 60;
  const data = {
    id: courseIdInput.value,
    studentName: $('#student-name').value,
    date: $('#course-date').value,
    time: $('#course-time').value,
    duration: duration,
    fee: calcFee(duration),
    status: $('#course-status').value,
    feedbackSent: courseForm.dataset.feedbackSent === '1',
    notes: $('#course-notes').value
  };

  if (!data.studentName || !data.date || !data.time) {
    showToast('请填写学生姓名、日期和时间');
    return;
  }

  const existing = courseForm.dataset.mode === 'edit' ? courses.find(c => c.id === data.id) : null;
  data.createdAt = existing ? existing.createdAt : new Date().toISOString();

  try {
    await saveCourse(data);
    hideModal(courseModal);
    showToast(courseForm.dataset.mode === 'edit' ? '课程已更新' : '课程已添加');
    refreshCurrentView();
  } catch (err) {
    console.error('Save failed:', err);
    showToast('保存失败，请重试');
  }
});

/* ===== Course List View ===== */
function getFilteredCourses() {
  let filtered = [...courses];
  const status = statusFilter.value;
  if (status !== 'all') {
    filtered = filtered.filter(c => c.status === status);
  }
  const sortDir = sortOrder.value;
  filtered.sort((a, b) => {
    return sortDir === 'asc'
      ? a.dateTime.localeCompare(b.dateTime)
      : b.dateTime.localeCompare(a.dateTime);
  });
  return filtered;
}

function renderCourseList() {
  const filtered = getFilteredCourses();
  courseList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  filtered.forEach(course => {
    const endTime = calculateEndTime(course.time, course.duration);
    const card = document.createElement('div');
    card.className = `course-card status-${course.status}`;
    card.innerHTML = `
      <div class="course-card-header">
        <span class="course-student">${escapeHtml(course.studentName)}</span>
        <div class="card-toggle-btns">
          <button class="toggle-status-btn badge-${course.status}" data-id="${course.id}">${statusText(course.status)}</button>
          <button class="toggle-feedback-btn ${course.feedbackSent ? 'feedback-sent' : 'feedback-unsent'}" data-id="${course.id}">${feedbackText(course.feedbackSent)}</button>
        </div>
      </div>
      <div class="course-datetime">
        <span>📅 ${course.date}</span>
        <span>🕐 ${formatTime(course.time)}-${endTime}</span>
      </div>
      <div class="course-info-row">
        <span>⏱ ${course.duration}分钟</span>
        <span>💰 ¥${course.fee.toFixed(2)}</span>
      </div>
      ${course.notes ? `<div class="course-notes">📝 ${escapeHtml(course.notes)}</div>` : ''}
      <div class="course-card-actions">
        <button class="btn-sm primary edit-btn" data-id="${course.id}">编辑</button>
        <button class="btn-sm danger delete-btn" data-id="${course.id}">删除</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.edit-btn')) {
        e.stopPropagation();
        const c = courses.find(co => co.id === course.id);
        if (c) openCourseForm(c);
      } else if (e.target.closest('.delete-btn')) {
        e.stopPropagation();
        confirmDelete(course);
      } else if (e.target.closest('.toggle-status-btn')) {
        e.stopPropagation();
        toggleCourseStatus(course.id);
      } else if (e.target.closest('.toggle-feedback-btn')) {
        e.stopPropagation();
        toggleCourseFeedback(course.id);
      } else {
        const c = courses.find(co => co.id === course.id);
        if (c) openCourseForm(c);
      }
    });

    courseList.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function confirmDelete(course) {
  const confirmed = confirm(`确定要删除「${course.studentName}」的课程吗？\n${course.date} ${formatTime(course.time)}`);
  if (confirmed) {
    deleteCourse(course.id).then(() => {
      showToast('课程已删除');
      refreshCurrentView();
    });
  }
}

async function toggleCourseStatus(id) {
  const course = courses.find(c => c.id === id);
  if (!course) return;
  if (course.status === 'pending') {
    course.status = 'completed';
  } else if (course.status === 'completed') {
    course.status = 'pending';
  } else {
    course.status = 'pending';
  }
  await saveCourse(course);
  showToast(`状态已更新为「${statusText(course.status)}」`);
  refreshCurrentView();
}

async function toggleCourseFeedback(id) {
  const course = courses.find(c => c.id === id);
  if (!course) return;
  course.feedbackSent = !course.feedbackSent;
  await saveCourse(course);
  showToast(course.feedbackSent ? '反馈已发' : '反馈未发');
  refreshCurrentView();
}

/* ===== Calendar View ===== */
function initCalendar() {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();
  selectedDay = null;
}

function renderCalendar() {
  calMonthLabel.textContent = `${calendarYear}年 ${calendarMonth + 1}月`;

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday = 1, Sunday = 7 (getDay: Sunday=0)
  let startDayOfWeek = firstDay.getDay();
  if (startDayOfWeek === 0) startDayOfWeek = 7;

  calendarGrid.innerHTML = '';

  const today = todayStr();

  // Previous month fill
  const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate();
  for (let i = startDayOfWeek - 1; i > 0; i--) {
    const day = prevMonthLastDay - i + 1;
    const dateStr = formatDate(new Date(calendarYear, calendarMonth - 1, day));
    calendarGrid.appendChild(createDayCell(day, dateStr, true, today));
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(calendarYear, calendarMonth, day));
    calendarGrid.appendChild(createDayCell(day, dateStr, false, today));
  }

  // Next month fill
  const totalCells = startDayOfWeek - 1 + daysInMonth;
  const remaining = 7 - (totalCells % 7);
  if (remaining < 7) {
    for (let day = 1; day <= remaining; day++) {
      const dateStr = formatDate(new Date(calendarYear, calendarMonth + 1, day));
      calendarGrid.appendChild(createDayCell(day, dateStr, true, today));
    }
  }

  // Update selected day panel
  if (selectedDay) {
    renderDayCourses(selectedDay);
  }
}

function createDayCell(day, dateStr, isOtherMonth, today) {
  const cell = document.createElement('div');
  cell.className = 'cal-day';
  cell.textContent = day;

  if (isOtherMonth) cell.classList.add('other-month');
  if (dateStr === today) cell.classList.add('today');
  if (dateStr === selectedDay) cell.classList.add('selected');

  const dayCourses = courses.filter(c => c.date === dateStr);
  if (dayCourses.length > 0) {
    const dots = document.createElement('div');
    dots.className = 'cal-day-dots';
    const statuses = [...new Set(dayCourses.map(c => c.status))];
    statuses.forEach(s => {
      const dot = document.createElement('span');
      dot.className = `cal-day-dot ${s}`;
      dots.appendChild(dot);
    });
    cell.appendChild(dots);
  }

  cell.addEventListener('click', () => {
    selectedDay = dateStr;
    renderCalendar();
    renderDayCourses(dateStr);
  });

  return cell;
}

function renderDayCourses(dateStr) {
  const dayCourses = courses.filter(c => c.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
  dayCoursesTitle.textContent = dateStr;
  dayCoursesList.innerHTML = '';

  if (dayCourses.length === 0) {
    dayCoursesList.innerHTML = '<div style="color: #999; font-size: 14px; padding: 8px 0;">当天没有课程</div>';
    return;
  }

  dayCourses.forEach(course => {
    const endTime = calculateEndTime(course.time, course.duration);
    const item = document.createElement('div');
    item.className = 'day-course-item';
    item.innerHTML = `
      <div class="day-course-info">
        <div class="day-course-student">
          <span class="course-status-badge badge-${course.status}" style="margin-right: 6px;">${statusText(course.status)}</span>
          ${escapeHtml(course.studentName)}
        </div>
        <div class="day-course-time">🕐 ${formatTime(course.time)}-${endTime} | ⏱ ${course.duration}分钟 | 💰 ¥${course.fee.toFixed(2)}</div>
      </div>
    `;
    item.addEventListener('click', () => {
      openCourseForm(course);
    });
    dayCoursesList.appendChild(item);
  });
}

$('#cal-prev').addEventListener('click', () => {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  selectedDay = null;
  renderCalendar();
  dayCoursesTitle.textContent = '选择日期查看课程';
  dayCoursesList.innerHTML = '';
});

$('#cal-next').addEventListener('click', () => {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  selectedDay = null;
  renderCalendar();
  dayCoursesTitle.textContent = '选择日期查看课程';
  dayCoursesList.innerHTML = '';
});

$('#cal-today').addEventListener('click', () => {
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();
  selectedDay = todayStr();
  renderCalendar();
  renderDayCourses(selectedDay);
});

/* ===== Statistics View ===== */
function renderStats() {
  const total = courses.length;
  const completed = courses.filter(c => c.status === 'completed').length;
  const pending = courses.filter(c => c.status === 'pending').length;
  const totalIncome = courses
    .filter(c => c.status !== 'cancelled')
    .reduce((sum, c) => sum + (c.fee || 0), 0);

  $('#stat-total').textContent = total;
  $('#stat-completed').textContent = completed;
  $('#stat-pending').textContent = pending;
  $('#stat-income').textContent = `¥${totalIncome.toFixed(2)}`;

  // Current month stats
  const now = new Date();
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthCourses = courses.filter(c => c.date.startsWith(thisMonthPrefix));
  const monthIncome = monthCourses
    .filter(c => c.status !== 'cancelled')
    .reduce((sum, c) => sum + (c.fee || 0), 0);
  const monthMinutes = monthCourses
    .filter(c => c.status === 'completed' || c.status === 'pending')
    .reduce((sum, c) => sum + (c.duration || 0), 0);

  $('#stat-month-courses').textContent = monthCourses.length;
  $('#stat-month-income').textContent = `¥${monthIncome.toFixed(2)}`;
  $('#stat-month-hours').textContent = `${(monthMinutes / 60).toFixed(1)}小时`;

  // Monthly breakdown
  const monthlyMap = {};
  courses.forEach(c => {
    const monthKey = c.date.substring(0, 7); // YYYY-MM
    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = { total: 0, completed: 0, income: 0, minutes: 0 };
    }
    monthlyMap[monthKey].total++;
    if (c.status === 'completed') monthlyMap[monthKey].completed++;
    if (c.status !== 'cancelled') monthlyMap[monthKey].income += (c.fee || 0);
    if (c.status !== 'cancelled') monthlyMap[monthKey].minutes += (c.duration || 0);
  });

  const sortedMonths = Object.keys(monthlyMap).sort().reverse();
  monthlyBreakdown.innerHTML = '';

  if (sortedMonths.length === 0) {
    monthlyBreakdown.innerHTML = '<div style="color: #999; font-size: 14px; padding: 12px 0;">暂无数据</div>';
    return;
  }

  sortedMonths.forEach(month => {
    const m = monthlyMap[month];
    const [y, mo] = month.split('-');
    const div = document.createElement('div');
    div.className = 'monthly-stat-item';
    div.innerHTML = `
      <div>
        <div class="monthly-stat-period">${y}年${parseInt(mo)}月</div>
      </div>
      <div class="monthly-stat-detail">
        ${m.total}节课 | ${m.completed}完成 | ¥${m.income.toFixed(2)} | ${(m.minutes / 60).toFixed(1)}h
      </div>
    `;
    monthlyBreakdown.appendChild(div);
  });
}

/* ===== Filter/Sort Handlers ===== */
statusFilter.addEventListener('change', () => {
  if (currentView === 'list') renderCourseList();
});

sortOrder.addEventListener('change', () => {
  if (currentView === 'list') renderCourseList();
});

/* ===== Refresh Helper ===== */
function refreshCurrentView() {
  if (currentView === 'list') renderCourseList();
  else if (currentView === 'calendar') { renderCalendar(); if (selectedDay) renderDayCourses(selectedDay); }
  else if (currentView === 'stats') renderStats();
}

/* ===== Notifications & Reminders ===== */
let reminderInterval = null;
let notificationPermission = 'default';

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    notificationPermission = result;
  } else {
    notificationPermission = Notification.permission;
  }
}

function checkUpcomingCourses() {
  if (notificationPermission !== 'granted') return;

  const now = new Date();
  const nowTime = now.getTime();

  courses.forEach(course => {
    if (course.status !== 'pending') return;

    const courseDateTime = new Date(course.dateTime);
    const courseTime = courseDateTime.getTime();
    const diffMinutes = (courseTime - nowTime) / 60000;

    // Remind 15 minutes before
    if (diffMinutes > 0 && diffMinutes <= 15) {
      const key = `reminded_${course.id}_${course.dateTime}`;
      if (sessionStorage.getItem(key)) return;

      new Notification('课程提醒', {
        body: `${course.studentName} - ${course.date} ${formatTime(course.time)}\n还有约${Math.round(diffMinutes)}分钟开始`,
        tag: key,
        requireInteraction: true,
        silent: false
      });

      sessionStorage.setItem(key, '1');
    }
  });
}

function startReminderService() {
  requestNotificationPermission();
  checkUpcomingCourses();
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(checkUpcomingCourses, 30000); // Every 30 seconds
}

/* ===== Service Worker Registration ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Silent fail - app works without SW
    });
  });
}

/* ===== App Initialization ===== */
async function initApp() {
  try {
    await loadCourses();
    renderCourseList();
    startReminderService();
  } catch (err) {
    console.error('App init error:', err);
    showToast('数据加载失败，请刷新页面');
  }
}

// Handle page visibility to refresh data
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadCourses().then(() => refreshCurrentView());
  }
});

// Prevent double-tap zoom
document.addEventListener('touchstart', function(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// Launch
initApp();
