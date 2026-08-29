// Home marketing content: copy + data arrays for the landing page.
// Kept out of the section components so copy edits never touch markup.

import { Archive, Cpu, Layers, Zap } from "lucide-react";

export const GH = "https://github.com/gearshell/gearshell";

export const features = [
  {
    id: "kernel",
    icon: Cpu,
    title: "A real kernel",
    body:
      "Linux. Real syscalls. Real processes. Real filesystems. Real networking. Not a sandbox. Not an emulator. A kernel.",
  },
  {
    id: "stack",
    icon: Layers,
    title: "Your full stack",
    body:
      "Node. Python. Go. Rust. Bash. Postgres. Redis. Whatever runs on your laptop runs here.",
  },
  {
    id: "speed",
    icon: Zap,
    title: "Sub-second cold starts",
    body:
      "Open a repo. It is already running. No npm install for an hour. No Docker daemon. No warmup.",
  },
  {
    id: "persistent",
    icon: Archive,
    title: "Persistent by default",
    body:
      "Close the tab. Open it next week. Open it on a plane. Files. Shell history. Branches. Dotfiles. State. Right where you left it.",
  },
];

export const steps = [
  {
    n: "01",
    h: "WASM microkernel",
    p: "A real operating environment compiled to WebAssembly. Linux syscalls, processes, networking — all running in your browser sandbox.",
  },
  {
    n: "02",
    h: "Virtual filesystem",
    p: "A writable VFS that survives reloads. Mount remote repos, import local folders, snapshot the entire workspace to a URL.",
  },
  {
    n: "03",
    h: "Browser-native shell",
    p: "xterm.js-driven PTY, tiling window manager, and a built-in browser. CLI agents like Claude Code or Crush run unmodified.",
  },
];

export const quotes = [
  {
    initials: "LH",
    body: "The browser is the new curl | sh. A URL is a binary now.",
    author: "Lin H.",
    role: "agent builder",
  },
  {
    initials: "MR",
    body:
      "I shipped a Claude Code session from a phone on a train. The state was exactly where I left it when I opened the same URL on my laptop two hours later.",
    author: "Marta R.",
    role: "solo dev",
  },
  {
    initials: "DK",
    body:
      "We embed a GearShell tab in our docs. Customers run the example in one click — no Docker, no npm install, no Slack message asking us why their node version is wrong.",
    author: "Devin K.",
    role: "infra lead, series A",
  },
];

export const fieldPoll = [
  { label: "Cloudflare", pct: "43.6%" },
  { label: "AWS / GCP / Azure", pct: "24.7%" },
  { label: "Vercel", pct: "11.2%" },
  { label: "Other", pct: "20.5%" },
];

export const localFirstChips = [
  ["Your code", " your cache"],
  ["Your model", " your GPU"],
  ["Your files", " your disk"],
  ["Your agent", " your rules"],
];
