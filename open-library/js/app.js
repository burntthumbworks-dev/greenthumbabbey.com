import {
  CURATED_SUBJECTS,
  fetchSubject,
  fetchWorkDetails,
  getArchiveDetailsUrl,
  getBookReaderUrl,
  getCoverUrl,
  getOpenLibraryWorkUrl,
  searchBooks
} from './api.js?v=3';
import {
  exportLibraryJson,
  getPrefs,
  getSavedCount,
  getShelfBooks,
  getShelfEntry,
  importLibraryJson,
  recordRecent,
  setBookShelf,
  updateBookMeta,
  updatePrefs
} from './storage.js?v=3';
import { initTvNavigation } from './tv-nav.js';

const state = {
  view: 'discover',
  subject: 'trending',
  shelfFilter: 'all',
  searchQuery: '',
  searchPage: 1,
  searchTotal: 0,
  searchResults: [],
  activeBook: null,
  lastFocusedBeforeModal: null,
  deferredInstallPrompt: null
};

const el = {
  navButtons: () => document.querySelectorAll('[data-view]'),
  views: () => document.querySelectorAll('.view'),
  sidebarSubjects: document.getElementById('sidebarSubjects'),
  subjectChips: document.getElementById('subjectChips'),
  sidebarShelfCount: document.getElementById('sidebarShelfCount'),
  btnInstallPwa: document.getElementById('btnInstallPwa'),
  btnTvMode: document.getElementById('btnTvMode'),
  btnTvModeMobile: document.getElementById('btnTvModeMobile'),
  tvModeLabel: document.getElementById('tvModeLabel'),
  btnTheme: document.getElementById('btnTheme'),
  btnThemeMobile: document.getElementById('btnThemeMobile'),
  themeLabel: document.getElementById('themeLabel'),
  globalSearchForm: document.getElementById('globalSearchForm'),
  searchInput: document.getElementById('searchInput'),
  accessButtons: () => document.querySelectorAll('#accessFilterGroup [data-access]'),
  btnHeroReadable: document.getElementById('btnHeroReadable'),
  btnHeroTv: document.getElementById('btnHeroTv'),
  discoverGridTitle: document.getElementById('discoverGridTitle'),
  discoverMeta: document.getElementById('discoverMeta'),
  discoverGrid: document.getElementById('discoverGrid'),
  searchHeading: document.getElementById('searchHeading'),
  searchMeta: document.getElementById('searchMeta'),
  searchGrid: document.getElementById('searchGrid'),
  searchLoadMoreWrap: document.getElementById('searchLoadMoreWrap'),
  btnLoadMoreSearch: document.getElementById('btnLoadMoreSearch'),
  shelfTabs: () => document.querySelectorAll('.tab-pill[data-shelf]'),
  shelfGrid: document.getElementById('shelfGrid'),
  btnExportShelf: document.getElementById('btnExportShelf'),
  importShelfInput: document.getElementById('importShelfInput'),
  bookModal: document.getElementById('bookModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  modalBody: document.getElementById('modalBody'),
  readerOverlay: document.getElementById('readerOverlay'),
  btnCloseReader: document.getElementById('btnCloseReader'),
  readerTitle: document.getElementById('readerTitle'),
  readerExternalLink: document.getElementById('readerExternalLink'),
  btnReaderFullscreen: document.getElementById('btnReaderFullscreen'),
  readerFrame: document.getElementById('readerFrame'),
  toast: document.getElementById('toast')
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer = null;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2800);
}

function shelfLabel(shelf) {
  if (shelf === 'reading') return 'Reading';
  if (shelf === 'want') return 'Want';
  if (shelf === 'finished') return 'Finished';
  return '';
}

