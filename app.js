(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  const fullDays = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'];
  const seed = {
    lessons: [],
    tasks: [],
    files: []
  };
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
  const temporaryFiles = new Map();
  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = () => new Date().getDay() || 7;
  const save = () => localStorage.setItem('student-hub-v5', JSON.stringify(data));
  const safe = text => String(text || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const date = value => new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
  function showEmpty(node) { node.append($('#empty-state').content.cloneNode(true)); }

  // IndexedDB запускається тільки в момент роботи з PDF — це не ламає сайт при відкритті index.html.
  let dbPromise;
  function filesDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    try {
      dbPromise = new Promise((resolve, reject) => {
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
    await new Promise(resolve => { const tx = db.transaction('pdf','readwrite'); tx.objectStore('pdf').put(file,id); tx.oncomplete = resolve; tx.onerror = resolve; });
  }
  async function getPdf(id) {
    if (temporaryFiles.has(id)) return temporaryFiles.get(id);
    const db = await filesDb();
    if (!db) return null;
    return new Promise(resolve => { const request = db.transaction('pdf').objectStore('pdf').get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => resolve(null); });
  }

  function renderHome() {
    const current = data.lessons.filter(item => item.day === today() && (!item.week || item.week === 'both' || item.week === selectedWeek)).sort((a,b) => a.time.localeCompare(b.time));
    $('#lessons-today').textContent = current.length;
    $('#tasks-open').textContent = data.tasks.filter(item => !item.done).length;
    $('#file-count').textContent = data.files.length;
    $('#task-counter').textContent = data.tasks.filter(item => !item.done).length;
    const todayList = $('#today-list'); todayList.innerHTML = current.map(lessonRow).join(''); if (!current.length) showEmpty(todayList);
    const deadlines = data.tasks.filter(item => !item.done).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,4);
    const deadlineList = $('#deadline-list'); deadlineList.innerHTML = deadlines.map(item => `<div class="deadline"><b>${safe(item.title)}</b><p>${safe(item.subject)}</p><small>ДО ${date(item.due)}</small></div>`).join(''); if (!deadlines.length) showEmpty(deadlineList);
  }
  function lessonRow(item) { return `<div class="lesson-row"><span class="time">${safe(item.time)}</span><div class="info"><b>${safe(item.title)}</b><small>${safe(item.place)}</small></div><span class="type ${item.kind === 'Практика' ? 'practice' : ''}">${safe(item.kind)}</span></div>`; }
  function renderSchedule() {
    $$('.week-choice').forEach(button => button.classList.toggle('active', button.dataset.week === selectedWeek));
    $('#day-tabs').innerHTML = days.map((day,index) => `<button class="day-tab ${selectedDay === index + 1 ? 'active' : ''} ${index > 4 ? 'weekend-day' : ''}" data-day="${index+1}">${day}</button>`).join('');
    const board = $('#schedule-board');
    if (selectedDay > 5) {
      const name = selectedDay === 6 ? 'Субота' : 'Неділя';
      board.innerHTML = `<article class="weekend"><div><p class="beer">🍺</p><h3>${name} — без пар</h3><p>За розкладом: пиво, відпочинок і перезавантаження.</p></div></article>`;
      return;
    }
    const lessons = data.lessons.filter(item => item.day === selectedDay && (!item.week || item.week === 'both' || item.week === selectedWeek)).sort((a,b)=>a.time.localeCompare(b.time));
    board.innerHTML = lessons.map(item => `<article class="schedule-card"><span class="time">${safe(item.time)}</span><div><b>${safe(item.title)}</b><p>${safe(item.place)}</p></div><span class="type ${item.kind === 'Практика' ? 'practice' : ''}">${safe(item.kind)}</span><button class="delete" data-remove-lesson="${item.id}" title="Видалити">×</button></article>`).join('');
    if (!lessons.length) showEmpty(board);
  }
  function renderTasks() {
    let tasks = data.tasks;
    if (taskFilter === 'open') tasks = tasks.filter(item => !item.done);
    if (taskFilter === 'done') tasks = tasks.filter(item => item.done);
    const list = $('#task-list');
    list.innerHTML = tasks.sort((a,b)=>a.due.localeCompare(b.due)).map(item => `<article class="task-card ${item.done?'done':''}"><label><input class="check" type="checkbox" data-done="${item.id}" ${item.done?'checked':''}><strong>${safe(item.title)}</strong></label><p>${safe(item.note)}</p><div class="task-meta"><span class="tag">${safe(item.subject)}</span><span>${item.done ? 'ГОТОВО' : `ДО ${date(item.due)}`}</span><button class="delete" data-remove-task="${item.id}">×</button></div></article>`).join('');
    if (!tasks.length) showEmpty(list);
  }
  function renderFiles(query = $('#search-files').value) {
    const search = query.trim().toLowerCase();
    const files = data.files.filter(item => `${item.title} ${item.subject}`.toLowerCase().includes(search));
    const list = $('#file-list');
    list.innerHTML = files.map(item => `<article class="file-card"><div class="file-icon">${safe(item.type || 'PDF').slice(0,1)}</div><strong>${safe(item.title)}</strong><p>${safe(item.description || 'Навчальний матеріал')}</p><span class="tag">${safe(item.subject)}</span>${item.pdfId ? `<br><button class="open-file" data-open-pdf="${item.pdfId}">Відкрити PDF ↗</button>` : ''}<button class="delete" data-remove-file="${item.id}" title="Видалити">×</button></article>`).join('');
    if (!files.length) showEmpty(list);
  }
  function renderAll() { renderHome(); renderSchedule(); renderTasks(); renderFiles(); }

  const forms = {
    lesson: { title:'Додати пару', kicker:'РОЗКЛАД', html:`<div class="form-grid"><div class="field full"><label>Назва предмета</label><input name="title" required placeholder="Наприклад, Вебтехнології"></div><div class="field"><label>День</label><select name="day">${days.map((d,i)=>`<option value="${i+1}">${d}</option>`).join('')}</select></div><div class="field"><label>Тиждень</label><select name="week"><option value="numerator">Чисельник</option><option value="denominator">Знаменник</option><option value="both">Щотижня</option></select></div><div class="field"><label>Тип</label><select name="kind"><option>Лекція</option><option>Практика</option><option>Лабораторна</option></select></div><div class="field"><label>Час</label><input name="time" required placeholder="09:00 – 10:20"></div><div class="field full"><label>Аудиторія / посилання</label><input name="place" required placeholder="ауд. 304"></div></div>` },
    task: { title:'Нове завдання', kicker:'ДЕДЛАЙН', html:`<div class="form-grid"><div class="field full"><label>Назва завдання</label><input name="title" required placeholder="Що потрібно зробити?"></div><div class="field"><label>Предмет</label><input name="subject" required placeholder="Назва предмета"></div><div class="field"><label>Дедлайн</label><input name="due" required type="date"></div><div class="field full"><label>Опис</label><textarea name="note" placeholder="Деталі завдання"></textarea></div></div>` },
    file: { title:'Додати матеріал', kicker:'KNOWLEDGE BASE', html:`<div class="form-grid"><div class="field full"><label>Назва матеріалу</label><input name="title" required placeholder="Наприклад, Конспект лекції №3"></div><div class="field"><label>Предмет</label><input name="subject" required placeholder="Назва предмета"></div><div class="field"><label>Тип</label><select name="type"><option>PDF</option><option>NOTE</option><option>LINK</option><option>VIDEO</option></select></div><div class="field full"><label>Завантажити PDF (за бажанням)</label><input class="file-input" name="pdf" type="file" accept="application/pdf,.pdf"></div><div class="field full"><label>Опис</label><textarea name="description" placeholder="Коротко опиши матеріал"></textarea></div></div>` }
  };
  function openModal(type) {
    const form = forms[type]; if (!form) return;
    $('#modal-kicker').textContent = form.kicker; $('#modal-title').textContent = form.title;
    $('#entry-form').dataset.type = type; $('#entry-form').innerHTML = form.html + '<button class="primary-button save" type="submit">Зберегти →</button>';
    $('#modal-wrap').classList.add('open'); $('#modal-wrap').setAttribute('aria-hidden','false');
  }
  function closeModal() { $('#modal-wrap').classList.remove('open'); $('#modal-wrap').setAttribute('aria-hidden','true'); }
  function showPage(page) {
    renderAll();
    $$('.page').forEach(item => item.classList.toggle('active',item.id === page));
    $$('.nav-btn').forEach(item => item.classList.toggle('active',item.dataset.page === page));
    $('#heading').textContent = ({home:'Твій навчальний простір',schedule:'Твій навчальний тиждень',tasks:'Не пропусти дедлайни',files:'Твоя база знань'})[page];
    $('#sidebar').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
  }

  $$('.nav-btn').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  $$('[data-page-link]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.pageLink)));
  $$('[data-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.modal)));
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#go-today').addEventListener('click', () => { selectedDay = today(); showPage('schedule'); });
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-wrap').addEventListener('click', event => { if (event.target === $('#modal-wrap')) closeModal(); });
  $('#day-tabs').addEventListener('click', event => { if (event.target.dataset.day) { selectedDay = Number(event.target.dataset.day); renderSchedule(); } });
  $$('.week-choice').forEach(button => button.addEventListener('click', () => { selectedWeek = button.dataset.week; localStorage.setItem('student-hub-week', selectedWeek); renderAll(); }));
  $$('.filter').forEach(button => button.addEventListener('click', () => { taskFilter = button.dataset.filter; $$('.filter').forEach(item=>item.classList.toggle('active',item===button)); renderTasks(); }));
  $('#search-files').addEventListener('input', event => renderFiles(event.target.value));
  $('#task-list').addEventListener('change', event => { const id = Number(event.target.dataset.done); if (!id) return; const task = data.tasks.find(item=>item.id===id); if (task) { task.done = event.target.checked; save(); renderAll(); } });
  document.addEventListener('click', async event => {
    const lesson = Number(event.target.dataset.removeLesson), task = Number(event.target.dataset.removeTask), file = Number(event.target.dataset.removeFile);
    if (lesson) data.lessons = data.lessons.filter(item=>item.id!==lesson);
    if (task) data.tasks = data.tasks.filter(item=>item.id!==task);
    if (file) data.files = data.files.filter(item=>item.id!==file);
    if (lesson || task || file) { save(); renderAll(); return; }
    const pdfId = event.target.dataset.openPdf; if (!pdfId) return;
    const pdf = await getPdf(pdfId);
    if (!pdf) return alert('Файл не знайдено. Додай цей PDF ще раз.');
    window.open(URL.createObjectURL(pdf), '_blank', 'noopener');
  });
  $('#entry-form').addEventListener('submit', async event => {
    event.preventDefault(); const type = event.currentTarget.dataset.type; const input = Object.fromEntries(new FormData(event.currentTarget));
    if (type === 'lesson') data.lessons.push({id:Date.now(),day:Number(input.day),week:input.week,time:input.time,title:input.title,kind:input.kind,place:input.place});
    if (type === 'task') data.tasks.push({id:Date.now(),title:input.title,subject:input.subject,due:input.due,note:input.note || 'Без додаткового опису.',done:false});
    if (type === 'file') {
      const item = {id:Date.now(),title:input.title,subject:input.subject,type:input.type,description:input.description || 'Навчальний матеріал.'};
      if (input.pdf && input.pdf.size) { if (input.pdf.type && input.pdf.type !== 'application/pdf') return alert('Можна додати лише PDF-файл.'); item.type = 'PDF'; item.pdfId = uid(); await persistPdf(item.pdfId,input.pdf); }
      data.files.push(item);
    }
    save(); closeModal(); renderAll();
  });
  $('#date-label').textContent = `${fullDays[new Date().getDay()].toUpperCase()} · STUDY MODE`;
  renderAll();
})();
