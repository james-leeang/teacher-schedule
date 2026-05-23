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
    $('#add-btn').style.display = '';
    selectedStudentId = null;
    renderCourseList();
  } else if (viewName === 'calendar') {
    calendarView.classList.add('active');
    document.querySelector('[data-view="calendar"]').classList.add('active');
    $('#header-title').textContent = '课程日历';
    $('#add-btn').style.display = 'none';
    initCalendar();
    renderCalendar();
  } else if (viewName === 'stats') {
    statsView.classList.add('active');
    document.querySelector('[data-view="stats"]').classList.add('active');
    $('#header-title').textContent = '课程统计';
    $('#add-btn').style.display = 'none';
    renderStats();
  } else if (viewName === 'student') {
    studentView.classList.add('active');
    document.querySelector('[data-view="student"]').classList.add('active');
    $('#header-title').textContent = '学生管理';
    $('#add-btn').style.display = '';
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

/* ===== Custom Confirm Dialog ===== */
function showConfirm(msg) {
  return new Promise((resolve) => {
    $('#confirm-msg').textContent = msg;
    const dialog = $('#confirm-dialog');
    dialog.classList.add('show');

    const cleanup = () => {
      dialog.classList.remove('show');
      $('#confirm-ok').removeEventListener('click', onOk);
      $('#confirm-cancel').removeEventListener('click', onCancel);
      document.querySelector('#confirm-backdrop').removeEventListener('click', onCancel);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    $('#confirm-ok').addEventListener('click', onOk);
    $('#confirm-cancel').addEventListener('click', onCancel);
    document.querySelector('#confirm-backdrop').addEventListener('click', onCancel);
  });
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

/* ===== BottomSheet Select Component ===== */
const bottomSheet = $('#bottomsheet');
const bsOptions = bottomSheet.querySelector('.bs-options');
const bsTitle = bottomSheet.querySelector('.bs-title');
let bsCallback = null;

bottomSheet.querySelector('.bs-backdrop').addEventListener('click', () => {
  bottomSheet.classList.remove('show');
  bsCallback = null;
});
bottomSheet.querySelector('.bs-done').addEventListener('click', () => {
  bottomSheet.classList.remove('show');
  bsCallback = null;
});

function openBottomSheet(title, options, currentValue, callback) {
  bsTitle.textContent = title;
  bsOptions.innerHTML = '';
  options.forEach(opt => {
    const div = document.createElement('div');
    div.className = 'bs-option' + (opt.value === currentValue ? ' selected' : '');
    div.innerHTML = `<span>${opt.label}</span><span class="bs-check">✓</span>`;
    div.addEventListener('click', () => {
      bottomSheet.classList.remove('show');
      if (callback) callback(opt.value, opt.label);
      bsCallback = null;
    });
    bsOptions.appendChild(div);
  });
  bottomSheet.classList.add('show');
  bsCallback = callback;
}

// 周视图长按课程块时弹出的操作菜单：编辑/标记完成/改时间/删除
function showCourseActionMenu(course) {
  bsTitle.textContent = `${course.studentName} · ${course.date} ${formatTime(course.time)}`;
  bsOptions.innerHTML = '';
  const actions = [
    { value: 'edit',     label: '✏️  编辑课程',     color: '' },
    course.status === 'completed'
      ? { value: 'mark-pending',   label: '↩️  标记为待上课',  color: '' }
      : { value: 'mark-completed', label: '✅  标记为已完成',  color: '' },
    { value: 'move',     label: '📐  改时间（点击新位置）',  color: '' },
    { value: 'delete',   label: '🗑️  删除课程',     color: 'danger' }
  ];
  actions.forEach(act => {
    const div = document.createElement('div');
    div.className = 'bs-option' + (act.color === 'danger' ? ' bs-option-danger' : '');
    div.innerHTML = `<span>${act.label}</span>`;
    div.addEventListener('click', () => {
      bottomSheet.classList.remove('show');
      handleCourseAction(course, act.value);
    });
    bsOptions.appendChild(div);
  });
  bottomSheet.classList.add('show');
  bsCallback = null;
}

// 待移动的课程 id（全局态，只允许一个进入拖动模式）
let pendingMoveCourseId = null;

async function handleCourseAction(course, action) {
  const c = courses.find(co => co.id === course.id);
  if (!c) return;
  if (action === 'edit') {
    openCourseForm(c);
  } else if (action === 'delete') {
    confirmDelete(c);
  } else if (action === 'mark-completed' || action === 'mark-pending') {
    const newStatus = action === 'mark-completed' ? 'completed' : 'pending';
    c.status = newStatus;
    await saveCourse(c);
    showToast(action === 'mark-completed' ? '已标记为完成' : '已标记为待上课');
    refreshCurrentView();
  } else if (action === 'move') {
    pendingMoveCourseId = c.id;
    showToast('请点击新的时间位置');
    refreshCurrentView();   // 重渲，让课程块带上虚线"待移动"样式
  }
}

// 把指定课程移到新的(date, time)
async function moveCourseTo(courseId, newDate, newTime) {
  const c = courses.find(co => co.id === courseId);
  if (!c) return;
  // 冲突检测
  const [bh, bm] = newTime.split(':').map(Number);
  const newStart = bh * 60 + bm;
  const newEnd = newStart + (c.duration || 60);
  const conflict = courses.find(co => {
    if (co.id === courseId) return false;
    if (co.status === 'cancelled') return false;
    if (co.date !== newDate) return false;
    const [ch, cm] = co.time.split(':').map(Number);
    const cStart = ch * 60 + cm;
    const cEnd = cStart + (co.duration || 60);
    return newStart < cEnd && newEnd > cStart;
  });
  if (conflict) {
    const ok = await showConfirm(`${newDate} ${newTime} 与 ${conflict.studentName} 的课程冲突，仍要移过去吗？`);
    if (!ok) {
      pendingMoveCourseId = null;
      refreshCurrentView();
      return;
    }
  }
  c.date = newDate;
  c.time = newTime;
  await saveCourse(c);
  pendingMoveCourseId = null;
  showToast('课程已移动');
  refreshCurrentView();
}

function createCustomSelect(selectEl, title) {
  // 防止重复包装：如果已经有 custom-select 兄弟节点，直接跳过
  if (selectEl.parentNode.querySelector('.custom-select')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  wrapper.style.display = 'none'; // hide initially

  const updateText = () => {
    const opt = selectEl.options[selectEl.selectedIndex];
    wrapper.textContent = opt ? opt.textContent : '';
  };
  updateText();

  wrapper.addEventListener('click', () => {
    const options = [];
    for (let i = 0; i < selectEl.options.length; i++) {
      const o = selectEl.options[i];
      if (o.value) options.push({ value: o.value, label: o.textContent });
    }
    openBottomSheet(title, options, selectEl.value, (val) => {
      selectEl.value = val;
      updateText();
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  selectEl.parentNode.insertBefore(wrapper, selectEl);
  selectEl.style.display = 'none';
  wrapper.style.display = '';

  // Also update when changed programmatically
  selectEl.addEventListener('change', updateText);
}

// Initialize all selects as custom bottom sheets
// 自动扫描所有 <select>，避免以后新增表单又忘了登记
function initAllCustomSelects() {
  document.querySelectorAll('select').forEach(sel => {
    // 用紧邻的 <label> 文字作为弹窗标题；若拿不到则用一些已知 id 的兜底
    let title = '请选择';
    const label = sel.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      title = label.textContent.replace(/\s*\*\s*$/, '').trim();
    } else {
      const titleMap = {
        'status-filter': '选择课程状态',
        'sort-order': '选择排序方式',
        'course-status': '选择课程状态',
        'student-name': '选择学生'
      };
      if (titleMap[sel.id]) title = titleMap[sel.id];
    }
    createCustomSelect(sel, title);
  });
}

function ensureStudentCustomSelect() {
  const select = $('#student-name');
  if (!select.parentNode.querySelector('.custom-select')) {
    createCustomSelect(select, '选择学生');
  }
}

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
  // 学生颜色索引：新学生分配一个固定 colorIndex 存到数据库，
  // 这样后续删除/添加学生时已有学生的颜色不会跳变
  let colorIndex = studentData.colorIndex;
  if (typeof colorIndex !== 'number') {
    // 找一个当前没人用的颜色 index（颜色板有 15 种）
    const used = new Set(students.map(s => s.colorIndex).filter(i => typeof i === 'number'));
    const PALETTE_SIZE = 15;
    colorIndex = 0;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      if (!used.has(i)) { colorIndex = i; break; }
      colorIndex = students.length % PALETTE_SIZE;  // 都用完就轮换
    }
  }
  const student = {
    id: studentData.id || generateId(),
    name: studentData.name.trim(),
    phone: studentData.phone ? studentData.phone.trim() : '',
    notes: studentData.notes ? studentData.notes.trim() : '',
    colorIndex: colorIndex,
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
  ensureStudentCustomSelect();
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
  // Update custom select trigger if exists
  const trigger = select.parentNode.querySelector('.custom-select');
  if (trigger) {
    const opt = select.options[select.selectedIndex];
    trigger.textContent = opt ? opt.textContent : '';
  }
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

  // 冲突检测：检查所有要添加的日期是否和已有课程时间重叠
  const editingId = courseForm.dataset.mode === 'edit' ? courseIdInput.value : null;
  const conflicts = [];
  for (let i = 0; i < repeatWeeks; i++) {
    const d = new Date(baseDate + 'T00:00:00');
    d.setDate(d.getDate() + i * 7);
    const dateStr = formatDate(d);
    const [bh, bm] = baseTime.split(':').map(Number);
    const newStart = bh * 60 + bm;
    const newEnd = newStart + duration;
    courses.forEach(c => {
      if (c.id === editingId) return;      // 编辑模式跳过自己
      if (c.status === 'cancelled') return; // 已取消的不算冲突
      if (c.date !== dateStr) return;
      const [ch, cm] = c.time.split(':').map(Number);
      const cStart = ch * 60 + cm;
      const cEnd = cStart + (c.duration || 60);
      // 区间重叠判断
      if (newStart < cEnd && newEnd > cStart) {
        conflicts.push(`${dateStr} ${c.time} ${c.studentName}`);
      }
    });
  }
  if (conflicts.length > 0) {
    const msg = `检测到时间冲突：\n${conflicts.slice(0, 3).join('\n')}${conflicts.length > 3 ? `\n…还有 ${conflicts.length - 3} 条` : ''}\n\n仍要保存吗？`;
    const ok = await showConfirm(msg);
    if (!ok) return;
  }

  try {
    for (let i = 0; i < repeatWeeks; i++) {
      // 强制本地时间解析，避免 WebView 不同时区下把 "2025-05-24" 当成 UTC 偏移到上一天
      const d = new Date(baseDate + 'T00:00:00');
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

// 课程列表点击事件代理（只绑一次）
let _courseListBound = false;
function bindCourseListEvents() {
  if (_courseListBound) return;
  _courseListBound = true;
  courseList.addEventListener('click', (e) => {
    const card = e.target.closest('.course-card');
    if (!card) return;
    const id = card.dataset.courseId;
    if (!id) return;
    const c = courses.find(co => co.id === id);
    if (!c) return;
    if (e.target.closest('.edit-btn')) { e.stopPropagation(); openCourseForm(c); }
    else if (e.target.closest('.delete-btn')) { e.stopPropagation(); confirmDelete(c); }
    else if (e.target.closest('.toggle-status-btn')) { e.stopPropagation(); toggleCourseStatus(c.id); }
    else if (e.target.closest('.toggle-feedback-btn')) { e.stopPropagation(); toggleCourseFeedback(c.id); }
    else { openCourseForm(c); }
  });
}

function renderCourseList() {
  bindCourseListEvents();
  const filtered = getFilteredCourses();
  courseList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  // 用 DocumentFragment 一次性 append，比 N 次 appendChild 快得多（大列表性能优化）
  const frag = document.createDocumentFragment();
  filtered.forEach(course => {
    const endTime = calculateEndTime(course.time, course.duration);
    const card = document.createElement('div');
    card.className = `course-card status-${course.status}`;
    card.dataset.courseId = course.id;
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
    frag.appendChild(card);
  });
  courseList.appendChild(frag);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function confirmDelete(course) {
  const msg = `确定要删除「${course.studentName}」的课程吗？\n${course.date} ${formatTime(course.time)}`;
  showConfirm(msg).then(confirmed => {
    if (confirmed) {
      deleteCourse(course.id).then(() => {
        showToast('课程已删除');
        refreshCurrentView();
      });
    }
  });
}

async function toggleCourseStatus(id) {
  const course = courses.find(c => c.id === id);
  if (!course) return;
  const newStatus = course.status === 'pending' ? 'completed' : 'pending';
  const confirmed = await showConfirm(`确定将「${course.studentName}」的状态切换为「${statusText(newStatus)}」吗？`);
  if (!confirmed) return;
  course.status = newStatus;
  await saveCourse(course);
  showToast(`状态已更新为「${statusText(course.status)}」`);
  refreshCurrentView();
}

async function toggleCourseFeedback(id) {
  const course = courses.find(c => c.id === id);
  if (!course) return;
  const newState = !course.feedbackSent;
  const label = newState ? '反馈已发' : '反馈未发';
  const confirmed = await showConfirm(`确定将「${course.studentName}」的反馈状态切换为「${label}」吗？`);
  if (!confirmed) return;
  course.feedbackSent = newState;
  await saveCourse(course);
  showToast(label);
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
  showConfirm(msg).then(confirmed => {
    if (confirmed) {
      deleteStudentCourses(student).then(() => {
        deleteStudent(student.id).then(() => {
          showToast('学生及课程已删除');
          renderStudentList();
        });
      });
    }
  });
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
  if (calViewMode === 'week') {
    navigateWeek(-1);
    return;
  }
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  selectedDay = null;
  renderCalendar();
  dayCoursesTitle.textContent = '选择日期查看课程';
  dayCoursesList.innerHTML = '';
});

$('#cal-next').addEventListener('click', () => {
  if (calViewMode === 'week') {
    navigateWeek(1);
    return;
  }
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  selectedDay = null;
  renderCalendar();
  dayCoursesTitle.textContent = '选择日期查看课程';
  dayCoursesList.innerHTML = '';
});

$('#cal-today').addEventListener('click', () => {
  if (calViewMode === 'week') {
    initWeekView();         // 跳回本周
    renderWeekView();
    return;
  }
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
  // 周视图模式下保留左右按钮（用于切周）和"今天"按钮（跳回本周）
  $('#cal-prev').style.display = '';
  $('#cal-next').style.display = '';
  $('#cal-today').style.display = '';
  initWeekView();
  navigateWeek(0);
});

let currentWeekMonday = null;

function initWeekView() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  currentWeekMonday = new Date(now);
  currentWeekMonday.setDate(now.getDate() + diff);
  currentWeekMonday.setHours(0, 0, 0, 0);
}

function navigateWeek(offset) {
  currentWeekMonday.setDate(currentWeekMonday.getDate() + offset * 7);
  renderWeekView();
}

function renderWeekView() {
  const body = $('#timetable-body');
  body.innerHTML = '';
  const oldLegend = body.parentElement.parentElement.querySelector('.week-legend');
  if (oldLegend) oldLegend.remove();

  const HOUR_HEIGHT = 68;
  const START_HOUR = 8;     // 从 8:00 开始显示（之前是 7:00，按需求去掉 8 点前）
  const END_HOUR = 22;
  const slotMin = 60;
  const TIME_COL_WIDTH = 44;  // 与 CSS .timetable-row grid-template-columns 一致

  // Build week dates
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() + i);
    weekDates.push(d);
  }
  const weekEnd = new Date(currentWeekMonday);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // 把"周范围"写到顶部 cal-month-label（之前的独立 week-range-label 行已删除）
  calMonthLabel.textContent =
    `${currentWeekMonday.getMonth() + 1}/${currentWeekMonday.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  // Build header with dates
  const header = $('#timetable-header');
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  header.innerHTML = '<div class="th-time"></div>';
  dayLabels.forEach((label, i) => {
    const d = weekDates[i];
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    header.innerHTML += `<div class="th-day${isToday ? ' today' : ''}">${label}<span class="th-date">${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  });

  // Build student color map
  // 优先使用学生数据中的 colorIndex（新版本会自动分配并固化），
  // 老数据没有该字段时退回用数组下标，保证向后兼容
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
    const idx = typeof s.colorIndex === 'number' ? s.colorIndex : i;
    studentColors[s.id] = {
      bg: colorPalette[idx % colorPalette.length],
      text: textPalette[idx % textPalette.length]
    };
  });

  let rowNum = 0;
  for (let h = START_HOUR; h < END_HOUR; h++) {
    rowNum++;
    const tStart = `${String(h).padStart(2, '0')}:00`;
    const tEnd = `${String(h + 1).padStart(2, '0')}:00`;

    const row = document.createElement('div');
    row.className = 'timetable-row';

    // Time cell
    const timeCell = document.createElement('div');
    timeCell.className = 'tt-time';
    timeCell.innerHTML = `<span class="tt-num">${rowNum}</span><span class="tt-range">${tStart}-${tEnd}</span>`;
    row.appendChild(timeCell);

    // 7 day columns
    const dayMap = [1, 2, 3, 4, 5, 6, 0];
    for (let d = 0; d < 7; d++) {
      const slot = document.createElement('div');
      slot.className = 'tt-slot';
      slot.dataset.day = dayMap[d];
      slot.dataset.time = tStart;
      slot.dataset.dow = d;
      slot.dataset.row = rowNum;

      slot.addEventListener('click', (e) => {
        // 1. 该格被其他跨格课程覆盖 → 不能添加也不能作为移动目标
        const occ = body.__occupiedSlots;
        if (occ && occ.has(`${d}-${rowNum - 1}`)) return;

        // 2. 如果有待移动的课程，把它移到这一格
        if (pendingMoveCourseId) {
          const dowIdx = parseInt(slot.dataset.dow);
          const weekDate = new Date(currentWeekMonday);
          weekDate.setDate(weekDate.getDate() + dowIdx);
          const newDate = formatDate(weekDate);
          const newTime = slot.dataset.time;
          moveCourseTo(pendingMoveCourseId, newDate, newTime);
          return;
        }

        // 3. 正常添加流程：显示"+"占位
        body.querySelectorAll('.tt-add-mark').forEach(m => m.remove());
        const mark = document.createElement('div');
        mark.className = 'tt-add-mark';
        mark.textContent = '+';
        mark.addEventListener('click', (ev) => {
          ev.stopPropagation();
          quickAddCourse(parseInt(slot.dataset.day), slot.dataset.time, slot.dataset.dow, 60);
        });
        slot.appendChild(mark);
      });

      row.appendChild(slot);
    }

    body.appendChild(row);
  }

  // Long-press multi-select for quick add
  // 状态变量提到 window.__weekViewState，避免每次 renderWeekView 都新建
  // 事件监听器也只在第一次绑定，否则切周会累积导致触发多次
  const ws = (window.__weekViewState = window.__weekViewState || {
    selectTimer: null,
    selectActive: false,
    selectStartSlot: null,
    selectDay: null,
    selectStartTime: null,
    selectEndTime: null,
    startX: 0,
    startY: 0,
    swipeStartX: 0,
    suppressNextClick: false,   // 长按多选完成后抑制后续 click，避免误触发 "+"
    bound: false
  });

  function isSlotOccupied(slot) {
    if (!slot) return true;
    // 课程块现在挂在 body 上而不是 slot 里，所以不能用 slot.querySelector
    // 完全通过 __occupiedSlots 判断
    const occ = body.__occupiedSlots;
    if (occ) {
      const dow = parseInt(slot.dataset.dow);
      const rowIdx = parseInt(slot.dataset.row) - 1;
      if (occ.has(`${dow}-${rowIdx}`)) return true;
    }
    return false;
  }

  function highlightSlot(slot) {
    if (slot && !isSlotOccupied(slot)) {
      slot.classList.add('tt-slot-selected');
    }
  }

  function clearSelection() {
    body.querySelectorAll('.tt-slot-selected').forEach(s => s.classList.remove('tt-slot-selected'));
  }

  function finishMultiSelect() {
    const selectedSlots = body.querySelectorAll('.tt-slot-selected');
    if (selectedSlots.length >= 1 && ws.selectDay !== null && ws.selectStartSlot) {
      const lastSlot = selectedSlots[selectedSlots.length - 1];
      const endTimeForCalc = calculateEndTime(lastSlot.dataset.time, 60);
      const [sh, sm] = ws.selectStartTime.split(':').map(Number);
      const [eh, em] = endTimeForCalc.split(':').map(Number);
      const duration = (eh * 60 + em) - (sh * 60 + sm);
      quickAddCourse(ws.selectDay, ws.selectStartTime, ws.selectStartSlot.dataset.dow, Math.max(duration, 60));
    }
    clearSelection();
  }

  if (!ws.bound) {
    ws.bound = true;

    body.addEventListener('touchstart', (e) => {
      const slot = e.target.closest('.tt-slot');
      if (!slot || isSlotOccupied(slot)) return;
      ws.selectStartSlot = slot;
      ws.selectDay = parseInt(slot.dataset.day);
      ws.selectStartTime = slot.dataset.time;
      ws.selectEndTime = slot.dataset.time;
      ws.startX = e.touches[0].clientX;
      ws.startY = e.touches[0].clientY;
      clearTimeout(ws.selectTimer);
      ws.selectTimer = setTimeout(() => {
        ws.selectActive = true;
        clearSelection();
        highlightSlot(slot);
        // 手机震动反馈，提示长按已激活
        if (navigator.vibrate) navigator.vibrate(20);
      }, 400);
    }, { passive: true });

    body.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      // 还没激活长按时：如果手指明显移动了，取消计时器（用户想滚动页面）
      if (!ws.selectActive) {
        const dx = Math.abs(touch.clientX - ws.startX);
        const dy = Math.abs(touch.clientY - ws.startY);
        if (dx > 8 || dy > 8) {
          clearTimeout(ws.selectTimer);
        }
        return;
      }
      // 已激活长按多选：阻止页面滚动，跟踪手指
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const slot = el ? el.closest('.tt-slot') : null;
      if (slot && !isSlotOccupied(slot) && parseInt(slot.dataset.day) === ws.selectDay) {
        ws.selectEndTime = slot.dataset.time;
        clearSelection();
        const rows = body.querySelectorAll('.timetable-row');
        const colIdx = parseInt(ws.selectStartSlot.dataset.dow) + 1;
        let inRange = false;
        rows.forEach(r => {
          const s = r.children[colIdx];
          if (s === ws.selectStartSlot) inRange = true;
          if (s === slot) { highlightSlot(s); inRange = false; }
          else if (inRange) highlightSlot(s);
        });
      }
    }, { passive: false });

    body.addEventListener('touchend', () => {
      clearTimeout(ws.selectTimer);
      if (!ws.selectActive) return;
      ws.selectActive = false;
      ws.suppressNextClick = true;   // 阻止接下来的 click 派发"+"
      finishMultiSelect();
      setTimeout(() => { ws.suppressNextClick = false; }, 300);
    });

    body.addEventListener('touchcancel', () => {
      clearTimeout(ws.selectTimer);
      ws.selectActive = false;
      clearSelection();
    });

    // 全局 click 拦截器：长按多选刚结束的话，吃掉这次 click，避免 + 被误触发
    body.addEventListener('click', (e) => {
      if (ws.suppressNextClick) {
        e.stopPropagation();
        e.preventDefault();
        ws.suppressNextClick = false;
      }
    }, true);   // capture 阶段

    // Mouse events for desktop
    body.addEventListener('mousedown', (e) => {
      const slot = e.target.closest('.tt-slot');
      if (!slot || isSlotOccupied(slot)) return;
      if (e.target.closest('.tt-add-mark')) return;
      ws.selectStartSlot = slot;
      ws.selectDay = parseInt(slot.dataset.day);
      ws.selectStartTime = slot.dataset.time;
      ws.selectEndTime = slot.dataset.time;
      ws.startX = e.clientX;
      ws.startY = e.clientY;
      clearTimeout(ws.selectTimer);
      ws.selectTimer = setTimeout(() => {
        ws.selectActive = true;
        clearSelection();
        highlightSlot(slot);
      }, 400);
    });

    body.addEventListener('mousemove', (e) => {
      if (!ws.selectActive) {
        const dx = Math.abs(e.clientX - ws.startX);
        const dy = Math.abs(e.clientY - ws.startY);
        if (dx > 8 || dy > 8) clearTimeout(ws.selectTimer);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const slot = el ? el.closest('.tt-slot') : null;
      if (slot && !isSlotOccupied(slot) && parseInt(slot.dataset.day) === ws.selectDay) {
        ws.selectEndTime = slot.dataset.time;
        clearSelection();
        const rows = body.querySelectorAll('.timetable-row');
        const colIdx = parseInt(ws.selectStartSlot.dataset.dow) + 1;
        let inRange = false;
        rows.forEach(r => {
          const s = r.children[colIdx];
          if (s === ws.selectStartSlot) inRange = true;
          if (s === slot) { highlightSlot(s); inRange = false; }
          else if (inRange && s && !isSlotOccupied(s)) highlightSlot(s);
        });
      }
    });

    document.addEventListener('mouseup', () => {
      clearTimeout(ws.selectTimer);
      if (!ws.selectActive) return;
      ws.selectActive = false;
      ws.suppressNextClick = true;
      finishMultiSelect();
      setTimeout(() => { ws.suppressNextClick = false; }, 300);
    });

    // Swipe to navigate weeks
    body.addEventListener('touchstart', (e) => {
      if (e.target.closest('.tt-course')) return;
      ws.swipeStartX = e.touches[0].clientX;
    }, { passive: true });

    body.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - ws.swipeStartX;
      if (Math.abs(dx) > 60 && !ws.selectActive) {
        navigateWeek(dx < 0 ? 1 : -1);
      }
    });
  }

  // Lay out course blocks
  // 注意：课程块定位到 .timetable-body（而不是单个 slot），因为 slot 是 grid
  // 子元素，每行一个独立的 stacking context，绝对定位的课程块无法跨行显示。
  // 算出整张表的绝对像素坐标，把所有课程块作为 body 的子元素。
  const dayMap = [1, 2, 3, 4, 5, 6, 0];
  const rows = body.querySelectorAll('.timetable-row');

  // 等渲染完后再获取每一列的真实宽度（除时间列以外的 7 列等宽）
  // 用 body 自身宽度减去时间列宽，再除 7
  const bodyWidth = body.clientWidth || body.parentElement.clientWidth || 380;
  const colWidth = (bodyWidth - TIME_COL_WIDTH) / 7;

  const totalMinutesStart = START_HOUR * 60;

  // 记录每个 slot 被哪些课程覆盖（用于禁用空白格的添加点击）
  // key 格式："{dow}-{rowIdx}"，value 为 true
  const occupiedSlots = new Set();

  // 当前显示这一周的日期范围（用于过滤课程，避免每周都显示同一节课）
  const weekStartMs = currentWeekMonday.getTime();
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;  // 不含周日24点之后

  courses.forEach(course => {
    if (course.status === 'cancelled') return;
    const cDate = new Date(course.date + 'T00:00:00');
    // 只渲染本周内的课程！之前漏了这个判断导致每周同一星期都重复显示
    const cMs = cDate.getTime();
    if (cMs < weekStartMs || cMs >= weekEndMs) return;

    const dow = cDate.getDay();
    const colIdx = dayMap.indexOf(dow);
    if (colIdx < 0) return;

    const [ch, cm] = course.time.split(':').map(Number);
    const startMin = ch * 60 + cm - totalMinutesStart;
    const durationMin = course.duration;
    if (startMin < 0) return;  // 课程在显示窗口之前

    // 像素坐标
    const topPx = (startMin / slotMin) * HOUR_HEIGHT;
    const heightPx = Math.max(HOUR_HEIGHT * 0.5, (durationMin / slotMin) * HOUR_HEIGHT);
    const leftPx = TIME_COL_WIDTH + colIdx * colWidth;

    // 标记被覆盖的所有 slot（按整行计算）
    const startRowIdx = Math.floor(startMin / slotMin);
    const endRowIdx = Math.ceil((startMin + durationMin) / slotMin) - 1;
    for (let r = startRowIdx; r <= endRowIdx; r++) {
      occupiedSlots.add(`${colIdx}-${r}`);
    }

    const colors = studentColors[course.studentId] || { bg: '#E3F2FD', text: '#1565C0' };
    const isCompleted = course.status === 'completed';
    const isPendingMove = course.id === pendingMoveCourseId;
    const block = document.createElement('div');
    block.className = 'tt-course'
      + (isCompleted ? ' tt-course-done' : '')
      + (isPendingMove ? ' tt-course-moving' : '');
    block.dataset.courseId = course.id;
    if (isCompleted) {
      block.style.background = '#E8E8E8';
      block.style.color = '#888';
    } else {
      block.style.background = colors.bg;
      block.style.color = colors.text;
    }
    block.style.left = (leftPx + 2) + 'px';
    block.style.top = topPx + 'px';
    block.style.width = (colWidth - 4) + 'px';
    block.style.height = (heightPx - 2) + 'px';
    block.title = `${course.studentName} ${course.time}-${calculateEndTime(course.time, course.duration)}`;
    block.innerHTML = `<span class="tt-course-name">${escapeHtml(course.studentName)}</span><span class="tt-course-time">${formatTime(course.time)}-${calculateEndTime(course.time, course.duration)}</span>`;

    // 长按计时器：长按 500ms 后弹出操作菜单（编辑/标记完成/删除）
    let pressTimer = null;
    let pressX = 0, pressY = 0;
    let pressMoved = false;

    const startPress = (x, y) => {
      pressMoved = false;
      pressX = x; pressY = y;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (pressMoved) return;
        if (navigator.vibrate) navigator.vibrate(20);
        showCourseActionMenu(course);
        pressTimer = null;
      }, 500);
    };
    const movePress = (x, y) => {
      if (Math.abs(x - pressX) > 8 || Math.abs(y - pressY) > 8) {
        pressMoved = true;
        clearTimeout(pressTimer);
      }
    };
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };

    block.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startPress(t.clientX, t.clientY);
    }, { passive: true });
    block.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      movePress(t.clientX, t.clientY);
    }, { passive: true });
    block.addEventListener('touchend', cancelPress);
    block.addEventListener('touchcancel', cancelPress);

    block.addEventListener('mousedown', (e) => startPress(e.clientX, e.clientY));
    block.addEventListener('mousemove', (e) => movePress(e.clientX, e.clientY));
    block.addEventListener('mouseup', cancelPress);
    block.addEventListener('mouseleave', cancelPress);

    block.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pressMoved) return;
      // 在"待移动"模式下点击任何课程块都取消移动模式
      if (pendingMoveCourseId) {
        pendingMoveCourseId = null;
        showToast('已取消移动');
        refreshCurrentView();
        return;
      }
      const c = courses.find(co => co.id === course.id);
      if (c) openCourseForm(c);
    });

    body.appendChild(block);
  });

  // 把"哪些 slot 被占用"信息存到 body 上，供点击/长按时查询
  body.__occupiedSlots = occupiedSlots;

  // 本周概览：节数 + 已完成收入 + 预计总收入
  const oldSummary = body.parentElement.parentElement.querySelector('.week-summary');
  if (oldSummary) oldSummary.remove();
  const weekCourses = courses.filter(c => {
    if (c.status === 'cancelled') return false;
    const cMs = new Date(c.date + 'T00:00:00').getTime();
    return cMs >= weekStartMs && cMs < weekEndMs;
  });
  const totalCount = weekCourses.length;
  const completedCount = weekCourses.filter(c => c.status === 'completed').length;
  const actualIncome = weekCourses
    .filter(c => c.status === 'completed')
    .reduce((s, c) => s + (c.fee || 0), 0);
  const plannedIncome = weekCourses.reduce((s, c) => s + (c.fee || 0), 0);
  const summary = document.createElement('div');
  summary.className = 'week-summary';
  summary.innerHTML = `
    <div class="ws-item">
      <div class="ws-num">${totalCount}</div>
      <div class="ws-label">本周课程</div>
    </div>
    <div class="ws-item">
      <div class="ws-num">${completedCount}</div>
      <div class="ws-label">已完成</div>
    </div>
    <div class="ws-item ws-money">
      <div class="ws-num">¥${actualIncome.toFixed(0)}</div>
      <div class="ws-label">已收入</div>
    </div>
    <div class="ws-item">
      <div class="ws-num">¥${plannedIncome.toFixed(0)}</div>
      <div class="ws-label">预计</div>
    </div>
  `;
  body.parentElement.parentElement.appendChild(summary);

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
  body.parentElement.parentElement.appendChild(legend);
}

