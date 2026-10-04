const TODOS_KEY = 'todos';
const SETTINGS_KEY = 'todo-settings';
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = {
  personal: { label: '개인', color: '#8b5cf6' },
  work: { label: '업무', color: '#3b82f6' },
  study: { label: '공부', color: '#10b981' },
  shopping: { label: '장보기', color: '#f97316' },
};

const ACCENTS = [
  { name: '보라', color: '#7c3aed' },
  { name: '파랑', color: '#2563eb' },
  { name: '초록', color: '#0d9488' },
  { name: '분홍', color: '#db2777' },
  { name: '주황', color: '#ea580c' },
];

const ICONS = {
  grip: '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
};

const todayFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
const dueFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const todayLabel = document.getElementById('today');
const accentPicker = document.getElementById('accent-picker');
const titleInput = document.getElementById('title-input');
const progress = document.getElementById('progress');
const progressLabel = document.getElementById('progress-label');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');
const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const categorySelect = document.getElementById('new-todo-category');
const dueInput = document.getElementById('new-todo-due');
const statusButtons = document.querySelectorAll('[data-filter]');
const categoryFilters = document.getElementById('category-filters');
const list = document.getElementById('todo-list');
const empty = document.getElementById('empty');
const emptyText = document.getElementById('empty-text');
const footer = document.getElementById('footer');
const count = document.getElementById('count');
const clearCompletedButton = document.getElementById('clear-completed');
const toast = document.getElementById('toast');

let todos = loadTodos();
let settings = loadSettings();
let statusFilter = 'all';
let categoryFilter = 'all';
let lastAddedId = null;
let drag = null;
let toastTimer = null;

// ---- 저장 ----

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 유지한다.
  }
}

// 예전 버전에서 저장한 데이터도 읽을 수 있도록 빠진 값은 기본값으로 채운다.
function normalizeTodo(todo) {
  return {
    id: String(todo.id ?? createId()),
    title: todo.title,
    completed: Boolean(todo.completed),
    important: Boolean(todo.important),
    category: Object.hasOwn(CATEGORIES, todo.category ?? '') ? todo.category : null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate) ? todo.dueDate : null,
  };
}

function loadTodos() {
  const saved = readStorage(TODOS_KEY);
  if (!Array.isArray(saved)) return [];
  return saved.filter((todo) => todo && typeof todo.title === 'string').map(normalizeTodo);
}

function loadSettings() {
  const saved = readStorage(SETTINGS_KEY) ?? {};
  return {
    title: typeof saved.title === 'string' ? saved.title : '',
    accent: ACCENTS.some(({ color }) => color === saved.accent) ? saved.accent : ACCENTS[0].color,
  };
}

// ---- 상태 변경 ----

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function findTodo(id) {
  return todos.find((todo) => todo.id === id);
}

function commit() {
  writeStorage(TODOS_KEY, todos);
  render();
}

function addTodo(fields) {
  const todo = { id: createId(), completed: false, important: false, ...fields };
  todos.unshift(todo);
  lastAddedId = todo.id;
  commit();
}

function updateTodo(id, changes) {
  todos = todos.map((todo) => (todo.id === id ? { ...todo, ...changes } : todo));
  commit();
}

function removeTodo(id) {
  todos = todos.filter((todo) => todo.id !== id);
  commit();
}

function toggleTodo(id, completed) {
  const finishesEverything = completed && todos.filter((todo) => !todo.completed).length === 1;
  updateTodo(id, { completed });
  if (finishesEverything) celebrate();
}

function clearCompleted() {
  todos = todos.filter((todo) => !todo.completed);
  commit();
}

// 화면에 보이는 항목들만 새 순서로 바꾸고, 필터에 가려진 항목은 제자리에 둔다.
function reorderVisible(orderedIds) {
  const visibleIds = new Set(orderedIds);
  const queue = orderedIds.map(findTodo);
  todos = todos.map((todo) => (visibleIds.has(todo.id) ? queue.shift() : todo));
  commit();
}

function saveSettings() {
  writeStorage(SETTINGS_KEY, settings);
  applySettings();
}