function applyPrefs() {
  const prefs = getPrefs();
  document.body.classList.toggle('theme-paper', prefs.theme === 'paper');
  document.body.classList.toggle('tv-mode', Boolean(prefs.tvMode));

  el.themeLabel.textContent = prefs.theme === 'paper' ? 'Paper' : 'Evening';
  el.btnTheme.setAttribute('aria-pressed', String(prefs.theme === 'paper'));

  el.tvModeLabel.textContent = prefs.tvMode ? 'On' : 'Off';
  el.btnTvMode.setAttribute('aria-pressed', String(Boolean(prefs.tvMode)));

  const currentAccess = prefs.accessFilter || 'all';
  el.accessButtons().forEach((btn) => {
    const isActive = btn.dataset.access === currentAccess;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', prefs.theme === 'paper' ? '#f6f2e8' : '#111216');
  }
}

function toggleTheme() {
  const prefs = getPrefs();
  const next = prefs.theme === 'paper' ? 'evening' : 'paper';
  updatePrefs({ theme: next });
  applyPrefs();
  showToast(`Switched to ${next === 'paper' ? 'Paper (Light)' : 'Evening (Dark)'} theme`);
}

function toggleTvMode() {
  const prefs = getPrefs();
  const next = !prefs.tvMode;
  updatePrefs({ tvMode: next });
  applyPrefs();
  showToast(next ? 'TV / Remote Mode enabled — use Arrow keys & Enter' : 'TV Mode turned off');
}

function setAccessFilter(nextAccess, { targetSubject = null } = {}) {
  const clean = ['all', 'public', 'borrow'].includes(nextAccess) ? nextAccess : 'all';
  updatePrefs({ accessFilter: clean });
  applyPrefs();

  if (targetSubject) {
    switchView('discover');
    loadSubject(targetSubject);
    return;
  }

  if (state.view === 'search' && state.searchQuery) {
    runSearch(state.searchQuery);
  } else if (state.view === 'discover') {
    loadSubject(state.subject);
  }
}

function updateShelfBadge() {
  el.sidebarShelfCount.textContent = String(getSavedCount());
}

function switchView(viewName) {
  state.view = viewName;
  el.views().forEach((section) => {
    section.classList.toggle('active', section.id === `view-${viewName}`);
  });
  el.navButtons().forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  if (viewName === 'shelf') {
    renderShelf();
  }
}

function renderSkeletons(container, count = 12) {
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-cover"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>`
    )
    .join('');
}

