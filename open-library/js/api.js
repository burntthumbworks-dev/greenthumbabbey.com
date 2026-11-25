// Open Library & Internet Archive public API client (zero-spend, client-only)

const OL_BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org/b/id';
const cache = new Map();
const LS_PREFIX = 'ol_cache_v1_';
const LS_TTL_MS = 1000 * 60 * 60 * 12; // 12-hour persistent cache for instant loads

// Instant zero-latency fallback classics (real Open Library works + IA BookReader IDs) when Open Library is slow/throttled
const INSTANT_CLASSICS = [
  { key: '/works/OL66554W', title: 'Pride and Prejudice', authors: ['Jane Austen'], year: 1813, coverId: 8231990, iaId: 'prideprejudice00aust', access: 'public', editionCount: 900, subjects: ['Classics', 'Fiction'] },
  { key: '/works/OL450063W', title: 'Frankenstein', authors: ['Mary Shelley'], year: 1818, coverId: 12752093, iaId: 'frankensteinormo00shel', access: 'public', editionCount: 750, subjects: ['Classics', 'Sci-Fi'] },
  { key: '/works/OL85892W', title: 'Dracula', authors: ['Bram Stoker'], year: 1897, coverId: 12003329, iaId: 'dracula00stok', access: 'public', editionCount: 680, subjects: ['Classics', 'Horror'] },
  { key: '/works/OL468431W', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], year: 1925, coverId: 8432047, iaId: 'greatgatsby00fitz_0', access: 'public', editionCount: 520, subjects: ['Classics'] },
  { key: '/works/OL262421W', title: 'The Adventures of Sherlock Holmes', authors: ['Arthur Conan Doyle'], year: 1892, coverId: 8228691, iaId: 'adventuresofsher00doyl', access: 'public', editionCount: 610, subjects: ['Mystery', 'Classics'] },
  { key: '/works/OL102749W', title: 'Moby-Dick', authors: ['Herman Melville'], year: 1851, coverId: 12645114, iaId: 'mobydickorwhale00melv', access: 'public', editionCount: 640, subjects: ['Classics', 'Adventure'] },
  { key: '/works/OL52267W', title: 'The Time Machine', authors: ['H. G. Wells'], year: 1895, coverId: 12648655, iaId: 'timemachineinven00well', access: 'public', editionCount: 410, subjects: ['Sci-Fi', 'Classics'] },
  { key: '/works/OL103123W', title: 'The Count of Monte Cristo', authors: ['Alexandre Dumas'], year: 1844, coverId: 12818862, iaId: 'countofmontecris00duma', access: 'public', editionCount: 500, subjects: ['Adventure', 'Classics'] },
  { key: '/works/OL61982W', title: 'The Odyssey', authors: ['Homer'], year: -800, coverId: 8235116, iaId: 'odyssey00home', access: 'public', editionCount: 800, subjects: ['Classics', 'Poetry'] },
  { key: '/works/OL138052W', title: "Alice's Adventures in Wonderland", authors: ['Lewis Carroll'], year: 1865, coverId: 10527843, iaId: 'alicesadventures00carr', access: 'public', editionCount: 720, subjects: ['Fantasy', 'Classics'] },
  { key: '/works/OL1100007W', title: 'Twenty Thousand Leagues Under the Sea', authors: ['Jules Verne'], year: 1870, coverId: 8231856, iaId: 'twentythousandle00vern', access: 'public', editionCount: 450, subjects: ['Sci-Fi', 'Adventure'] },
  { key: '/works/OL1225750W', title: 'The Art of War', authors: ['Sun Tzu'], year: -500, coverId: 11134312, iaId: 'artofwar00sunt', access: 'public', editionCount: 480, subjects: ['Philosophy', 'History'] }
];

function readPersistentCache(url) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ts && (Date.now() - parsed.ts < LS_TTL_MS)) return parsed.data;
  } catch {}
  return null;
}

