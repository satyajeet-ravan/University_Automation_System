const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}. Check that the backend is running and CORS allows this frontend origin.`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.fields = data.fields || {};
    throw error;
  }
  return data;
}

// Fetches a file (for example a PDF) with the signed-in user's token.
export async function apiBlob(path, { token } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch {
    throw new Error(`Could not reach the API at ${API_BASE}.`);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return response.blob();
}
