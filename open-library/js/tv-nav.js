// Spatial D-pad / Arrow-key navigation for Smart TVs, remotes, and keyboards

function getVisibleFocusables(root = document) {
  const nodes = Array.from(root.querySelectorAll('[data-focusable="true"]'));
  return nodes.filter((el) => {
    if (el.disabled || el.hidden) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

function getActiveScope() {
  const reader = document.getElementById('readerOverlay');
  if (reader && !reader.hidden) return reader;
  const modal = document.getElementById('bookModal');
  if (modal && !modal.hidden) return modal;
  return document;
}

function findNextInDirection(current, direction, candidates) {
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;

  let best = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const dx = tx - fx;
    const dy = ty - fy;

    let primary = 0;
    let secondary = 0;

    if (direction === 'ArrowRight') {
      if (dx <= 8) continue;
      primary = dx;
      secondary = Math.abs(dy);
    } else if (direction === 'ArrowLeft') {
      if (dx >= -8) continue;
      primary = -dx;
      secondary = Math.abs(dy);
    } else if (direction === 'ArrowDown') {
      if (dy <= 8) continue;
      primary = dy;
      secondary = Math.abs(dx);
    } else if (direction === 'ArrowUp') {
      if (dy >= -8) continue;
      primary = -dy;
      secondary = Math.abs(dx);
    }

    // Strongly favor elements aligned along the travel axis
    const score = primary + secondary * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

export function initTvNavigation({ onEscape, onToggleTvMode, onFocusSearch }) {
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

    if (event.key === 'Escape' || (event.key === 'Backspace' && !isTyping)) {
      if (onEscape && onEscape()) {
        event.preventDefault();
      }
      return;
    }

    if (!isTyping && event.key === '/') {
      event.preventDefault();
      onFocusSearch?.();
      return;
    }

    if (!isTyping && (event.key === 't' || event.key === 'T')) {
      event.preventDefault();
      onToggleTvMode?.();
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    // Allow normal cursor movement inside text inputs unless pressing Up/Down
    if (isTyping && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      return;
    }

    const scope = getActiveScope();
    const candidates = getVisibleFocusables(scope);
    if (!candidates.length) return;

    const current = document.activeElement;
    if (!current || !scope.contains(current) || !current.matches('[data-focusable="true"]')) {
      event.preventDefault();
      candidates[0].focus();
      candidates[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    const next = findNextInDirection(current, event.key, candidates);
    if (next) {
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}