function createBookCard(book) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'book-card';
  card.dataset.focusable = 'true';

  const coverUrl = getCoverUrl(book.coverId, 'M');
  const saved = getShelfEntry(book.key);
  const authorText = book.authors.join(', ');

  const accessBadge =
    book.access === 'public'
      ? '<span class="access-pill public">Read Free</span>'
      : book.access === 'borrow'
        ? '<span class="access-pill borrow">Borrow</span>'
        : '';

  const shelfBadge = saved
    ? `<span class="shelf-tag">${escapeHtml(shelfLabel(saved.shelf))}</span>`
    : '';

  card.innerHTML = `
    <div class="cover-wrap">
      ${
        coverUrl
          ? `<img class="cover-img" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(book.title)} cover" loading="lazy" />`
          : `<div class="cover-fallback">
               <span class="cover-fallback-title">${escapeHtml(book.title)}</span>
               <span class="cover-fallback-author">${escapeHtml(authorText)}</span>
             </div>`
      }
      ${accessBadge}
      ${shelfBadge}
    </div>
    <div class="card-info">
      <h4 class="card-title">${escapeHtml(book.title)}</h4>
      <p class="card-author">${escapeHtml(authorText)}</p>
      ${book.year ? `<span class="card-year">${escapeHtml(book.year)}</span>` : ''}
    </div>
  `;

  // Swap to typographic fallback if cover image fails or is missing
  const img = card.querySelector('.cover-img');
  if (img) {
    img.addEventListener('error', () => {
      const wrap = card.querySelector('.cover-wrap');
      if (!wrap) return;
      img.remove();
      const fallback = document.createElement('div');
      fallback.className = 'cover-fallback';
      fallback.innerHTML = `
        <span class="cover-fallback-title">${escapeHtml(book.title)}</span>
        <span class="cover-fallback-author">${escapeHtml(authorText)}</span>
      `;
      wrap.prepend(fallback);
    });
  }

  card.addEventListener('click', () => openBookModal(book));
  return card;
}

function renderBookGrid(container, books, emptyMessage, { groupByAccess = false } = {}) {
  container.innerHTML = '';
  if (!books.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  if (groupByAccess) {
    const groups = [
      {
        key: 'public',
        title: 'Read Free — Open Access (No Account Needed)',
        items: books.filter((b) => b.access === 'public')
      },
      {
        key: 'borrow',
        title: 'Borrowable — Requires Open Library Account (or check Libby)',
        items: books.filter((b) => b.access === 'borrow')
      },
      {
        key: 'info',
        title: 'Catalog Records',
        items: books.filter((b) => b.access !== 'public' && b.access !== 'borrow')
      }
    ].filter((g) => g.items.length > 0);

    for (const group of groups) {
      const header = document.createElement('div');
      header.className = `grid-group-header ${group.key}`;
      header.innerHTML = `
        <h4 class="grid-group-title">${escapeHtml(group.title)}</h4>
        <span class="grid-group-count">${group.items.length} ${group.items.length === 1 ? 'book' : 'books'}</span>
      `;
      frag.appendChild(header);
      for (const book of group.items) {
        frag.appendChild(createBookCard(book));
      }
    }
  } else {
    for (const book of books) {
      frag.appendChild(createBookCard(book));
    }
  }

  container.appendChild(frag);
}

function renderSubjectControls() {
  el.subjectChips.innerHTML = '';
  el.sidebarSubjects.innerHTML = '';

  CURATED_SUBJECTS.forEach((subj) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${state.subject === subj.slug ? ' active' : ''}`;
    chip.textContent = subj.label;
    chip.dataset.subject = subj.slug;
    chip.dataset.focusable = 'true';
    chip.addEventListener('click', () => loadSubject(subj.slug));
    el.subjectChips.appendChild(chip);

    if (subj.slug !== 'trending') {
      const sideBtn = document.createElement('button');
      sideBtn.type = 'button';
      sideBtn.className = `subject-link-btn${state.subject === subj.slug ? ' active' : ''}`;
      sideBtn.textContent = subj.label;
      sideBtn.dataset.subject = subj.slug;
      sideBtn.dataset.focusable = 'true';
      sideBtn.addEventListener('click', () => {
        switchView('discover');
        loadSubject(subj.slug);
      });
      el.sidebarSubjects.appendChild(sideBtn);
    }
  });
}

async function loadSubject(slug) {
  state.subject = slug;
  const subj = CURATED_SUBJECTS.find((s) => s.slug === slug) || CURATED_SUBJECTS[0];
  const accessFilter = getPrefs().accessFilter || 'all';
  const filterLabel =
    accessFilter === 'public'
      ? ' · Read Free Only'
      : accessFilter === 'borrow'
        ? ' · Borrowable Only'
        : '';

  el.discoverGridTitle.textContent = `${subj.label}${filterLabel}`;
  el.discoverMeta.textContent = 'Loading from Open Library…';

  document.querySelectorAll('[data-subject]').forEach((node) => {
    node.classList.toggle('active', node.dataset.subject === slug);
  });

  renderSkeletons(el.discoverGrid, 12);
  try {
    let books;
    if (accessFilter === 'public') {
      if (slug === 'trending') {
        books = (await fetchSubject(slug, 24)).filter((b) => b.access === 'public');
      } else {
        const res = await searchBooks(`subject:${slug.replace(/_/g, ' ')}`, {
          limit: 24,
          accessFilter: 'public'
        });
        books = res.books.filter((b) => b.access === 'public');
      }
    } else if (accessFilter === 'borrow') {
      if (slug === 'trending') {
        books = (await fetchSubject(slug, 24)).filter((b) => b.access === 'borrow');
      } else {
        const res = await searchBooks(`subject:${slug.replace(/_/g, ' ')}`, {
          limit: 24,
          accessFilter: 'borrow'
        });
        books = res.books.filter((b) => b.access === 'borrow');
      }
    } else {
      books = await fetchSubject(slug, 24);
    }

    const freeCount = books.filter((b) => b.access === 'public').length;
    const borrowCount = books.filter((b) => b.access === 'borrow').length;
    el.discoverMeta.textContent =
      accessFilter === 'all'
        ? `${books.length} books (${freeCount} Read Free · ${borrowCount} Borrow)`
        : `${books.length} ${accessFilter === 'public' ? 'Read Free' : 'Borrowable'} books`;

    renderBookGrid(
      el.discoverGrid,
      books,
      'No books matched this filter. Try switching between All, Read Free, and Borrow.',
      { groupByAccess: accessFilter === 'all' }
    );
  } catch (err) {
    el.discoverMeta.textContent = 'Could not reach Open Library';
    el.discoverGrid.innerHTML = `<div class="empty-state">Unable to load books right now (${escapeHtml(err.message)}). Check your internet connection and try again.</div>`;
  }
}

