let currentUserId = Number(localStorage.getItem("safety-user-id") || 2);
let currentProjectId = Number(localStorage.getItem("safety-project-id") || 1);

export function setCurrentUser(id) {
  currentUserId = Number(id);
  localStorage.setItem("safety-user-id", String(id));
}

export function setCurrentProject(id) {
  currentProjectId = Number(id);
  localStorage.setItem("safety-project-id", String(id));
}

export async function api(path, options = {}) {
  const headers = { "x-user-id": String(currentUserId), "x-project-id": String(currentProjectId), ...(options.headers || {}) };
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

export async function download(path) {
  const response = await fetch(`/api${path}`, { headers: { "x-user-id": String(currentUserId), "x-project-id": String(currentProjectId) } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "下载失败");
  }
  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fallbackName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "download";
  const fileName = encodedName ? decodeURIComponent(encodedName) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
