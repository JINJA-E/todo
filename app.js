const STORAGE_KEY = 'todos';

const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const list = document.getElementById('todo-list');
const emptyMessage = document.getElementById('empty');
const footer = document.getElementById('footer');
const count = document.getElementById('count');
const clearCompletedButton = document.getElementById('clear-completed');
const filterButtons = document.querySelectorAll('[data-filter]');

let todos = loadTodos();
let filter = 'all';

// ---- 저장 ----

function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.filter((todo) => todo && typeof todo.title === 'string') : [];
  } catch {
    return [];
  }
}

function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 유지한다.
  }
}

// ---- 상태 변경 ----

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function commit() {
  saveTodos();
  render();
}

function addTodo(title) {
  todos.push({ id: createId(), title, completed: false });
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

function clearCompleted() {
  todos = todos.filter((todo) => !todo.completed);
  commit();
}

// ---- 화면 그리기 ----

function render() {
  const visible = todos.filter((todo) => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  list.replaceChildren(...visible.map(createTodoItem));

  const remaining = todos.filter((todo) => !todo.completed).length;
  count.textContent = `남은 할 일 ${remaining}개`;
  footer.hidden = todos.length === 0;
  clearCompletedButton.hidden = remaining === todos.length;

  emptyMessage.hidden = visible.length > 0;
  emptyMessage.textContent = todos.length === 0 ? '할 일을 추가해 보세요.' : '해당하는 할 일이 없어요.';

  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function createTodoItem(todo) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  item.classList.toggle('completed', todo.completed);
  item.dataset.id = todo.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'toggle';
  checkbox.checked = todo.completed;
  checkbox.setAttribute('aria-label', `${todo.title} 완료 표시`);

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = todo.title;
  title.title = '더블클릭해서 수정';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete';
  deleteButton.textContent = '×';
  deleteButton.setAttribute('aria-label', `${todo.title} 삭제`);

  item.append(checkbox, title, deleteButton);
  return item;
}

function startEditing(item) {
  const todo = todos.find((t) => t.id === item.dataset.id);
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

// ---- 이벤트 ----

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  addTodo(title);
  input.value = '';
});

list.addEventListener('change', (event) => {
  if (!event.target.matches('.toggle')) return;
  updateTodo(event.target.closest('.todo-item').dataset.id, { completed: event.target.checked });
});

list.addEventListener('click', (event) => {
  if (!event.target.matches('.delete')) return;
  removeTodo(event.target.closest('.todo-item').dataset.id);
});

list.addEventListener('dblclick', (event) => {
  if (!event.target.matches('.title')) return;
  startEditing(event.target.closest('.todo-item'));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    render();
  });
});

clearCompletedButton.addEventListener('click', clearCompleted);

// 다른 탭에서 바뀐 내용을 반영한다.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  todos = loadTodos();
  render();
});

render();