async function runSearch(query, { append = false } = {}) {
  const clean = query.trim();
  if (!clean) return;

  switchView('search');
  state.searchQuery = clean;
  if (!append) {
    state.searchPage = 1;
    state.searchResults = [];
    renderSkeletons(el.searchGrid, 12);
  } else {
    state.searchPage += 1;
  }

  const accessFilter = getPrefs().accessFilter || 'all';
  el.searchHeading.textContent = `Results for “${clean}”`;
  el.searchMeta.textContent = append ? 'Loading more…' : 'Searching Open Library…';
  el.searchLoadMoreWrap.hidden = true;

  try {
    const { books, total } = await searchBooks(clean, {
      page: state.searchPage,
      limit: 24,
      accessFilter
    });
    const filtered =
      accessFilter === 'public'
        ? books.filter((b) => b.access === 'public')
        : accessFilter === 'borrow'
          ? books.filter((b) => b.access === 'borrow')
          : books;

    state.searchTotal = total;
    state.searchResults = append ? [...state.searchResults, ...filtered] : filtered;

    const filterNote =
      accessFilter === 'public'
        ? ' (Read Free)'
        : accessFilter === 'borrow'
          ? ' (Borrowable)'
          : '';
    el.searchMeta.textContent = `${state.searchResults.length} of ${total.toLocaleString()} matches${filterNote}`;
    renderBookGrid(
      el.searchGrid,
      state.searchResults,
      'No books found for that query under this filter. Try switching to All, Read Free, or Borrow.',
      { groupByAccess: accessFilter === 'all' }
    );
    el.searchLoadMoreWrap.hidden = state.searchResults.length >= total || books.length === 0;
  } catch (err) {
    el.searchMeta.textContent = 'Search error';
    el.searchGrid.innerHTML = `<div class="empty-state">Search failed (${escapeHtml(err.message)}). Please try again.</div>`;
  }
}

function renderShelf() {
  el.shelfTabs().forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.shelf === state.shelfFilter);
  });
  const books = getShelfBooks(state.shelfFilter);
  const emptyMsg =
    state.shelfFilter === 'recent'
      ? 'Books you open will appear here automatically.'
      : 'Your shelf is empty. Tap any book to add it to Want to Read, Currently Reading, or Finished.';
  renderBookGrid(el.shelfGrid, books, emptyMsg);
}