// ---- 날짜 ----

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function describeDue(dueDate) {
  const days = Math.round((parseDate(dueDate) - startOfToday()) / DAY_MS);
  if (days < 0) return { label: `${-days}일 지남`, tone: 'overdue' };
  if (days === 0) return { label: '오늘까지', tone: 'today' };
  if (days === 1) return { label: '내일까지', tone: 'soon' };
  if (days < 7) return { label: `${days}일 남음`, tone: 'soon' };
  return { label: dueFormatter.format(parseDate(dueDate)), tone: 'later' };
}

// ---- 화면 그리기 ----

function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return template.content.firstElementChild;
}

function iconButton(className, label, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(icon(iconName));
  return button;
}

function applySettings() {
  document.documentElement.style.setProperty('--accent', settings.accent);
  document.title = settings.title.trim() || '할 일';
  if (document.activeElement !== titleInput) titleInput.value = settings.title;

  accentPicker.replaceChildren(...ACCENTS.map(({ name, color }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.color = color;
    button.title = name;
    button.style.setProperty('--swatch', color);
    button.setAttribute('aria-label', `${name} 테마`);
    button.setAttribute('aria-pressed', String(color === settings.accent));
    button.classList.toggle('selected', color === settings.accent);
    return button;
  }));
}

function render() {
  renderProgress();
  renderFilters();
  renderList();
}

function renderProgress() {
  const total = todos.length;
  const done = todos.filter((todo) => todo.completed).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  if (total === 0) progressLabel.textContent = '오늘 할 일을 적어 보세요';
  else if (done === total) progressLabel.textContent = '모두 완료했어요! 🎉';
  else progressLabel.textContent = `${total}개 중 ${done}개 완료`;

  progressPercent.textContent = total ? `${percent}%` : '';
  progressBar.style.width = `${percent}%`;
  progress.classList.toggle('complete', total > 0 && done === total);
}

function renderFilters() {
  statusButtons.forEach((button) => {
    const selected = button.dataset.filter === statusFilter;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  // 실제로 쓰이고 있는 카테고리만 필터 칩으로 보여준다.
  const used = Object.keys(CATEGORIES).filter((key) => todos.some((todo) => todo.category === key));
  if (!used.includes(categoryFilter)) categoryFilter = 'all';

  const chips = used.length === 0 ? [] : ['all', ...used].map((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.category = key;
    button.textContent = key === 'all' ? '모든 카테고리' : CATEGORIES[key].label;
    if (key !== 'all') button.style.setProperty('--chip-color', CATEGORIES[key].color);
    button.classList.toggle('selected', key === categoryFilter);
    button.setAttribute('aria-pressed', String(key === categoryFilter));
    return button;
  });
  categoryFilters.replaceChildren(...chips);
  categoryFilters.hidden = chips.length === 0;
}

function matchesFilters(todo) {
  if (statusFilter === 'active' && todo.completed) return false;
  if (statusFilter === 'completed' && !todo.completed) return false;
  return categoryFilter === 'all' || todo.category === categoryFilter;
}

function renderList() {
  // 중요 표시한 항목을 위로 올린다. sort는 안정 정렬이라 같은 그룹 안의 순서는 유지된다.
  const visible = todos.filter(matchesFilters).sort((a, b) => Number(b.important) - Number(a.important));
  list.replaceChildren(...visible.map(createTodoItem));
  lastAddedId = null;

  const remaining = todos.filter((todo) => !todo.completed).length;
  count.textContent = `남은 할 일 ${remaining}개`;
  footer.hidden = todos.length === 0;
  clearCompletedButton.hidden = remaining === todos.length;

  empty.hidden = visible.length > 0;
  if (todos.length === 0) emptyText.textContent = '아직 할 일이 없어요. 위에서 추가해 보세요!';
  else if (statusFilter === 'completed') emptyText.textContent = '아직 완료한 할 일이 없어요.';
  else if (statusFilter === 'active') emptyText.textContent = '남은 할 일이 없어요. 수고했어요!';
  else emptyText.textContent = '조건에 맞는 할 일이 없어요.';
}

function createTodoItem(todo) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  item.classList.toggle('completed', todo.completed);
  item.classList.toggle('important', todo.important);
  item.classList.toggle('has-due', Boolean(todo.dueDate));
  item.classList.toggle('enter', todo.id === lastAddedId);
  item.dataset.id = todo.id;

  const handle = iconButton('handle', '끌어서 순서 바꾸기 (방향키로도 가능)', 'grip');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'toggle';
  checkbox.checked = todo.completed;
  checkbox.setAttribute('aria-label', `${todo.title} 완료 표시`);

  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = todo.title;
  title.title = '더블클릭해서 수정';
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (todo.category) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = CATEGORIES[todo.category].label;
    tag.style.setProperty('--chip-color', CATEGORIES[todo.category].color);
    meta.append(tag);
  }
  if (todo.dueDate) {
    const due = describeDue(todo.dueDate);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'due-chip';
    if (!todo.completed) chip.classList.add(due.tone);
    chip.title = '마감일 바꾸기';
    chip.setAttribute('aria-label', `마감일 ${due.label}, 눌러서 바꾸기`);
    chip.append(icon('calendar'), due.label);
    meta.append(chip);
  }
  if (meta.childElementCount > 0) body.append(meta);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const dueButton = iconButton('action due-button', '마감일 정하기', 'calendar');

  const duePicker = document.createElement('input');
  duePicker.type = 'date';
  duePicker.className = 'due-picker';
  duePicker.value = todo.dueDate ?? '';
  duePicker.tabIndex = -1;
  duePicker.setAttribute('aria-hidden', 'true');

  const star = iconButton('action star', todo.important ? '중요 표시 해제' : '중요 표시', 'star');
  star.classList.toggle('on', todo.important);
  star.setAttribute('aria-pressed', String(todo.important));

  const deleteButton = iconButton('action delete', `${todo.title} 삭제`, 'trash');

  actions.append(dueButton, duePicker, star, deleteButton);
  item.append(handle, checkbox, body, actions);
  return item;
}