// Remove + marks when clicking outside timetable
document.addEventListener('click', (e) => {
  if (!e.target.closest('.tt-slot') && !e.target.closest('.tt-add-mark')) {
    document.querySelectorAll('.tt-add-mark').forEach(m => m.remove());
  }
});

function quickAddCourse(targetDay, time, dowIdx, duration) {
  if (students.length === 0) {
    showToast('请先在「学生」标签页添加学生');
    return;
  }
  // Use the date from the currently displayed week
  const dayMap = [0, 1, 2, 3, 4, 5, 6]; // getDay values for our columns
  const targetDow = dayMap[dowIdx];
  const weekDate = new Date(currentWeekMonday);
  weekDate.setDate(weekDate.getDate() + dowIdx);
  const targetDate = formatDate(weekDate);

  populateStudentSelect();
  $('#course-date').value = targetDate;
  $('#course-time').value = time;
  $('#course-duration').value = duration;
  $('#course-fee').value = calcFee(duration);
  $('#course-status').value = 'pending';
  courseForm.dataset.mode = 'add';
  courseForm.dataset.feedbackSent = '0';
  $('#course-recurring').checked = false;
  $('#course-recurring').parentElement.parentElement.style.display = '';
  $('#recurring-options').style.display = 'none';
  modalTitle.textContent = '添加课程';
  courseIdInput.value = '';
  courseForm.dataset.studentId = '';
  showModal(courseModal);
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
  const monthPlannedIncome = monthCourses
    .filter(c => c.status !== 'cancelled')
    .reduce((sum, c) => sum + (c.fee || 0), 0);
  const monthActualIncome = monthCourses
    .filter(c => c.status === 'completed')
    .reduce((sum, c) => sum + (c.fee || 0), 0);
  const monthMinutes = monthCourses
    .filter(c => c.status === 'completed' || c.status === 'pending')
    .reduce((sum, c) => sum + (c.duration || 0), 0);

  $('#stat-month-courses').textContent = monthCourses.length;
  $('#stat-month-planned-income').textContent = `¥${monthPlannedIncome.toFixed(2)}`;
  $('#stat-month-actual-income').textContent = `¥${monthActualIncome.toFixed(2)}`;
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

  // 绘制本月每日柱状图（纯 Canvas，不引第三方库）
  drawMonthChart();
}

