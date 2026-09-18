import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const authHeaders = () => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const api = {
  get: (path, config = {}) => axios.get(`${API}${path}`, { ...config, headers: { ...authHeaders(), ...(config.headers || {}) } }),
  post: (path, body, config = {}) => axios.post(`${API}${path}`, body, { ...config, headers: { ...authHeaders(), ...(config.headers || {}) } }),
  patch: (path, body, config = {}) => axios.patch(`${API}${path}`, body, { ...config, headers: { ...authHeaders(), ...(config.headers || {}) } }),
  delete: (path, config = {}) => axios.delete(`${API}${path}`, { ...config, headers: { ...authHeaders(), ...(config.headers || {}) } }),
};

export const errMsg = (e, fallback) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return fallback;
};

export const splitList = (s) => (s || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