// ---- 항목 조작 ----

function startEditing(item) {
  const todo = findTodo(item.dataset.id);
  if (!todo) return;

  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit';
  editInput.value = todo.title;
  editInput.maxLength = 200;
  editInput.setAttribute('aria-label', '할 일 수정');

  item.querySelector('.title').replaceWith(editInput);
  editInput.focus();
  editInput.select();

  // Enter와 blur가 연달아 발생해도 한 번만 처리한다.
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;

    const title = editInput.value.trim();
    if (!save) render();
    else if (title) updateTodo(todo.id, { title });
    else removeTodo(todo.id);
  };

  editInput.addEventListener('keydown', (event) => {
    // 한글 입력 중(IME 조합 중)의 Enter는 글자 확정용이므로 무시한다.
    if (event.isComposing) return;
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  editInput.addEventListener('blur', () => finish(true));
}

function deleteWithAnimation(item) {
  const id = item.dataset.id;
  if (reducedMotion.matches) {
    removeTodo(id);
    return;
  }
  item.classList.add('leaving');
  setTimeout(() => removeTodo(id), 180);
}

function openDuePicker(item) {
  const picker = item.querySelector('.due-picker');
  try {
    picker.showPicker();
  } catch {
    picker.focus();
  }
}

function visibleOrder() {
  return [...list.children].map((item) => item.dataset.id);
}

function moveByKeyboard(id, offset) {
  const order = visibleOrder();
  const from = order.indexOf(id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return;
  // 중요 항목은 항상 위에 모이므로, 중요/일반 그룹의 경계는 넘지 않는다.
  if (findTodo(id).important !== findTodo(order[to]).important) return;

  [order[from], order[to]] = [order[to], order[from]];
  reorderVisible(order);
  list.querySelector(`[data-id="${CSS.escape(id)}"] .handle`)?.focus();
}

// ---- 축하 효과 ----

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

function celebrate() {
  showToast('모든 할 일을 끝냈어요! 🎉');
  if (reducedMotion.matches) return;

  const colors = [settings.accent, ...Object.values(CATEGORIES).map(({ color }) => color), '#f5a524'];
  for (let i = 0; i < 80; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.setProperty('--drift', `${Math.random() * 200 - 100}px`);
    piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    piece.addEventListener('animationend', () => piece.remove());
    document.body.append(piece);
  }
}

// ---- 이벤트: 상단 ----

titleInput.addEventListener('input', () => {
  settings.title = titleInput.value;
  saveSettings();
});

titleInput.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter' || event.key === 'Escape') titleInput.blur();
});

