/* ===== Database Layer ===== */
const DB_NAME = 'TeacherSchedule';
const DB_VERSION = 2;
const COURSE_STORE = 'courses';
const STUDENT_STORE = 'students';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(COURSE_STORE)) {
        const courseStore = db.createObjectStore(COURSE_STORE, { keyPath: 'id' });
        courseStore.createIndex('dateTime', 'dateTime', { unique: false });
        courseStore.createIndex('status', 'status', { unique: false });
        courseStore.createIndex('studentId', 'studentId', { unique: false });
      } else if (e.oldVersion < 2) {
        const tx = e.target.transaction;
        const courseStore = tx.objectStore(COURSE_STORE);
        if (!courseStore.indexNames.contains('studentId')) {
          courseStore.createIndex('studentId', 'studentId', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(STUDENT_STORE)) {
        const studentStore = db.createObjectStore(STUDENT_STORE, { keyPath: 'id' });
        studentStore.createIndex('name', 'name', { unique: false });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbPut(db, storeName, obj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(obj);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbDelete(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function dbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
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

function getDayOfWeek(dateStr) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const d = new Date(dateStr + 'T00:00:00');
  return days[d.getDay()];
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
let students = [];
let currentView = 'list';
let calendarYear, calendarMonth;
let selectedDay = null;
let selectedStudentId = null;

/* ===== DOM Elements ===== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const listView = $('#list-view');
const calendarView = $('#calendar-view');
const statsView = $('#stats-view');
const studentView = $('#student-view');
const studentCourseView = $('#student-course-view');
const courseList = $('#course-list');
const emptyState = $('#empty-state');
const studentList = $('#student-list');
const studentEmpty = $('#student-empty');
const studentCourseList = $('#student-course-list');
const studentCourseTitle = $('#student-course-title');
const studentBackBtn = $('#student-back-btn');
const courseModal = $('#course-modal');
const studentModal = $('#student-modal');
const studentForm = $('#student-form');
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
    selectedStudentId = null;
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
  } else if (viewName === 'student') {
    studentView.classList.add('active');
    document.querySelector('[data-view="student"]').classList.add('active');
    $('#header-title').textContent = '学生管理';
    renderStudentList();
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
    hideModal(studentModal);
    hideModal(dayModal);
  });
});

$$('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    hideModal(courseModal);
    hideModal(studentModal);
    hideModal(dayModal);
  });
});

/* ===== Course CRUD ===== */
async function loadCourses() {
  if (!db) db = await openDB();
  courses = await dbGetAll(db, COURSE_STORE);
}

async function loadStudents() {
  if (!db) db = await openDB();
  students = await dbGetAll(db, STUDENT_STORE);
}

async function saveCourse(courseData) {
  if (!db) db = await openDB();
  const duration = parseInt(courseData.duration) || 60;
  const course = {
    id: courseData.id || generateId(),
    studentId: courseData.studentId || '',
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
  await dbPut(db, COURSE_STORE, course);
  await loadCourses();
  return course;
}

async function deleteCourse(id) {
  if (!db) db = await openDB();
  await dbDelete(db, COURSE_STORE, id);
  await loadCourses();
}

/* ===== Student CRUD ===== */
async function saveStudent(studentData) {
  if (!db) db = await openDB();
  const student = {
    id: studentData.id || generateId(),
    name: studentData.name.trim(),
    phone: studentData.phone ? studentData.phone.trim() : '',
    notes: studentData.notes ? studentData.notes.trim() : '',
    createdAt: studentData.createdAt || new Date().toISOString()
  };
  await dbPut(db, STUDENT_STORE, student);
  await loadStudents();
  return student;
}

async function deleteStudent(id) {
  if (!db) db = await openDB();
  await dbDelete(db, STUDENT_STORE, id);
  await loadStudents();
}

function openCourseForm(course = null) {
  if (students.length === 0) {
    showToast('请先在「学生」标签页添加学生');
    return;
  }
  populateStudentSelect();
  if (course) {
    modalTitle.textContent = '编辑课程';
    courseIdInput.value = course.id;
    $('#student-name').value = course.studentId || '';
    courseForm.dataset.studentId = course.studentId || '';
    $('#course-date').value = course.date;
    $('#course-time').value = course.time;
    $('#course-duration').value = course.duration;
    $('#course-fee').value = course.fee;
    $('#course-status').value = course.status;
    $('#course-notes').value = course.notes || '';
    courseForm.dataset.mode = 'edit';
    courseForm.dataset.feedbackSent = course.feedbackSent ? '1' : '0';
    $('#course-recurring').checked = false;
    $('#course-recurring').parentElement.parentElement.style.display = 'none';
    $('#recurring-options').style.display = 'none';
  } else {
    modalTitle.textContent = '添加课程';
    courseForm.reset();
    courseIdInput.value = '';
    courseForm.dataset.studentId = '';
    $('#course-date').value = todayStr();
    $('#course-time').value = '08:00';
    $('#course-duration').value = '60';
    $('#course-fee').value = calcFee(60);
    $('#course-status').value = 'pending';
    courseForm.dataset.mode = 'add';
    courseForm.dataset.feedbackSent = '0';
    $('#course-recurring').checked = false;
    $('#course-recurring').parentElement.parentElement.style.display = '';
    $('#recurring-options').style.display = 'none';
  }
  showModal(courseModal);
}

function populateStudentSelect() {
  const select = $('#student-name');
  select.innerHTML = '<option value="">-- 请选择学生 --</option>';
  students.sort((a, b) => a.name.localeCompare(b.name, 'zh')).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
}

$('#add-btn').addEventListener('click', () => {
  if (currentView === 'student') {
    openStudentForm();
  } else if (currentView === 'list' && students.length === 0) {
    showToast('请先在「学生」标签页添加学生');
  } else {
    openCourseForm();
  }
});
$('#btn-cancel').addEventListener('click', () => hideModal(courseModal));
$('#student-btn-cancel').addEventListener('click', () => hideModal(studentModal));

$('#course-duration').addEventListener('input', () => {
  const d = parseInt($('#course-duration').value) || 0;
  $('#course-fee').value = calcFee(d);
});

$('#course-recurring').addEventListener('change', function() {
  $('#recurring-options').style.display = this.checked ? 'block' : 'none';
});

courseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const duration = parseInt($('#course-duration').value) || 60;
  const studentId = $('#student-name').value;
  if (!studentId) {
    showToast('请选择一个学生');
    return;
  }
  const student = students.find(s => s.id === studentId);
  const studentName = student ? student.name : '';

  if (!$('#course-date').value || !$('#course-time').value) {
    showToast('请填写日期和时间');
    return;
  }

  const isRecurring = $('#course-recurring').checked && courseForm.dataset.mode === 'add';
  const repeatWeeks = isRecurring ? (parseInt($('#course-repeat-weeks').value) || 4) : 1;
  const baseDate = $('#course-date').value;
  const baseTime = $('#course-time').value;
  const baseStatus = $('#course-status').value;
  const baseNotes = $('#course-notes').value;
  const fbSent = courseForm.dataset.feedbackSent === '1';

  try {
    for (let i = 0; i < repeatWeeks; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i * 7);
      const dateStr = formatDate(d);
      const courseData = {
        studentId: studentId,
        studentName: studentName,
        date: dateStr,
        time: baseTime,
        duration: duration,
        status: baseStatus,
        feedbackSent: fbSent,
        notes: baseNotes,
        createdAt: new Date().toISOString()
      };
      if (i === 0 && courseForm.dataset.mode === 'edit') {
        courseData.id = courseIdInput.value;
        const existing = courses.find(c => c.id === courseData.id);
        if (existing) courseData.createdAt = existing.createdAt;
      }
      await saveCourse(courseData);
    }
    hideModal(courseModal);
    showToast(isRecurring ? `已添加 ${repeatWeeks} 周重复课程` : (courseForm.dataset.mode === 'edit' ? '课程已更新' : '课程已添加'));
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
        <span>📅 ${course.date} ${getDayOfWeek(course.date)}</span>
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

/* ===== Student View ===== */
function getStudentCourses(student) {
  return courses.filter(c => {
    if (c.studentId && c.studentId === student.id) return true;
    if (!c.studentId && c.studentName === student.name) return true;
    return false;
  });
}

function renderStudentList() {
  studentList.innerHTML = '';
  if (students.length === 0) {
    studentEmpty.classList.add('visible');
    return;
  }
  studentEmpty.classList.remove('visible');

  students.sort((a, b) => a.name.localeCompare(b.name, 'zh')).forEach(student => {
    const studentCourses = getStudentCourses(student);
    const totalFee = studentCourses
      .filter(c => c.status === 'completed')
      .reduce((sum, c) => sum + (c.fee || 0), 0);

    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div class="student-card-header">
        <span class="student-name">${escapeHtml(student.name)}</span>
        <span class="student-course-count">${studentCourses.length}节课 | ¥${totalFee.toFixed(2)}</span>
      </div>
      ${student.phone ? `<div class="student-phone">📞 ${escapeHtml(student.phone)}</div>` : ''}
      ${student.notes ? `<div class="student-notes">📝 ${escapeHtml(student.notes)}</div>` : ''}
      <div class="course-card-actions">
        <button class="btn-sm primary student-edit-btn" data-id="${student.id}">编辑</button>
        <button class="btn-sm danger student-delete-btn" data-id="${student.id}">删除</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.student-edit-btn')) {
        e.stopPropagation();
        const s = students.find(st => st.id === student.id);
        if (s) openStudentForm(s);
      } else if (e.target.closest('.student-delete-btn')) {
        e.stopPropagation();
        confirmDeleteStudent(student);
      } else {
        showStudentCourses(student.id, student.name);
      }
    });

    studentList.appendChild(card);
  });
}

function showStudentCourses(studentId, studentName) {
  selectedStudentId = studentId;
  studentView.classList.remove('active');
  studentCourseView.classList.add('active');
  studentCourseTitle.textContent = `${studentName} 的课程`;
  renderStudentCourseList();
}

function renderStudentCourseList() {
  const student = students.find(s => s.id === selectedStudentId);
  if (!student) return;
  const studentCourses = getStudentCourses(student)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  studentCourseList.innerHTML = '';

  if (studentCourses.length === 0) {
    studentCourseList.innerHTML = '<div class="empty-state visible"><div class="empty-icon">📝</div><p>该学生还没有课程</p></div>';
    return;
  }

  studentCourses.forEach(course => {
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
        <span>📅 ${course.date} ${getDayOfWeek(course.date)}</span>
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

    studentCourseList.appendChild(card);
  });
}

$('#student-back-btn').addEventListener('click', () => {
  studentCourseView.classList.remove('active');
  studentView.classList.add('active');
  selectedStudentId = null;
});

/* ===== Student Form Modal ===== */
function openStudentForm(student = null) {
  if (student) {
    $('#student-modal-title').textContent = '编辑学生';
    $('#student-id').value = student.id;
    $('#student-name-input').value = student.name;
    $('#student-phone').value = student.phone || '';
    $('#student-notes-input').value = student.notes || '';
    studentForm.dataset.mode = 'edit';
  } else {
    $('#student-modal-title').textContent = '添加学生';
    studentForm.reset();
    $('#student-id').value = '';
    studentForm.dataset.mode = 'add';
  }
  showModal(studentModal);
  setTimeout(() => $('#student-name-input').focus(), 300);
}

studentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#student-name-input').value.trim();
  if (!name) {
    showToast('请输入学生姓名');
    return;
  }
  const existing = studentForm.dataset.mode === 'edit' ? students.find(s => s.id === $('#student-id').value) : null;
  const data = {
    id: $('#student-id').value,
    name: name,
    phone: $('#student-phone').value,
    notes: $('#student-notes-input').value,
    createdAt: existing ? existing.createdAt : new Date().toISOString()
  };
  try {
    await saveStudent(data);
    hideModal(studentModal);
    showToast(studentForm.dataset.mode === 'edit' ? '学生已更新' : '学生已添加');
    renderStudentList();
  } catch (err) {
    console.error('Save student failed:', err);
    showToast('保存失败，请重试');
  }
});

function confirmDeleteStudent(student) {
  const studentCourses = getStudentCourses(student);
  let msg = `确定要删除学生「${student.name}」吗？`;
  if (studentCourses.length > 0) {
    msg += `\n该学生的 ${studentCourses.length} 条课程记录也将一并删除。`;
  }
  if (confirm(msg)) {
    deleteStudentCourses(student).then(() => {
      deleteStudent(student.id).then(() => {
        showToast('学生及课程已删除');
        renderStudentList();
      });
    });
  }
}

async function deleteStudentCourses(student) {
  const studentCourses = getStudentCourses(student);
  for (const course of studentCourses) {
    await dbDelete(db, COURSE_STORE, course.id);
  }
  await loadCourses();
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

/* ===== Week View ===== */
let calViewMode = 'month';

$('#view-month-btn').addEventListener('click', () => {
  calViewMode = 'month';
  $('#view-month-btn').classList.add('active');
  $('#view-week-btn').classList.remove('active');
  $('#month-view').style.display = 'block';
  $('#week-view').style.display = 'none';
  $('#cal-prev').style.display = '';
  $('#cal-next').style.display = '';
  $('#cal-today').style.display = '';
  renderCalendar();
});

$('#view-week-btn').addEventListener('click', () => {
  calViewMode = 'week';
  $('#view-week-btn').classList.add('active');
  $('#view-month-btn').classList.remove('active');
  $('#month-view').style.display = 'none';
  $('#week-view').style.display = 'block';
  $('#cal-prev').style.display = 'none';
  $('#cal-next').style.display = 'none';
  $('#cal-today').style.display = 'none';
  calMonthLabel.textContent = '一周课程安排';
  renderWeekView();
});

let weekZoom = 60; // 60 or 30 minutes

$('#zoom-60').addEventListener('click', () => {
  weekZoom = 60;
  $('#zoom-60').classList.add('active');
  $('#zoom-30').classList.remove('active');
  renderWeekView();
});

$('#zoom-30').addEventListener('click', () => {
  weekZoom = 30;
  $('#zoom-30').classList.add('active');
  $('#zoom-60').classList.remove('active');
  renderWeekView();
});

function renderWeekView() {
  const weekGrid = $('#week-grid');
  // Remove old legend
  const oldLegend = weekGrid.parentElement.querySelector('.week-legend');
  if (oldLegend) oldLegend.remove();
  weekGrid.innerHTML = '';

  const studentColors = {};
  const colorPalette = [
    '#E3F2FD', '#FCE4EC', '#E8F5E9', '#FFF3E0', '#F3E5F5',
    '#E0F7FA', '#FFF8E1', '#EDE7F6', '#F1F8E9', '#FFEBEE',
    '#E8EAF6', '#FBE9E7', '#E0F2F1', '#FFF9C4', '#D1C4E9'
  ];
  const textPalette = [
    '#1565C0', '#C62828', '#2E7D32', '#E65100', '#7B1FA2',
    '#00695C', '#F57F17', '#4527A0', '#33691E', '#B71C1C',
    '#283593', '#BF360C', '#004D40', '#F9A825', '#4A148C'
  ];

  students.forEach((s, i) => {
    studentColors[s.id] = {
      bg: colorPalette[i % colorPalette.length],
      text: textPalette[i % textPalette.length]
    };
  });

  // Generate time slots based on zoom level
  const slots = [];
  for (let h = 7; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (weekZoom === 30) {
      slots.push(`${String(h).padStart(2, '0')}:30`);
    }
  }

  // Header row
  let html = '<div class="week-header-cell"></div>';
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  dayLabels.forEach(d => {
    html += `<div class="week-header-cell">${d}</div>`;
  });
  weekGrid.innerHTML = html;

  const weekDays = [1, 2, 3, 4, 5, 6, 0];

  slots.forEach(timeSlot => {
    const row = document.createElement('div');
    row.className = 'week-time-cell';
    const isHalf = weekZoom === 30 && timeSlot.endsWith(':30');
    row.textContent = isHalf ? '' : timeSlot;
    if (isHalf) row.style.fontSize = '9px';
    weekGrid.appendChild(row);

    const slotEnd = calculateEndTime(timeSlot, weekZoom);

    weekDays.forEach(dayOfWeek => {
      const cell = document.createElement('div');
      cell.className = 'week-slot-cell';
      if (isHalf) cell.style.minHeight = '20px';

      // Find courses that occupy this slot (including spanning)
      const slotCourses = courses.filter(c => {
        if (c.status === 'cancelled') return false;
        const courseDate = new Date(c.date + 'T00:00:00');
        if (courseDate.getDay() !== dayOfWeek) return false;
        const courseEnd = calculateEndTime(c.time, c.duration);
        const slotStart = timeSlot;
        return (c.time >= slotStart && c.time < slotEnd) ||
               (c.time <= slotStart && courseEnd > slotStart);
      });

      if (slotCourses.length > 0) {
        const firstCourse = slotCourses[0];
        const isStart = firstCourse.time === timeSlot;
        const sid = firstCourse.studentId;
        const colors = studentColors[sid] || { bg: '#E3F2FD', text: '#1565C0' };
        cell.style.background = colors.bg;
        cell.style.color = colors.text;
        cell.style.fontWeight = '600';
        cell.title = slotCourses.map(c =>
          `${c.studentName} ${c.time}-${calculateEndTime(c.time, c.duration)}`
        ).join('\n');
        if (isStart) {
          cell.textContent = slotCourses.map(c => c.studentName).join(',');
        }
      }

      weekGrid.appendChild(cell);
    });
  });

  // Legend
  const legend = document.createElement('div');
  legend.className = 'week-legend';
  legend.innerHTML = '<span style="font-size:11px;color:#999;margin-right:8px;">学生颜色：</span>';
  students.slice(0, 8).forEach(s => {
    const colors = studentColors[s.id];
    legend.innerHTML += `<span class="legend-item" style="background:${colors.bg};color:${colors.text}">${escapeHtml(s.name)}</span>`;
  });
  if (students.length > 8) {
    legend.innerHTML += `<span style="font-size:10px;color:#999;">+${students.length - 8}人</span>`;
  }
  weekGrid.parentElement.appendChild(legend);
}

/* ===== Statistics View ===== */
function renderStats() {
  const total = courses.length;
  const completed = courses.filter(c => c.status === 'completed').length;
  const pending = courses.filter(c => c.status === 'pending').length;
  const totalIncome = courses
    .filter(c => c.status === 'completed')
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
    .filter(c => c.status === 'completed')
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
    if (c.status === 'completed') monthlyMap[monthKey].income += (c.fee || 0);
    if (c.status === 'completed') monthlyMap[monthKey].minutes += (c.duration || 0);
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
  else if (currentView === 'student') { if (selectedStudentId) renderStudentCourseList(); else renderStudentList(); }
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

function sendNotification(title, body) {
  if (notificationPermission !== 'granted') return;
  try {
    new Notification(title, {
      body: body,
      requireInteraction: true,
      silent: false
    });
  } catch (e) {
    // Notification API not available
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

    // Reminder 1: Night before class day at 8:00 PM
    if (diffMinutes > 0) {
      const eveningKey = `reminded_evening_${course.id}_${course.date}`;
      if (!sessionStorage.getItem(eveningKey)) {
        const eveningBefore = new Date(course.date + 'T20:00:00');
        eveningBefore.setDate(eveningBefore.getDate() - 1);
        if (nowTime >= eveningBefore.getTime()) {
          sendNotification('📅 明天有课',
            `${course.studentName}\n${course.date} ${formatTime(course.time)}-${calculateEndTime(course.time, course.duration)}`);
          sessionStorage.setItem(eveningKey, '1');
        }
      }
    }

    // Reminder 2: 1 hour before class
    const oneHourKey = `reminded_1h_${course.id}_${course.dateTime}`;
    if (diffMinutes > 0 && diffMinutes <= 60 && !sessionStorage.getItem(oneHourKey)) {
      sendNotification('⏰ 课程即将开始',
        `${course.studentName}\n${course.date} ${formatTime(course.time)}-${calculateEndTime(course.time, course.duration)}\n还有约${Math.round(diffMinutes)}分钟开始`);
      sessionStorage.setItem(oneHourKey, '1');
    }
  });

  // Clean old session keys (keep last 100 courses worth)
  const keys = Object.keys(sessionStorage);
  const remindKeys = keys.filter(k => k.startsWith('reminded_'));
  if (remindKeys.length > 200) {
    remindKeys.slice(0, 100).forEach(k => sessionStorage.removeItem(k));
  }
}

function startReminderService() {
  requestNotificationPermission();
  checkUpcomingCourses();
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(checkUpcomingCourses, 60000);
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
    await loadStudents();
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
