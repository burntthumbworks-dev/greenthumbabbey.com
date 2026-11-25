// Open Library & Internet Archive public API client (zero-spend, client-only)

const OL_BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org/b/id';
const cache = new Map();

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

async function fetchJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) {
    throw new Error(`Open Library returned HTTP ${res.status}`);
  }
  const data = await res.json();
  cache.set(url, data);
  return data;
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

export async function fetchTrending(limit = 24) {
  const url = `${OL_BASE}/trending/daily.json?limit=${limit}`;
  const data = await fetchJson(url);
  const works = Array.isArray(data.works) ? data.works : [];
  return works.map(normalizeBook);
}

export async function fetchSubject(slug, limit = 24) {
  if (slug === 'trending') return fetchTrending(limit);
  const url = `${OL_BASE}/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`;
  const data = await fetchJson(url);
  const works = Array.isArray(data.works) ? data.works : [];
  return works.map(normalizeBook);
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
