// Shared utilities for all department pages

const TOKEN = localStorage.getItem('aibos_token');
const WS_ID = localStorage.getItem('aibos_workspace') || 'default';

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      'x-workspace-id': WS_ID,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { window.location.href = '/login'; }
  return res;
}

function v(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}
