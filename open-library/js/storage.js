// Local-only bookshelf, history, notes, and UI preferences ($0 storage)

const STORAGE_KEY = 'open_library_lounge_v1';

const DEFAULT_STATE = {
  shelves: {}, // workKey -> { book, shelf: 'want'|'reading'|'finished', rating: 0..5, note: '', updatedAt }
  recent: [],  // array of normalized books (max 24)
  prefs: {
    theme: 'evening', // 'evening' | 'paper'
    tvMode: false,
    accessFilter: 'all' // 'all' | 'public' | 'borrow'
  }
};

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      shelves: parsed.shelves && typeof parsed.shelves === 'object' ? parsed.shelves : {},
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      prefs: {
        ...DEFAULT_STATE.prefs,
        ...(parsed.prefs || {})
      }
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function getPrefs() {
  return readState().prefs;
}

export function updatePrefs(patch) {
  const state = readState();
  state.prefs = { ...state.prefs, ...patch };
  writeState(state);
  return state.prefs;
}

export function getShelfEntry(workKey) {
  const state = readState();
  return state.shelves[workKey] || null;
}

export function setBookShelf(book, shelf) {
  const state = readState();
  if (!shelf) {
    delete state.shelves[book.key];
  } else {
    const existing = state.shelves[book.key] || { rating: 0, note: '' };
    state.shelves[book.key] = {
      ...existing,
      book,
      shelf,
      updatedAt: Date.now()
    };
  }
  writeState(state);
  return state.shelves[book.key] || null;
}

export function updateBookMeta(book, { rating, note }) {
  const state = readState();
  const existing = state.shelves[book.key] || {
    book,
    shelf: 'want',
    rating: 0,
    note: ''
  };
  state.shelves[book.key] = {
    ...existing,
    book,
    rating: typeof rating === 'number' ? rating : existing.rating,
    note: typeof note === 'string' ? note : existing.note,
    updatedAt: Date.now()
  };
  writeState(state);
  return state.shelves[book.key];
}

export function recordRecent(book) {
  if (!book || !book.key) return;
  const state = readState();
  state.recent = [book, ...state.recent.filter((b) => b.key !== book.key)].slice(0, 24);
  writeState(state);
}

export function getShelfBooks(filter = 'all') {
  const state = readState();
  if (filter === 'recent') {
    return state.recent;
  }
  const entries = Object.values(state.shelves)
    .filter((entry) => filter === 'all' || entry.shelf === filter)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return entries.map((e) => e.book);
}

export function getSavedCount() {
  return Object.keys(readState().shelves).length;
}

export function exportLibraryJson() {
  const state = readState();
  return JSON.stringify(
    {
      app: 'Open Library Lounge',
      exportedAt: new Date().toISOString(),
      ...state
    },
    null,
    2
  );
}

export function importLibraryJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.shelves !== 'object') {
    throw new Error('Invalid Open Library Lounge backup file.');
  }
  const current = readState();
  const merged = {
    shelves: { ...current.shelves, ...parsed.shelves },
    recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 24) : current.recent,
    prefs: { ...current.prefs, ...(parsed.prefs || {}) }
  };
  writeState(merged);
  return Object.keys(merged.shelves).length;
}
