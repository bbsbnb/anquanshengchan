let currentUserId = Number(localStorage.getItem("safety-user-id") || 2);

export function setCurrentUser(id) {
  currentUserId = Number(id);
  localStorage.setItem("safety-user-id", String(id));
}

export async function api(path, options = {}) {
  const headers = { "x-user-id": String(currentUserId), ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api${path}`, { ...options, headers });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(data.error || "请求失败");
    error.data = data;
    throw error;
  }
  return data;
}

export function download(path) {
  window.location.href = `/api${path}`;
}