titleInput.addEventListener('blur', () => {
  settings.title = titleInput.value.trim();
  saveSettings();
});

accentPicker.addEventListener('click', (event) => {
  const swatch = event.target.closest('.swatch');
  if (!swatch) return;
  settings.accent = swatch.dataset.color;
  saveSettings();
});

// ---- 이벤트: 입력, 필터 ----

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;

  const category = categorySelect.value || null;
  // 새로 추가한 항목이 필터에 가려지지 않게 한다.
  if (statusFilter === 'completed') statusFilter = 'all';
  if (categoryFilter !== 'all' && categoryFilter !== category) categoryFilter = 'all';

  addTodo({ title, category, dueDate: dueInput.value || null });
  input.value = '';
  dueInput.value = '';
});

statusButtons.forEach((button) => {
  button.addEventListener('click', () => {
    statusFilter = button.dataset.filter;
    render();
  });
});

categoryFilters.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  categoryFilter = chip.dataset.category;
  // 카테고리를 고르면 새 할 일도 그 카테고리로 추가되게 맞춘다.
  if (categoryFilter !== 'all') categorySelect.value = categoryFilter;
  render();
});

clearCompletedButton.addEventListener('click', clearCompleted);

// ---- 이벤트: 목록 ----

list.addEventListener('change', (event) => {
  const item = event.target.closest('.todo-item');
  if (!item) return;
  if (event.target.matches('.toggle')) toggleTodo(item.dataset.id, event.target.checked);
  if (event.target.matches('.due-picker')) updateTodo(item.dataset.id, { dueDate: event.target.value || null });
});

list.addEventListener('click', (event) => {
  const item = event.target.closest('.todo-item');
  if (!item) return;

  if (event.target.closest('.delete')) {
    deleteWithAnimation(item);
  } else if (event.target.closest('.star')) {
    updateTodo(item.dataset.id, { important: !findTodo(item.dataset.id).important });
  } else if (event.target.closest('.due-button, .due-chip')) {
    openDuePicker(item);
  }
});

list.addEventListener('dblclick', (event) => {
  if (!event.target.matches('.title')) return;
  startEditing(event.target.closest('.todo-item'));
});

list.addEventListener('keydown', (event) => {
  const handle = event.target.closest('.handle');
  if (!handle) return;
  const offset = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  if (!offset) return;
  event.preventDefault();
  moveByKeyboard(handle.closest('.todo-item').dataset.id, offset);
});

// ---- 이벤트: 끌어서 순서 바꾸기 (마우스, 터치 모두 Pointer Events로 처리) ----
// 끄는 동안 항목이 DOM 안에서 옮겨지면 pointer capture가 풀리므로,
// 이동과 놓기는 window에서 받아 포인터가 목록 밖으로 나가도 놓치지 않게 한다.

list.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.handle');
  if (!handle || event.button !== 0) return;
  event.preventDefault();

  const item = handle.closest('.todo-item');
  item.classList.add('dragging');
  list.classList.add('is-dragging');
  drag = { item, pointerId: event.pointerId };
});

window.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;

  // 포인터보다 아래쪽 절반에 있는 첫 항목 앞으로 끌고 있는 항목을 옮긴다.
  const others = [...list.children].filter((item) => item !== drag.item);
  const next = others.find((item) => {
    const rect = item.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });

  if (next) {
    if (drag.item.nextElementSibling !== next) list.insertBefore(drag.item, next);
  } else if (list.lastElementChild !== drag.item) {
    list.append(drag.item);
  }
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.item.classList.remove('dragging');
  list.classList.remove('is-dragging');
  drag = null;
  reorderVisible(visibleOrder());
}

window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

// ---- 다른 탭에서 바뀐 내용 반영 ----

window.addEventListener('storage', (event) => {
  if (event.key === TODOS_KEY) {
    todos = loadTodos();
    render();
  }
  if (event.key === SETTINGS_KEY) {
    settings = loadSettings();
    applySettings();
  }
});

// ---- 시작 ----

todayLabel.textContent = todayFormatter.format(new Date());
categorySelect.replaceChildren(
  new Option('카테고리 없음', ''),
  ...Object.entries(CATEGORIES).map(([key, { label }]) => new Option(label, key)),
);
applySettings();
render();
