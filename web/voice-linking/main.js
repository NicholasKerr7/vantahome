import {
  parseLinkRequest,
  validateApiEndpoint,
  validateMetadata,
  validateAuthorizationRedirect,
  buildCancellationRedirect,
} from "./protocol.js";

const element = (id) => document.getElementById(id);
const form = element("link-form");
const status = element("status");
const error = element("error");
const retry = element("retry");
const password = element("password");
const email = element("email");
const credentials = element("credentials");
const showPassword = element("show-password");
const submitLabel = element("submit-label");
let context = null;
let request = null;
let controller = null;
let api = null;
let busy = false;

// Loopback fixtures are a separate, visibly labelled local preview. A deployed
// page cannot enable this exception by supplying a query parameter.
const preview = document.querySelector('meta[name="vanta-linking-preview"]')?.content === "true" &&
  window.location.hostname === "127.0.0.1" && window.location.protocol === "http:";
const options = { allowLoopback: preview };
element("preview-notice").hidden = !preview;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}
function showError(message) {
  error.textContent = message;
  error.hidden = false;
}
function clearError() {
  error.textContent = "";
  error.hidden = true;
}
function clearPassword() {
  password.value = "";
  password.type = "password";
  showPassword.textContent = "Show";
  showPassword.setAttribute("aria-pressed", "false");
  showPassword.setAttribute("aria-label", "Show password");
}
function setBusy(value) {
  busy = value;
  credentials.disabled = value;
  form.setAttribute("aria-busy", String(value));
  submitLabel.textContent = value ? "Linking your account…" : "Link account";
}
async function readJson(response) {
  if ((response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new Error("Unexpected service response.");
  }
  if (!response.body) throw new Error("Empty service response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) throw new Error("Service response is too large.");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function callApi(method, body) {
  controller?.abort();
  const activeController = new AbortController();
  controller = activeController;
  const timeout = window.setTimeout(() => activeController.abort(), 20000);
  const target = new URL(api);
  if (method === "GET") {
    for (const [key, value] of Object.entries(request)) target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, {
      method, mode: "cors", credentials: "omit", cache: "no-store",
      redirect: "error", referrerPolicy: "no-referrer", signal: activeController.signal,
      headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
    const data = await readJson(response);
    return { ok: response.ok, status: response.status, data };
  } finally {
    window.clearTimeout(timeout);
    if (controller === activeController) controller = null;
  }
}
function failureMessage(code) {
  if (code === 429) return "Too many attempts. Please wait a few minutes before trying again.";
  if (code === 401) return "That email and password combination wasn’t recognised. Please try again.";
  if (code === 400 || code === 403) return "This linking request is no longer available. Restart linking from your voice provider.";
  return "Account linking is temporarily unavailable. Please try again later.";
}
async function loadRequest() {
  clearError();
  retry.hidden = true;
  form.hidden = true;
  context = null;
  setStatus("Checking your linking request…");
  try {
    const response = await callApi("GET");
    if (!response.ok) throw new Error("Linking request unavailable.");
    context = validateMetadata(response.data, request, options);
    // Provider names and service content are never interpreted as HTML.
    element("provider-name").textContent = context.client.name;
    form.hidden = false;
    setStatus("");
  } catch {
    setStatus("");
    showError("We couldn’t verify this linking request. Try again, or restart linking from your voice provider.");
    retry.hidden = false;
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !context || !form.reportValidity()) return;
  clearError();
  retry.hidden = true;
  setBusy(true);
  const body = { ...request, email: email.value, password: password.value };
  clearPassword();
  setStatus("Verifying your account…");
  try {
    const pending = callApi("POST", body);
    // The serialized request owns the short-lived credential copy. Do not keep
    // it in form state, history, storage, analytics, or application logs.
    body.password = "";
    const response = await pending;
    if (!response.ok) {
      showError(failureMessage(response.status));
      setStatus("");
      if (response.status === 400 || response.status === 403) {
        context = null;
        form.hidden = true;
      }
      return;
    }
    const redirect = validateAuthorizationRedirect(response.data, context, options);
    setStatus(`Returning to ${context.client.name}…`);
    window.location.replace(redirect);
  } catch {
    setStatus("");
    showError("We couldn’t confirm account linking. Please restart linking from your voice provider.");
  } finally {
    body.password = "";
    clearPassword();
    setBusy(false);
  }
});
showPassword.addEventListener("click", () => {
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  showPassword.textContent = visible ? "Hide" : "Show";
  showPassword.setAttribute("aria-pressed", String(visible));
  showPassword.setAttribute("aria-label", `${showPassword.textContent} password`);
});
element("cancel").addEventListener("click", () => {
  if (!context) return;
  controller?.abort();
  clearPassword();
  window.location.replace(buildCancellationRedirect(context, options));
});
retry.addEventListener("click", loadRequest);
window.addEventListener("pagehide", () => { controller?.abort(); clearPassword(); });

try {
  const search = window.location.search;
  // Remove request parameters even when a malformed link is rejected below.
  window.history.replaceState(null, "", window.location.pathname);
  if (document.querySelector('meta[name="vanta-linking-origin"]')?.content !== window.location.origin) {
    throw new Error("Unexpected linking origin.");
  }
  api = validateApiEndpoint(document.querySelector('meta[name="vanta-linking-api"]')?.content, options);
  request = parseLinkRequest(search, options);
  void loadRequest();
} catch {
  setStatus("");
  showError("Open account linking from your voice provider to continue.");
}
