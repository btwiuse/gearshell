import { createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import htm from "htm";

const html = htm.bind(h);
const HOSTS_KEY = "wetty:hosts:v1";

function normalizeUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("Enter a ws:// or wss:// terminal URL.");
  return url.href;
}

function storedHost(host) {
  const url = normalizeUrl(host.url);
  const name = String(host.name || `wetty@${new URL(url).host}`);
  const command = Array.isArray(host.command) ? host.command.filter(Boolean) : [];
  const environment = host.environment && typeof host.environment === "object" ? host.environment : {};
  return { name, url, command, environment };
}

function useHosts(setStatus) {
  const [hosts, setHosts] = useState([]);
  useEffect(() => {
    GearShell.config.kv.get(HOSTS_KEY).then((stored) => {
      setHosts(Array.isArray(stored) ? stored : []);
    }).catch(() => setStatus("Could not load saved hosts."));
  }, []);
  const persist = (next) => {
    setHosts(next);
    GearShell.config.kv.set(HOSTS_KEY, next).catch(() => setStatus("Could not save hosts."));
  };
  return [hosts, persist];
}

async function connect(host) {
  const config = storedHost(host);
  const terminal = await GearShell.terminal.external.create({ title: config.name });
  await GearShell.terminal.external.startWetty(terminal.sessionId, config);
}

function ConnectionForm({ onConnect, onSave }) {
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const host = () => ({ url, command: command.trim().split(/\s+/).filter(Boolean) });
  return html`
    <form onSubmit=${(event) => { event.preventDefault(); onConnect(host()); }} class="space-y-4">
      <div><label class="block text-xs text-gray-500 mb-1.5">WebSocket URL</label><input required value=${url} onInput=${(event) => setUrl(event.target.value)} placeholder="wss://host.example/terminal" class="w-full rounded-sm border border-gray-700 bg-transparent px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none" /></div>
      <div><label class="block text-xs text-gray-500 mb-1.5">Command (optional)</label><input value=${command} onInput=${(event) => setCommand(event.target.value)} placeholder="bash" class="w-full rounded-sm border border-gray-700 bg-transparent px-4 py-3 text-white focus:border-amber-500/50 focus:outline-none" /></div>
      <div class="flex gap-3"><button class="flex-1 rounded-sm bg-amber-600 py-3 text-sm font-medium text-white hover:bg-amber-500">Connect</button><button type="button" onClick=${() => onSave(host())} class="rounded-sm border border-gray-700 px-4 py-3 text-sm text-gray-300 hover:border-gray-500">Save host</button></div>
    </form>
  `;
}

function HostsList({ hosts, onConnect, onDelete }) {
  if (hosts.length === 0) return null;
  return html`
    <section class="space-y-2"><h2 class="text-sm font-medium text-gray-300">Saved hosts</h2>
      ${hosts.map((host, index) => html`
        <div class="flex items-center gap-3 rounded-sm border border-gray-800 px-3 py-2">
          <button type="button" onClick=${() => onConnect(host)} class="min-w-0 flex-1 text-left"><span class="block truncate text-sm text-gray-200">${host.name}</span><span class="block truncate text-xs text-gray-500">${host.url}</span></button>
          <button type="button" onClick=${() => onDelete(index)} class="text-xs text-gray-500 hover:text-red-400">Delete</button>
        </div>
      `)}
    </section>
  `;
}

function App() {
  const [status, setStatus] = useState("");
  const [hosts, persist] = useHosts(setStatus);
  const run = (host) => connect(host).then(() => setStatus("")).catch((error) => setStatus(error?.message || String(error)));
  const save = (host) => {
    try {
      const next = storedHost(host);
      const index = hosts.findIndex((item) => item.url === next.url);
      persist(index < 0 ? [...hosts, next] : hosts.map((item, i) => i === index ? next : item));
      setStatus("Host saved.");
    } catch (error) { setStatus(error?.message || String(error)); }
  };
  return html`
    <main class="min-h-screen flex items-center justify-center px-6 py-10"><section class="w-full max-w-xl space-y-6">
      <header><h1 class="text-lg font-semibold">Gear WeTTY</h1><p class="mt-1 text-sm text-gray-500">Open a remote WeTTY terminal in a native GearShell tab.</p></header>
      <${ConnectionForm} onConnect=${run} onSave=${save} />
      ${status && html`<p class="text-sm text-amber-300">${status}</p>`}
      <${HostsList} hosts=${hosts} onConnect=${run} onDelete=${(index) => persist(hosts.filter((_host, i) => i !== index))} />
    </section></main>
  `;
}

createRoot(document.getElementById("app")).render(html`<${App} />`);