// 在 stats canvas 上画本月每日已完成收入的柱状图
function drawMonthChart() {
  const canvas = document.getElementById('stats-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // 高 DPI 屏幕适配
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = 180;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 聚合每天的已完成收入
  const dayIncome = new Array(daysInMonth).fill(0);
  courses.forEach(c => {
    if (c.status !== 'completed') return;
    if (!c.date.startsWith(prefix)) return;
    const day = parseInt(c.date.substring(8, 10));
    if (day >= 1 && day <= daysInMonth) dayIncome[day - 1] += (c.fee || 0);
  });

  const maxIncome = Math.max(...dayIncome, 1);
  const padding = { left: 28, right: 8, top: 16, bottom: 24 };
  const chartW = cssWidth - padding.left - padding.right;
  const chartH = cssHeight - padding.top - padding.bottom;
  const barWidth = chartW / daysInMonth * 0.6;
  const barGap = chartW / daysInMonth * 0.4;

  // 主题色
  const isDark = document.documentElement.dataset.theme === 'dark';
  const primary = '#4A90D9';
  const muted = isDark ? '#888' : '#999';

  // Y 轴 3 条参考线
  ctx.strokeStyle = isDark ? '#333' : '#eee';
  ctx.lineWidth = 1;
  ctx.font = '10px system-ui';
  ctx.fillStyle = muted;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + chartH - (chartH * i / 3);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
    const val = Math.round(maxIncome * i / 3);
    ctx.fillText(val ? '¥' + val : '0', padding.left - 4, y + 3);
  }

  // 柱子
  ctx.fillStyle = primary;
  const today = now.getDate();
  for (let i = 0; i < daysInMonth; i++) {
    const x = padding.left + (chartW / daysInMonth) * i + barGap / 2;
    const h = (dayIncome[i] / maxIncome) * chartH;
    const y = padding.top + chartH - h;
    // 今天的柱子用深色突出
    ctx.fillStyle = (i + 1 === today) ? '#357ABD' : primary;
    ctx.fillRect(x, y, barWidth, h);
  }

  // X 轴标签：1、10、20、最后一天
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  const xLabels = [1, 10, 20, daysInMonth];
  xLabels.forEach(d => {
    const x = padding.left + (chartW / daysInMonth) * (d - 0.5);
    ctx.fillText(String(d), x, cssHeight - 6);
  });
}

