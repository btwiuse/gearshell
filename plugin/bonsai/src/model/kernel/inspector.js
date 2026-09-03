const WGSL_KEYWORDS = new Set([
  "fn",
  "let",
  "var",
  "const",
  "const_assert",
  "struct",
  "if",
  "else",
  "for",
  "loop",
  "return",
  "break",
  "continue",
  "switch",
  "case",
  "default",
  "while",
  "override",
  "enable",
  "requires",
  "discard",
  "alias",
  "true",
  "false",
  "workgroup",
  "storage",
  "uniform",
  "function",
  "private",
  "read",
  "write",
  "read_write",
  "bitcast",
]);
const WGSL_TYPES = new Set([
  "u32",
  "i32",
  "f32",
  "f16",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "mat2x2",
  "mat3x3",
  "mat4x4",
  "mat2x3",
  "mat3x2",
  "mat2x4",
  "mat4x2",
  "mat3x4",
  "mat4x3",
  "array",
  "atomic",
  "ptr",
  "sampler",
]);
const WGSL_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(@[A-Za-z_]\w*)|([A-Za-z_]\w*)|(\d[\w.]*)|(\s+)|([\s\S])/g;

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function highlightWgsl(src) {
  let out = "";
  WGSL_TOKEN.lastIndex = 0;
  let m;
  while ((m = WGSL_TOKEN.exec(src))) {
    const [token, comment, attr, ident, num, ws] = m;
    if (comment) out += `<span class="k-cm">${escapeHtml(comment)}</span>`;
    else if (attr) out += `<span class="k-at">${escapeHtml(attr)}</span>`;
    else if (ident) {
      const cls = WGSL_KEYWORDS.has(ident) ? "k-kw" : WGSL_TYPES.has(ident) ? "k-ty" : null;
      out += cls ? `<span class="${cls}">${ident}</span>` : escapeHtml(ident);
    } else if (num) out += `<span class="k-nu">${escapeHtml(num)}</span>`;
    else if (ws) out += ws;
    else out += escapeHtml(token);
  }
  return out;
}

export class KernelInspector {
  constructor({ getChat, byId }) {
    this.$ = byId;
    this.getChat = getChat;
    this.kernels = [];
    this.copySource = "";
    const $ = this.$;
    $("kernelsBtn").addEventListener("click", () => this.openKernels());
    $("kernelsOverlay").addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) this.closeKernels();
    });
    $("kxList").addEventListener("scroll", () => this.updateListFade(), {
      passive: true,
    });
    $("kxCopy").addEventListener("click", () => this.copyKernel());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("kernelsOverlay").hidden) {
        this.closeKernels();
      }
    });
  }

  async openKernels() {
    const $ = this.$;
    const list = $("kxList");
    list.replaceChildren();
    $("kxSource").hidden = true;
    $("kxIntro").hidden = false;
    this.copySource = "";
    $("kernelsOverlay").hidden = false;
    document.body.classList.add("kx-locked");
    list.scrollTop = 0;
    requestAnimationFrame(() => this.updateListFade());

    const chat = this.getChat();
    if (!chat) {
      $("kxSub").textContent = "LOAD THE MODEL TO INSPECT ITS COMPILED KERNELS";
      return;
    }

    $("kxSub").textContent = "LOADING PINNED BITGPU WGSL SOURCES";
    try {
      this.kernels = await (chat.runtime.getShaderSources?.() ?? []);
      this.kernels = this.kernels.filter(
        (kernel) => !/\btranscode\b|\.transcode\./i.test(kernel.name),
      );
      this.renderKernelList();
    } catch {
      this.kernels = [];
      $("kxSub").textContent = "KERNEL SOURCE CATALOG UNAVAILABLE";
    }
  }

  renderKernelList() {
    const $ = this.$;
    const list = $("kxList");
    list.replaceChildren();
    $("kxSub").textContent = `${this.kernels.length} WGSL COMPUTE SHADERS · COMPILED FOR YOUR GPU`;
    this.kernels.forEach((kernel, index) => {
      const item = document.createElement("button");
      item.className = "kx-item";
      item.type = "button";
      item.textContent = kernel.name;
      item.addEventListener("click", () => this.selectKernel(index));
      list.appendChild(item);
    });
    requestAnimationFrame(() => this.updateListFade());
  }

  updateListFade() {
    const list = this.$("kxList");
    const atEnd = list.scrollHeight <= list.clientHeight + 4 ||
      list.scrollTop >= list.scrollHeight - list.clientHeight - 4;
    list.parentElement.classList.toggle("at-end", atEnd);
  }

  selectKernel(index) {
    const kernel = this.kernels[index];
    if (!kernel) return;
    const $ = this.$;
    $("kxIntro").hidden = true;
    $("kxSource").hidden = false;
    [...$("kxList").children].forEach((el, j) => el.classList.toggle("active", j === index));
    $("kxName").textContent = kernel.name;
    $("kxLines").textContent = `${kernel.source.split("\n").length} LINES`;
    $("kxCode").innerHTML = highlightWgsl(kernel.source);
    $("kxCode").parentElement.scrollTop = 0;
    this.copySource = kernel.source;
  }

  closeKernels() {
    this.$("kernelsOverlay").hidden = true;
    document.body.classList.remove("kx-locked");
  }

  async copyKernel() {
    if (!this.copySource) return;
    try {
      await navigator.clipboard.writeText(this.copySource);
      this.$("kxCopy").textContent = "COPIED";
      setTimeout(() => {
        this.$("kxCopy").textContent = "COPY";
      }, 1200);
    } catch {}
  }
}

export function setupKernelInspector(deps) {
  return new KernelInspector(deps);
}