async function openBookModal(book) {
  state.activeBook = book;
  state.lastFocusedBeforeModal = document.activeElement;
  recordRecent(book);

  const entry = getShelfEntry(book.key);
  const coverUrl = getCoverUrl(book.coverId, 'L');
  const olUrl = getOpenLibraryWorkUrl(book.key);
  const readerUrl = getBookReaderUrl(book.iaId);
  const archiveUrl = getArchiveDetailsUrl(book.iaId);
  const authorText = book.authors.join(', ');

  const primaryAction = readerUrl
    ? `<button class="btn-primary" id="btnOpenReader" data-focusable="true">📖 ${book.access === 'public' ? 'Read in App' : 'Open BookReader'}</button>`
    : `<a class="btn-primary" href="${escapeHtml(olUrl)}" target="_blank" rel="noopener noreferrer" data-focusable="true">Open on OpenLibrary.org ↗</a>`;

  const secondaryAction = readerUrl
    ? `<a class="btn-secondary" href="${escapeHtml(olUrl)}" target="_blank" rel="noopener noreferrer" data-focusable="true">Open Library Page ↗</a>`
    : '';

  const archiveAction = archiveUrl
    ? `<a class="btn-secondary" href="${escapeHtml(archiveUrl)}" target="_blank" rel="noopener noreferrer" data-focusable="true">Archive.org ↗</a>`
    : '';

  const accessBadge =
    book.access === 'public'
      ? '<span class="info-badge public">Free Public-Domain / Open Access</span>'
      : book.access === 'borrow'
        ? '<span class="info-badge borrow">Borrowable (Free Open Library account)</span>'
        : '<span class="info-badge">Catalog Record</span>';

  const currentShelf = entry?.shelf || '';
  const currentRating = entry?.rating || 0;
  const currentNote = entry?.note || '';

  el.modalBody.innerHTML = `
    <div class="detail-layout">
      <div class="detail-cover">
        ${
          coverUrl
            ? `<img class="cover-img" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(book.title)} cover" />`
            : `<div class="cover-fallback">
                 <span class="cover-fallback-title">${escapeHtml(book.title)}</span>
                 <span class="cover-fallback-author">${escapeHtml(authorText)}</span>
               </div>`
        }
      </div>
      <div class="detail-meta">
        <h2 id="modalTitle">${escapeHtml(book.title)}</h2>
        <p class="detail-author">${escapeHtml(authorText)}${book.year ? ` · First published ${escapeHtml(book.year)}` : ''}</p>
        <div class="detail-badges">
          ${accessBadge}
          ${book.editionCount ? `<span class="info-badge">${escapeHtml(book.editionCount)} editions</span>` : ''}
        </div>
        <div class="detail-actions">
          ${primaryAction}
          ${secondaryAction}
          ${archiveAction}
        </div>
        <p class="detail-description" id="modalDescription">Loading synopsis from Open Library…</p>

        <div class="shelf-controls">
          <div class="shelf-row">
            <span class="sidebar-label" style="padding:0;">Shelf:</span>
            <button type="button" class="shelf-btn${currentShelf === 'want' ? ' active' : ''}" data-set-shelf="want" data-focusable="true">Want to Read</button>
            <button type="button" class="shelf-btn${currentShelf === 'reading' ? ' active' : ''}" data-set-shelf="reading" data-focusable="true">Reading</button>
            <button type="button" class="shelf-btn${currentShelf === 'finished' ? ' active' : ''}" data-set-shelf="finished" data-focusable="true">Finished</button>
            ${currentShelf ? `<button type="button" class="shelf-btn" data-set-shelf="" data-focusable="true">Remove</button>` : ''}
          </div>
          <div class="shelf-row">
            <span class="sidebar-label" style="padding:0;">My Rating:</span>
            <div class="star-row" id="modalStars">
              ${[1, 2, 3, 4, 5]
                .map(
                  (n) =>
                    `<button type="button" class="star-btn${n <= currentRating ? ' filled' : ''}" data-star="${n}" aria-label="Rate ${n} out of 5" data-focusable="true">★</button>`
                )
                .join('')}
            </div>
          </div>
          <label class="sr-only" for="modalNote">Personal notes</label>
          <textarea id="modalNote" class="note-input" placeholder="Personal notes (saved locally on this device)…" data-focusable="true">${escapeHtml(currentNote)}</textarea>
        </div>
      </div>
    </div>
  `;

  el.bookModal.hidden = false;
  document.body.style.overflow = 'hidden';
  el.btnCloseModal.focus();

  const btnOpenReader = document.getElementById('btnOpenReader');
  if (btnOpenReader && readerUrl) {
    btnOpenReader.addEventListener('click', () => openReader(book, readerUrl, archiveUrl || olUrl));
  }

  el.modalBody.querySelectorAll('[data-set-shelf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetShelf = btn.dataset.setShelf;
      setBookShelf(book, targetShelf || null);
      updateShelfBadge();
      if (state.view === 'shelf') renderShelf();
      showToast(targetShelf ? `Saved to “${shelfLabel(targetShelf)}”` : 'Removed from shelf');
      openBookModal(book);
    });
  });

  el.modalBody.querySelectorAll('[data-star]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rating = Number(btn.dataset.star);
      updateBookMeta(book, { rating });
      updateShelfBadge();
      el.modalBody.querySelectorAll('[data-star]').forEach((starEl) => {
        starEl.classList.toggle('filled', Number(starEl.dataset.star) <= rating);
      });
      showToast(`Rated ${rating}/5`);
    });
  });

  const noteField = document.getElementById('modalNote');
  let noteTimer = null;
  noteField?.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      updateBookMeta(book, { note: noteField.value });
      updateShelfBadge();
    }, 350);
  });

  // Load rich description lazily from the Open Library Works API
  try {
    const details = await fetchWorkDetails(book.key);
    const descEl = document.getElementById('modalDescription');
    if (descEl && state.activeBook?.key === book.key) {
      descEl.textContent =
        details.description || 'No synopsis available in Open Library for this edition.';
    }
  } catch {
    const descEl = document.getElementById('modalDescription');
    if (descEl && state.activeBook?.key === book.key) {
      descEl.textContent = 'Synopsis unavailable right now.';
    }
  }
}

function closeBookModal() {
  if (el.bookModal.hidden) return false;
  el.bookModal.hidden = true;
  document.body.style.overflow = '';
  state.activeBook = null;
  state.lastFocusedBeforeModal?.focus?.();
  return true;
}

function openReader(book, embedUrl, externalUrl) {
  el.readerTitle.textContent = book.title;
  el.readerExternalLink.href = externalUrl;
  el.readerFrame.src = embedUrl;
  el.readerOverlay.hidden = false;
  el.btnCloseReader.focus();
}

function closeReader() {
  if (el.readerOverlay.hidden) return false;
  el.readerOverlay.hidden = true;
  el.readerFrame.src = 'about:blank';
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  el.btnCloseModal.focus();
  return true;
}

function setupExportImport() {
  el.btnExportShelf.addEventListener('click', () => {
    const json = exportLibraryJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `open-library-shelf-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Bookshelf exported to JSON');
  });

  el.importShelfInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = importLibraryJson(text);
      updateShelfBadge();
      applyPrefs();
      renderShelf();
      showToast(`Imported bookshelf (${count} saved books)`);
    } catch (err) {
      showToast(err.message || 'Could not import file');
    } finally {
      event.target.value = '';
    }
  });
}