function writePersistentCache(url, data) {
  try {
    localStorage.setItem(LS_PREFIX + url, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

export const CURATED_SUBJECTS = [
  { slug: 'trending', label: 'Trending Today' },
  { slug: 'classic_literature', label: 'Classics' },
  { slug: 'science_fiction', label: 'Sci-Fi' },
  { slug: 'fantasy', label: 'Fantasy' },
  { slug: 'mystery_and_detective_stories', label: 'Mystery' },
  { slug: 'history', label: 'History' },
  { slug: 'science', label: 'Science' },
  { slug: 'philosophy', label: 'Philosophy' },
  { slug: 'biography', label: 'Biography' },
  { slug: 'poetry', label: 'Poetry' }
];

async function fetchJson(url, timeoutMs = 6500) {
  if (cache.has(url)) return cache.get(url);
  const persisted = readPersistentCache(url);
  if (persisted) {
    cache.set(url, persisted);
    // Quiet background refresh so subsequent visits stay fresh without blocking UI
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh) => { if (fresh) { cache.set(url, fresh); writePersistentCache(url, fresh); } })
      .catch(() => {});
    return persisted;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`Open Library returned HTTP ${res.status}`);
    const data = await res.json();
    cache.set(url, data);
    writePersistentCache(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function getCoverUrl(coverId, size = 'M') {
  if (!coverId) return null;
  return `${COVERS_BASE}/${coverId}-${size}.jpg`;
}

export function getBookReaderUrl(iaId) {
  if (!iaId) return null;
  return `https://archive.org/embed/${encodeURIComponent(iaId)}`;
}

export function getArchiveDetailsUrl(iaId) {
  if (!iaId) return null;
  return `https://archive.org/details/${encodeURIComponent(iaId)}`;
}

export function getOpenLibraryWorkUrl(workKey) {
  if (!workKey) return OL_BASE;
  const clean = workKey.startsWith('/') ? workKey : `/${workKey}`;
  return `${OL_BASE}${clean}`;
}

function normalizeBook(raw) {
  const workKey = raw.key || '';
  const coverId = raw.cover_i || raw.cover_id || (Array.isArray(raw.covers) ? raw.covers[0] : null) || null;
  const authors = Array.isArray(raw.author_name)
    ? raw.author_name
    : Array.isArray(raw.authors)
      ? raw.authors.map((a) => a.name).filter(Boolean)
      : [];

  let iaId = null;
  if (Array.isArray(raw.ia) && raw.ia.length > 0) {
    iaId = raw.ia[0];
  } else if (typeof raw.ia === 'string') {
    iaId = raw.ia;
  } else if (raw.availability?.identifier) {
    iaId = raw.availability.identifier;
  } else if (raw.ia_collection_s && raw.lending_identifier_s) {
    iaId = raw.lending_identifier_s;
  }

  let access = 'info';
  if (
    raw.ebook_access === 'public' ||
    raw.public_scan_b === true ||
    raw.availability?.status === 'open' ||
    (raw.availability?.is_readable && !raw.availability?.is_borrowable && !raw.availability?.available_to_borrow)
  ) {
    access = 'public';
  } else if (
    raw.ebook_access === 'borrowable' ||
    raw.availability?.is_borrowable ||
    raw.availability?.available_to_borrow ||
    raw.lending_edition_s ||
    raw.lending_identifier_s
  ) {
    access = 'borrow';
  }

  return {
    key: workKey,
    title: raw.title || 'Untitled Book',
    authors: authors.length ? authors : ['Unknown Author'],
    year: raw.first_publish_year || null,
    coverId,
    iaId,
    access,
    editionCount: raw.edition_count || null,
    subjects: Array.isArray(raw.subject) ? raw.subject.slice(0, 8) : []
  };
}

export async function fetchTrending(limit = 18) {
  const url = `${OL_BASE}/trending/daily.json?limit=${limit}`;
  try {
    const data = await fetchJson(url, 4500);
    const works = Array.isArray(data.works) ? data.works : [];
    return works.length ? works.map(normalizeBook) : INSTANT_CLASSICS;
  } catch {
    return INSTANT_CLASSICS;
  }
}

export async function fetchSubject(slug, limit = 18) {
  if (slug === 'trending') return fetchTrending(limit);
  const url = `${OL_BASE}/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`;
  try {
    const data = await fetchJson(url, 6000);
    const works = Array.isArray(data.works) ? data.works : [];
    return works.length ? works.map(normalizeBook) : INSTANT_CLASSICS;
  } catch {
    return INSTANT_CLASSICS;
  }
}

export async function searchBooks(query, { page = 1, limit = 24, accessFilter = 'all', sort = '' } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return { books: [], total: 0 };

  let fullQuery = trimmed;
  if (accessFilter === 'public') {
    fullQuery = `${trimmed} ebook_access:public`;
  } else if (accessFilter === 'borrow') {
    fullQuery = `${trimmed} ebook_access:borrowable`;
  }

  const params = new URLSearchParams({
    q: fullQuery,
    page: String(page),
    limit: String(limit),
    fields: 'key,title,author_name,first_publish_year,cover_i,ia,ebook_access,public_scan_b,lending_edition_s,lending_identifier_s,edition_count,subject'
  });
  if (sort) params.set('sort', sort);

  const url = `${OL_BASE}/search.json?${params.toString()}`;
  const data = await fetchJson(url);
  const docs = Array.isArray(data.docs) ? data.docs : [];
  return {
    books: docs.map(normalizeBook),
    total: data.numFound || docs.length
  };
}

export async function fetchWorkDetails(workKey) {
  const clean = workKey.startsWith('/') ? workKey : `/${workKey}`;
  const url = `${OL_BASE}${clean}.json`;
  const data = await fetchJson(url);

  let description = '';
  if (typeof data.description === 'string') {
    description = data.description;
  } else if (data.description && typeof data.description.value === 'string') {
    description = data.description.value;
  }

  return {
    description: description.trim(),
    subjects: Array.isArray(data.subjects) ? data.subjects.slice(0, 10) : [],
    firstPublishDate: data.first_publish_date || null
  };
}
