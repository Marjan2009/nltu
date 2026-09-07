(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const fullDays = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'];
  const seed = { lessons: [], tasks: [], files: [] };
  const clone = value => JSON.parse(JSON.stringify(value));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem('student-hub-v5'));
      if (!saved || !Array.isArray(saved.lessons) || !Array.isArray(saved.tasks) || !Array.isArray(saved.files)) return clone(seed);
      return saved;
    } catch { return clone(seed); }
  }

  let data = load();
  let selectedDay = new Date().getDay() || 7;
  let selectedWeek = localStorage.getItem('student-hub-week') || 'numerator';
  let taskFilter = 'all';
  let editing = { type: null, id: null };
  const temporaryFiles = new Map();
  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = () => new Date().getDay() || 7;
  const save = () => localStorage.setItem('student-hub-v5', JSON.stringify(data));
  const safe = text => String(text || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const date = value => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const isOverdue = item => !item.done && item.due && item.due < todayISO();
  function showEmpty(node) { node.append($('#empty-state').content.cloneNode(true)); }
  function startTime(text) { const match = String(text || '').match(/(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; }
  function nowMinutes() { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); }

  // IndexedDB запускається тільки в момент роботи з PDF — це не ламає сайт при відкритті index.html.
  let dbPromise;
  function filesDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    try {
      dbPromise = new Promise((resolve) => {
        const request = indexedDB.open('StudentHubFiles', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('pdf');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      return dbPromise;
    } catch { return Promise.resolve(null); }
  }
  async function persistPdf(id, file) {
    temporaryFiles.set(id, file);
    const db = await filesDb();
    if (!db) return;
    await new Promise(resolve => { const tx = db.transaction('pdf', 'readwrite'); tx.objectStore('pdf').put(file, id); tx.oncomplete = resolve; tx.onerror = resolve; });
  }
  async function getPdf(id) {
    if (temporaryFiles.has(id)) return temporaryFiles.get(id);
    const db = await filesDb();
    if (!db) return null;
    return new Promise(resolve => { const request = db.transaction('pdf').objectStore('pdf').get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null); });
  }
  async function deletePdf(id) {
    temporaryFiles.delete(id);
    const db = await filesDb();
    if (!db) return;
    await new Promise(resolve => { const tx = db.transaction('pdf', 'readwrite'); tx.objectStore('pdf').delete(id); tx.oncomplete = resolve; tx.onerror = resolve; });
  }

  function renderHome() {
    const current = data.lessons.filter(item => item.day === today() && (!item.week || item.week === 'both' || item.week === selectedWeek)).sort((a, b) => a.time.localeCompare(b.time));
    $('#lessons-today').textContent = current.length;
    $('#tasks-open').textContent = data.tasks.filter(item => !item.done).length;
    $('#file-count').textContent = data.files.length;
    $('#task-counter').textContent = data.tasks.filter(item => !item.done).length;
    const todayList = $('#today-list'); todayList.innerHTML = current.map(lessonRow).join(''); if (!current.length) showEmpty(todayList);
    const deadlines = data.tasks.filter(item => !item.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
    const deadlineList = $('#deadline-list');
    deadlineList.innerHTML = deadlines.map(item => `<div class="deadline ${isOverdue(item) ? 'overdue' : ''}"><b>${safe(item.title)}</b><p>${safe(item.subject)}</p><small>${isOverdue(item) ? 'ПРОСТРОЧЕНО' : `ДО ${date(item.due)}`}</small></div>`).join('');
    if (!deadlines.length) showEmpty(deadlineList);
    renderNextLesson(current);
  }

  function renderNextLesson(current) {
    const banner = $('#next-lesson-banner');
    const minutesNow = nowMinutes();
    const upcoming = current
      .map(item => ({ item, start: startTime(item.time) }))
      .filter(entry => entry.start !== null && entry.start >= minutesNow - 20)
      .sort((a, b) => a.start - b.start)[0];
    if (!upcoming) { banner.hidden = true; banner.innerHTML = ''; return; }
    const diff = upcoming.start - minutesNow;
    const status = diff <= 0 ? 'зараз триває' : diff <= 60 ? `через ${diff} хв` : `о ${upcoming.item.time.split(/[–-]/)[0].trim()}`;
    banner.hidden = false;
    banner.innerHTML = `<span class="pulse"></span><div><b>${diff <= 0 ? 'Зараз:' : 'Наступна пара:'}</b> ${safe(upcoming.item.title)} · ${safe(upcoming.item.place)}</div><span class="when">${status}</span>`;
  }

  function lessonRow(item) {
    return `<div class="lesson-row" data-edit-lesson="${item.id}" title="Клацни, щоб редагувати"><span class="time">${safe(item.time)}</span><div class="info"><b>${safe(item.title)}</b><small>${safe(item.place)}</small></div><span class="type ${kindClass(item.kind)}">${safe(item.kind)}</span></div>`;
  }
  function kindClass(kind) { return kind === 'Практика' ? 'practice' : kind === 'Лабораторна' ? 'lab' : ''; }

  function renderSchedule() {
    $$('.week-choice').forEach(button => button.classList.toggle('active', button.dataset.week === selectedWeek));
    $('#day-tabs').innerHTML = days.map((day, index) => `<button class="day-tab ${selectedDay === index + 1 ? 'active' : ''} ${index > 4 ? 'weekend-day' : ''}" data-day="${index + 1}">${day}</button>`).join('');
    const board = $('#schedule-board');
    if (selectedDay > 5) {
      const name = selectedDay === 6 ? 'Субота' : 'Неділя';
      board.innerHTML = `<article class="weekend"><div><p class="beer">🍺</p><h3>${name} — без пар</h3><p>За розкладом: пиво, відпочинок і перезавантаження.</p></div></article>`;
      return;
    }
    const lessons = data.lessons.filter(item => item.day === selectedDay && (!item.week || item.week === 'both' || item.week === selectedWeek)).sort((a, b) => a.time.localeCompare(b.time));
    board.innerHTML = lessons.map(item => `<article class="schedule-card" data-edit-lesson="${item.id}" title="Клацни, щоб редагувати"><span class="time">${safe(item.time)}</span><div><b>${safe(item.title)}</b><p>${safe(item.place)}</p></div><span class="type ${kindClass(item.kind)}">${safe(item.kind)}</span><button class="delete" data-remove-lesson="${item.id}" title="Видалити">×</button></article>`).join('');
    if (!lessons.length) showEmpty(board);
  }

  function renderTasks() {
    let tasks = data.tasks;
    if (taskFilter === 'open') tasks = tasks.filter(item => !item.done);
    if (taskFilter === 'done') tasks = tasks.filter(item => item.done);
    if (taskFilter === 'overdue') tasks = tasks.filter(isOverdue);
    const query = ($('#search-tasks').value || '').trim().toLowerCase();
    if (query) tasks = tasks.filter(item => `${item.title} ${item.subject}`.toLowerCase().includes(query));
    const list = $('#task-list');
    list.innerHTML = tasks.sort((a, b) => a.due.localeCompare(b.due)).map(item => `<article class="task-card ${item.done ? 'done' : ''} ${isOverdue(item) ? 'overdue' : ''}" data-edit-task="${item.id}" title="Клацни, щоб редагувати"><label><input class="check" type="checkbox" data-done="${item.id}" ${item.done ? 'checked' : ''}><strong>${safe(item.title)}</strong></label><p>${safe(item.note)}</p><div class="task-meta"><span class="tag">${safe(item.subject)}</span><span>${item.done ? 'ГОТОВО' : isOverdue(item) ? 'ПРОСТРОЧЕНО' : `ДО ${date(item.due)}`}</span><button class="delete" data-remove-task="${item.id}">×</button></div></article>`).join('');
    if (!tasks.length) showEmpty(list);
  }

  function renderFiles(query = $('#search-files').value) {
    const search = query.trim().toLowerCase();
    const files = data.files.filter(item => `${item.title} ${item.subject}`.toLowerCase().includes(search));
    const list = $('#file-list');
    list.innerHTML = files.map(item => `<article class="file-card" data-edit-file="${item.id}" title="Клацни, щоб редагувати"><div class="file-icon">${safe(item.type || 'PDF').slice(0, 1)}</div><strong>${safe(item.title)}</strong><p>${safe(item.description || 'Навчальний матеріал')}</p><span class="tag">${safe(item.subject)}</span>${item.pdfId ? `<br><button class="open-file" data-open-pdf="${item.pdfId}">Відкрити PDF ↗</button>` : ''}<button class="delete" data-remove-file="${item.id}" title="Видалити">×</button></article>`).join('');
    if (!files.length) showEmpty(list);
  }

  function renderAll() { renderHome(); renderSchedule(); renderTasks(); renderFiles(); }

  const forms = {
    lesson: {
      title: 'Додати пару', kicker: 'РОЗКЛАД',
      html: (item) => `<div class="form-grid"><div class="field full"><label>Назва предмета</label><input name="title" required placeholder="Наприклад, Вебтехнології" value="${safe(item?.title)}"></div><div class="field"><label>День</label><select name="day">${days.map((d, i) => `<option value="${i + 1}" ${item && item.day === i + 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div class="field"><label>Тиждень</label><select name="week"><option value="numerator" ${item?.week === 'numerator' ? 'selected' : ''}>Чисельник</option><option value="denominator" ${item?.week === 'denominator' ? 'selected' : ''}>Знаменник</option><option value="both" ${item?.week === 'both' ? 'selected' : ''}>Щотижня</option></select></div><div class="field"><label>Тип</label><select name="kind"><option ${item?.kind === 'Лекція' ? 'selected' : ''}>Лекція</option><option ${item?.kind === 'Практика' ? 'selected' : ''}>Практика</option><option ${item?.kind === 'Лабораторна' ? 'selected' : ''}>Лабораторна</option></select></div><div class="field"><label>Час</label><input name="time" required placeholder="09:00 – 10:20" value="${safe(item?.time)}"></div><div class="field full"><label>Аудиторія / посилання</label><input name="place" required placeholder="ауд. 304" value="${safe(item?.place)}"></div></div>`
    },
    task: {
      title: 'Нове завдання', kicker: 'ДЕДЛАЙН',
      html: (item) => `<div class="form-grid"><div class="field full"><label>Назва завдання</label><input name="title" required placeholder="Що потрібно зробити?" value="${safe(item?.title)}"></div><div class="field"><label>Предмет</label><input name="subject" required placeholder="Назва предмета" value="${safe(item?.subject)}"></div><div class="field"><label>Дедлайн</label><input name="due" required type="date" value="${safe(item?.due)}"></div><div class="field full"><label>Опис</label><textarea name="note" placeholder="Деталі завдання">${safe(item?.note)}</textarea></div></div>`
    },
    file: {
      title: 'Додати матеріал', kicker: 'KNOWLEDGE BASE',
      html: (item) => `<div class="form-grid"><div class="field full"><label>Назва матеріалу</label><input name="title" required placeholder="Наприклад, Конспект лекції №3" value="${safe(item?.title)}"></div><div class="field"><label>Предмет</label><input name="subject" required placeholder="Назва предмета" value="${safe(item?.subject)}"></div><div class="field"><label>Тип</label><select name="type"><option ${item?.type === 'PDF' ? 'selected' : ''}>PDF</option><option ${item?.type === 'NOTE' ? 'selected' : ''}>NOTE</option><option ${item?.type === 'LINK' ? 'selected' : ''}>LINK</option><option ${item?.type === 'VIDEO' ? 'selected' : ''}>VIDEO</option></select></div><div class="field full"><label>Завантажити PDF (за бажанням)</label><input class="file-input" name="pdf" type="file" accept="application/pdf,.pdf">${item?.pdfId ? '<small class="hint">Уже прикріплено PDF. Обери новий файл, щоб замінити.</small>' : ''}</div><div class="field full"><label>Опис</label><textarea name="description" placeholder="Коротко опиши матеріал">${safe(item?.description)}</textarea></div></div>`
    }
  };

  const editTitles = { lesson: 'Редагувати пару', task: 'Редагувати завдання', file: 'Редагувати матеріал' };

  function findItem(type, id) {
    if (type === 'lesson') return data.lessons.find(item => item.id === id);
    if (type === 'task') return data.tasks.find(item => item.id === id);
    if (type === 'file') return data.files.find(item => item.id === id);
    return null;
  }

  function openModal(type, id = null) {
    const form = forms[type]; if (!form) return;
    editing = { type, id };
    const item = id ? findItem(type, id) : null;
    $('#modal-kicker').textContent = form.kicker;
    $('#modal-title').textContent = item ? editTitles[type] : form.title;
    $('#entry-form').dataset.type = type;
    $('#entry-form').innerHTML = form.html(item) + `<button class="primary-button save" type="submit">${item ? 'Зберегти зміни →' : 'Зберегти →'}</button>`;
    $('#modal-wrap').classList.add('open'); $('#modal-wrap').setAttribute('aria-hidden', 'false');
  }
  function closeModal() { $('#modal-wrap').classList.remove('open'); $('#modal-wrap').setAttribute('aria-hidden', 'true'); editing = { type: null, id: null }; }

  function showPage(page) {
    renderAll();
    $$('.page').forEach(item => item.classList.toggle('active', item.id === page));
    $$('.nav-btn').forEach(item => item.classList.toggle('active', item.dataset.page === page));
    $('#heading').textContent = ({ home: 'Твій навчальний простір', schedule: 'Твій навчальний тиждень', tasks: 'Не пропусти дедлайни', files: 'Твоя база знань' })[page];
    $('#sidebar').classList.remove('open'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('.nav-btn').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  $$('[data-page-link]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.pageLink)));
  $$('[data-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.modal)));
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#go-today').addEventListener('click', () => { selectedDay = today(); showPage('schedule'); });
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-wrap').addEventListener('click', event => { if (event.target === $('#modal-wrap')) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#modal-wrap').classList.contains('open')) closeModal(); });
  $('#day-tabs').addEventListener('click', event => { if (event.target.dataset.day) { selectedDay = Number(event.target.dataset.day); renderSchedule(); } });
  $$('.week-choice').forEach(button => button.addEventListener('click', () => { selectedWeek = button.dataset.week; localStorage.setItem('student-hub-week', selectedWeek); renderAll(); }));
  $$('.filter').forEach(button => button.addEventListener('click', () => { taskFilter = button.dataset.filter; $$('.filter').forEach(item => item.classList.toggle('active', item === button)); renderTasks(); }));
  $('#search-files').addEventListener('input', event => renderFiles(event.target.value));
  $('#search-tasks').addEventListener('input', renderTasks);
  $('#task-list').addEventListener('change', event => { const id = Number(event.target.dataset.done); if (!id) return; const task = data.tasks.find(item => item.id === id); if (task) { task.done = event.target.checked; save(); renderAll(); } });

  // Клацання по картці відкриває редагування; клацання по кнопці видалення/відкриття PDF — свою дію.
  document.addEventListener('click', async event => {
    const removeLesson = Number(event.target.dataset.removeLesson);
    const removeTask = Number(event.target.dataset.removeTask);
    const removeFile = Number(event.target.dataset.removeFile);
    if (removeLesson || removeTask || removeFile) {
      event.stopPropagation();
      if (!confirm('Видалити цей запис?')) return;
      if (removeLesson) data.lessons = data.lessons.filter(item => item.id !== removeLesson);
      if (removeTask) data.tasks = data.tasks.filter(item => item.id !== removeTask);
      if (removeFile) {
        const file = data.files.find(item => item.id === removeFile);
        if (file?.pdfId) await deletePdf(file.pdfId);
        data.files = data.files.filter(item => item.id !== removeFile);
      }
      save(); renderAll(); return;
    }
    const pdfId = event.target.dataset.openPdf;
    if (pdfId) {
      const pdf = await getPdf(pdfId);
      if (!pdf) return alert('Файл не знайдено. Додай цей PDF ще раз.');
      window.open(URL.createObjectURL(pdf), '_blank', 'noopener');
      return;
    }
    if (event.target.closest('label')) return; // клік по назві завдання перемикає чекбокс, а не редагування
    const lessonCard = event.target.closest('[data-edit-lesson]');
    const taskCard = event.target.closest('[data-edit-task]');
    const fileCard = event.target.closest('[data-edit-file]');
    if (lessonCard) openModal('lesson', Number(lessonCard.dataset.editLesson));
    else if (taskCard) openModal('task', Number(taskCard.dataset.editTask));
    else if (fileCard) openModal('file', Number(fileCard.dataset.editFile));
  });

  $('#entry-form').addEventListener('submit', async event => {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const existing = editing.id ? findItem(type, editing.id) : null;

    if (type === 'lesson') {
      const record = { id: existing?.id ?? Date.now(), day: Number(input.day), week: input.week, time: input.time, title: input.title, kind: input.kind, place: input.place };
      if (existing) Object.assign(existing, record); else data.lessons.push(record);
    }
    if (type === 'task') {
      const record = { id: existing?.id ?? Date.now(), title: input.title, subject: input.subject, due: input.due, note: input.note || 'Без додаткового опису.', done: existing?.done ?? false };
      if (existing) Object.assign(existing, record); else data.tasks.push(record);
    }
    if (type === 'file') {
      const record = existing ? { ...existing } : { id: Date.now(), title: '', subject: '', type: 'PDF', description: '' };
      record.title = input.title; record.subject = input.subject; record.type = input.type; record.description = input.description || 'Навчальний матеріал.';
      if (input.pdf && input.pdf.size) {
        if (input.pdf.type && input.pdf.type !== 'application/pdf') return alert('Можна додати лише PDF-файл.');
        if (existing?.pdfId) await deletePdf(existing.pdfId);
        record.type = 'PDF'; record.pdfId = uid(); await persistPdf(record.pdfId, input.pdf);
      }
      if (existing) Object.assign(existing, record); else data.files.push(record);
    }
    save(); closeModal(); renderAll();
  });

  // Резервне копіювання / відновлення (тексту; вкладені PDF лишаються у сховищі цього браузера).
  $('#export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `student-hub-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  $('#import-data').addEventListener('click', () => $('#import-input').click());
  $('#import-input').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.lessons) || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.files)) throw new Error('bad shape');
      if (!confirm('Імпорт замінить поточні дані на дані з файлу. Продовжити?')) return;
      data = parsed; save(); renderAll();
    } catch { alert('Не вдалося прочитати файл — переконайся, що це резервна копія Student Hub.'); }
    event.target.value = '';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  $('#date-label').textContent = `${fullDays[new Date().getDay()].toUpperCase()} · STUDY MODE`;
  renderAll();
  setInterval(() => renderNextLesson(data.lessons.filter(item => item.day === today() && (!item.week || item.week === 'both' || item.week === selectedWeek))), 30000);
})();