function setupPwa() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    el.btnInstallPwa.hidden = false;
  });

  el.btnInstallPwa.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    el.btnInstallPwa.hidden = true;
  });
}

function bindEvents() {
  el.navButtons().forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  el.btnTheme.addEventListener('click', toggleTheme);
  el.btnThemeMobile.addEventListener('click', toggleTheme);
  el.btnTvMode.addEventListener('click', toggleTvMode);
  el.btnTvModeMobile.addEventListener('click', toggleTvMode);

  el.btnHeroTv.addEventListener('click', toggleTvMode);
  el.btnHeroReadable.addEventListener('click', () => {
    setAccessFilter('public', { targetSubject: 'classic_literature' });
  });

  el.accessButtons().forEach((btn) => {
    btn.addEventListener('click', () => {
      setAccessFilter(btn.dataset.access);
    });
  });

  el.globalSearchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(el.searchInput.value);
  });

  el.btnLoadMoreSearch.addEventListener('click', () => {
    runSearch(state.searchQuery, { append: true });
  });

  el.shelfTabs().forEach((tab) => {
    tab.addEventListener('click', () => {
      state.shelfFilter = tab.dataset.shelf;
      renderShelf();
    });
  });

  el.btnCloseModal.addEventListener('click', closeBookModal);
  el.bookModal.addEventListener('click', (event) => {
    if (event.target === el.bookModal) closeBookModal();
  });

  el.btnCloseReader.addEventListener('click', closeReader);
  el.btnReaderFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      el.readerOverlay.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  initTvNavigation({
    onEscape: () => closeReader() || closeBookModal(),
    onToggleTvMode: toggleTvMode,
    onFocusSearch: () => {
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
}

function init() {
  if (new URLSearchParams(location.search).get('tv') === '1') {
    updatePrefs({ tvMode: true });
  }
  applyPrefs();
  updateShelfBadge();
  renderSubjectControls();
  bindEvents();
  setupExportImport();
  setupPwa();
  loadSubject('trending');
}

init();