/* ===== 数据备份导出 / 导入 ===== */
async function exportData() {
  if (!db) db = await openDB();
  const allCourses = await dbGetAll(db, COURSE_STORE);
  const allStudents = await dbGetAll(db, STUDENT_STORE);
  const payload = {
    appName: 'teacher-schedule',
    version: 1,
    exportedAt: new Date().toISOString(),
    students: allStudents,
    courses: allCourses
  };
  const json = JSON.stringify(payload, null, 2);
  const now = new Date();
  const filename = `课程备份_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.json`;

  // 优先用 Capacitor Filesystem + Share（APK 内）
  const Cap = window.Capacitor;
  if (Cap && Cap.Plugins && Cap.Plugins.Filesystem && Cap.Plugins.Share) {
    try {
      const fs = Cap.Plugins.Filesystem;
      const share = Cap.Plugins.Share;
      const result = await fs.writeFile({
        path: filename,
        data: json,
        directory: 'CACHE',
        encoding: 'utf8'
      });
      await share.share({
        title: '课程数据备份',
        url: result.uri,
        dialogTitle: '保存或分享备份文件'
      });
      showToast('已生成备份文件');
      return;
    } catch (err) {
      console.warn('Capacitor 导出失败，回退到浏览器下载', err);
    }
  }

  // 浏览器/webview 兜底：blob 触发下载
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('备份文件已下载');
}

async function importData(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.appName !== 'teacher-schedule' || !Array.isArray(data.courses) || !Array.isArray(data.students)) {
      showToast('文件格式不正确');
      return;
    }
    const ok = await showConfirm(
      `即将导入 ${data.students.length} 个学生和 ${data.courses.length} 节课程。\n\n` +
      `若与现有数据 ID 相同会被覆盖。是否继续？`
    );
    if (!ok) return;
    if (!db) db = await openDB();
    // 逐条 put（put 会覆盖同 id 的记录，不会删除其他数据）
    for (const s of data.students) await dbPut(db, STUDENT_STORE, s);
    for (const c of data.courses) await dbPut(db, COURSE_STORE, c);
    await loadStudents();
    await loadCourses();
    refreshCurrentView();
    showToast(`已导入 ${data.students.length} 学生 + ${data.courses.length} 课程`);
  } catch (err) {
    console.error('Import failed:', err);
    showToast('导入失败：' + (err.message || '文件无效'));
  }
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
  else if (currentView === 'calendar') {
    // 日历视图同时刷新月视图和周视图，根据当前激活的子视图
    if (calViewMode === 'week') {
      renderWeekView();
    } else {
      renderCalendar();
      if (selectedDay) renderDayCourses(selectedDay);
    }
  }
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
  // 用 localStorage 持久化"已提醒"标记
  const STORAGE_KEY = 'reminded_v2';
  let reminded = {};
  try {
    reminded = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    reminded = {};
  }
  let dirty = false;

  courses.forEach(course => {
    if (course.status === 'cancelled') return;

    const courseDateTime = new Date(course.dateTime);
    const courseTime = courseDateTime.getTime();
    const diffMinutes = (courseTime - nowTime) / 60000;

    // 提醒 1：前一晚 20:00（针对 pending 课程）
    if (course.status === 'pending' && diffMinutes > 0) {
      const eveningKey = `evening_${course.id}_${course.date}`;
      if (!reminded[eveningKey]) {
        const eveningBefore = new Date(course.date + 'T20:00:00');
        eveningBefore.setDate(eveningBefore.getDate() - 1);
        const eveningTime = eveningBefore.getTime();
        // 已过该时间点 + 距离过去不超过 12 小时（防止过期太久还在补发）
        if (nowTime >= eveningTime && (nowTime - eveningTime) < 12 * 60 * 60 * 1000) {
          sendNotification('📅 明天有课',
            `${course.studentName}\n${course.date} ${formatTime(course.time)}-${calculateEndTime(course.time, course.duration)}`);
          reminded[eveningKey] = nowTime;
          dirty = true;
        } else if (nowTime >= eveningTime) {
          // 过期了也标记一下，免得以后到了时间还在判断
          reminded[eveningKey] = nowTime;
          dirty = true;
        }
      }
    }

    // 提醒 2：课前 1 小时（针对 pending 课程）
    const oneHourKey = `1h_${course.id}_${course.dateTime}`;
    if (course.status === 'pending' && diffMinutes > 0 && diffMinutes <= 60 && !reminded[oneHourKey]) {
      sendNotification('⏰ 课程即将开始',
        `${course.studentName}\n${course.date} ${formatTime(course.time)}-${calculateEndTime(course.time, course.duration)}\n还有约${Math.round(diffMinutes)}分钟开始`);
      reminded[oneHourKey] = nowTime;
      dirty = true;
    }

    // 提醒 3：反馈未发 —— 不在循环里推送，循环外聚合（见下方）
  });

  // 反馈未发聚合提醒：每天 22:00 之后统一推一条，列出当天所有反馈未发的课程
  // 不为每节课分别打扰，避免一晚上 N 个通知
  (function feedbackReminderToday() {
    const today = formatDate(now);
    const fbDayKey = `fb_day_${today}`;
    if (reminded[fbDayKey]) return;   // 今天已经推过

    // 必须晚于 22:00
    const tenPm = new Date(today + 'T22:00:00').getTime();
    if (nowTime < tenPm) return;

    // 收集今天所有反馈未发的课程
    const pendingFb = courses.filter(c => {
      if (c.status === 'cancelled') return false;
      if (c.feedbackSent) return false;
      if (c.date !== today) return false;
      // 必须是已经下课的（开始时间 + duration 已过）
      const courseEnd = new Date(c.dateTime).getTime() + (c.duration || 60) * 60000;
      return nowTime >= courseEnd;
    });

    if (pendingFb.length === 0) return;

    const names = pendingFb.map(c => `${c.studentName} ${formatTime(c.time)}`).join('\n');
    const title = pendingFb.length === 1
      ? '💬 该发反馈了'
      : `💬 今天有 ${pendingFb.length} 节课反馈未发`;
    sendNotification(title, names);
    reminded[fbDayKey] = nowTime;
    dirty = true;
  })();

  // 清理 7 天以前的旧标记
  const cutoff = nowTime - 7 * 24 * 60 * 60 * 1000;
  Object.keys(reminded).forEach(k => {
    if (reminded[k] < cutoff) {
      delete reminded[k];
      dirty = true;
    }
  });

  if (dirty) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reminded));
    } catch (e) { /* localStorage 满了就忽略 */ }
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
    initAllCustomSelects();
    renderCourseList();
    startReminderService();
    initExportImport();
    initThemeToggle();
  } catch (err) {
    console.error('App init error:', err);
    showToast('数据加载失败，请刷新页面');
  }
}

function initExportImport() {
  const exportBtn = $('#btn-export-data');
  const importBtn = $('#btn-import-data');
  const fileInput = $('#file-import');
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  if (importBtn) importBtn.addEventListener('click', () => fileInput.click());
  if (fileInput) fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importData(f);
    e.target.value = '';   // 允许重复选同一文件
  });
}

function initThemeToggle() {
  // 应用启动时读取上次保存的主题；默认跟随系统
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.dataset.theme = saved;
  }
  const btn = $('#btn-theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme;
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
      // 重绘统计图
      if (currentView === 'stats') drawMonthChart();
    });
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
