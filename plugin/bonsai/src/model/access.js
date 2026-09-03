// Model access, device checks, and load lifecycle for the browser runtime.
const MODEL_ID = "prism-ml/Bonsai-27B-gguf";
const TOKEN_KEY = "bonsai27b_hf_token_v1";
const FALLBACK_BYTES = 3.8e9;

class ModelAccess {
  constructor({
    Bonsai27B,
    defaultGgufFile,
    byId,
    getChat,
    setChat,
    onChatReady,
  }) {
    this.Bonsai27B = Bonsai27B;
    this.defaultGgufFile = defaultGgufFile;
    this.byId = byId;
    this.getChat = getChat;
    this.setChat = setChat;
    this.onChatReady = onChatReady;

    this.query = new URLSearchParams(location.search);
    this.requireToken = window.BONSAI_REQUIRE_HF_TOKEN === true;
    this.modelSource = this.query.get("src") || MODEL_ID;

    this.gate = byId("gate");
    this.gateInput = byId("gateInput");
    this.gateError = byId("gateError");
    this.gateContinue = byId("gateContinue");
    this.gateField = byId("gateField");
    this.veil = byId("veil");
    this.fileInput = byId("loadFileInput");

    this.loadState = "idle";
    this.loadBlocked = false;
    this.accessToken = null;
    this.reauthAfterGate = false;

    this.wireEvents();
  }

  get chat() {
    return this.getChat();
  }

  isReady() {
    return this.loadState === "ready";
  }

  modelOptions() {
    return {
      file: this.modelSource === MODEL_ID ? this.defaultGgufFile : undefined,
      accessToken: this.accessToken ?? undefined,
    };
  }

  async validateToken(token) {
    const trimmed = (token || "").trim();
    if (!trimmed) return { valid: false, error: "A token is required." };
    try {
      const response = await fetch(
        `https://huggingface.co/api/models/${MODEL_ID}`,
        { headers: { Authorization: `Bearer ${trimmed}` } },
      );
      if (response.ok) return { valid: true };
      if (response.status === 401) {
        return { valid: false, error: "Invalid token." };
      }
      let body = null;
      try {
        body = await response.json();
      } catch {}
      const errorText = body?.error ? String(body.error) : "";
      if (
        response.status === 404 ||
        errorText.toLowerCase().includes("repository not found")
      ) {
        return {
          valid: false,
          error:
            "This token can't access the model. Request access on the model page, then try again.",
        };
      }
      if (response.status === 403) {
        return {
          valid: false,
          error: "Access forbidden - the token needs read permission.",
        };
      }
      return {
        valid: false,
        error: errorText || `Validation failed (HTTP ${response.status}).`,
      };
    } catch {
      return {
        valid: null,
        error: "Couldn't reach huggingface.co to verify the token.",
      };
    }
  }

  showGate(prefill = "") {
    this.veil.hidden = true;
    this.gate.hidden = false;
    this.gate.classList.remove("leave");
    if (prefill) this.gateInput.value = prefill;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        this.gate.classList.add("show");
        this.gateInput.focus();
      })
    );
  }

  showGateError(message) {
    this.gateError.textContent = message;
    this.gateError.hidden = false;
    this.gateField.classList.add("error");
  }

  clearGateError() {
    this.gateError.hidden = true;
    this.gateField.classList.remove("error");
  }

  grant(token) {
    this.accessToken = token;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    this.gate.classList.add("leave");
    setTimeout(() => {
      this.gate.hidden = true;
      this.gate.classList.remove("show", "leave");
    }, 550);
    if (!this.veil.hidden) {
      this.veil.classList.add("leave");
      setTimeout(() => {
        this.veil.hidden = true;
        this.veil.classList.remove("leave");
      }, 850);
    }
    window.App?.bootLanding?.();
    this.runAvailabilityCheck();
    if (this.reauthAfterGate) {
      this.reauthAfterGate = false;
      this.hideLoadError();
      this.startLoad();
    }
  }

  async submitGate() {
    if (this.gateContinue.classList.contains("busy")) return;
    const token = this.gateInput.value.trim();
    if (!token) {
      this.showGateError("A token is required.");
      return;
    }
    this.clearGateError();
    this.gateContinue.classList.add("busy");
    this.gateContinue.textContent = "VALIDATING ...";
    const result = await this.validateToken(token);
    this.gateContinue.classList.remove("busy");
    this.gateContinue.innerHTML = "CONTINUE &rarr;";
    if (result.valid === false) {
      this.showGateError(result.error);
      return;
    }
    this.grant(token);
  }

  async init() {
    if (!this.requireToken) {
      this.runAvailabilityCheck();
      return;
    }
    let stored = null;
    try {
      stored = localStorage.getItem(TOKEN_KEY);
    } catch {}
    if (!stored) {
      this.showGate();
      return;
    }
    this.veil.hidden = false;
    const result = await this.validateToken(stored);
    if (result.valid === false) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
      this.showGate(stored);
      this.showGateError(`${result.error} Enter a current token to continue.`);
      return;
    }
    this.grant(stored);
  }

  async runAvailabilityCheck() {
    if (!navigator.gpu) {
      this.blockLoad(
        "WebGPU isn't available in this browser. Try a recent Chrome or Edge.",
      );
      return;
    }
    try {
      const response = await this.Bonsai27B.checkAvailability(
        this.modelSource,
        this.modelOptions(),
      );
      if (
        response &&
        !response.ok &&
        response.reason &&
        this.loadState === "idle"
      ) {
        this.blockLoad(response.reason);
      }
    } catch {}
  }

  blockLoad(reason) {
    this.loadBlocked = true;
    const cta = this.byId("loadCta");
    cta.textContent = "UNAVAILABLE ON THIS DEVICE";
    cta.style.opacity = "0.45";
    cta.style.pointerEvents = "none";
    this.byId("ctaNote").textContent = reason;
    this.byId("ctaNote").hidden = false;
  }

  onLoadProgress(event) {
    if (event.status === "init") {
      BonsaiLoader.phase((event.message || "INITIALIZING").toUpperCase());
    } else if (event.status === "tokenizer") {
      BonsaiLoader.phase("PARSING TOKENIZER - 248K VOCAB");
    } else if (event.status === "weights") {
      if (event.kind === "bytes" && Number.isFinite(event.loaded)) {
        BonsaiLoader.phase(null);
        BonsaiLoader.set(
          event.loaded,
          Number.isFinite(event.total) && event.total > 0 ? event.total : FALLBACK_BYTES,
        );
      } else if (event.kind === "tensors") {
        if (/warmup/i.test(event.message || "")) {
          BonsaiLoader.phase("COMPILING WEBGPU KERNELS - WARMUP");
        } else if (Number.isFinite(event.total) && event.total > 0) {
          BonsaiLoader.info({
            tensors: event.loaded,
            tensorsTotal: event.total,
          });
        }
      }
    }
  }

  showLoadError(error) {
    const message = String(error?.message ?? error);
    document.body.classList.add("load-failed");
    BonsaiLoader.phase("LOAD FAILED");
    this.byId("loadErrorMsg").textContent = message;
    this.byId("loadError").hidden = false;
    const authIssue = this.requireToken &&
      /\b40[134]\b|unauthorized|forbidden|invalid token|\btoken\b|repository not found|access (denied|restricted|to model)/i
        .test(
          message,
        );
    this.byId("changeTokenBtn").hidden = !authIssue;
  }

  hideLoadError() {
    document.body.classList.remove("load-failed");
    this.byId("loadError").hidden = true;
    BonsaiLoader.phase(null);
  }

  async startLoad() {
    if (
      this.loadState === "loading" ||
      this.loadState === "ready" ||
      this.loadBlocked
    ) {
      return;
    }
    this.loadState = "loading";
    this.hideLoadError();
    BonsaiLoader.set(0, FALLBACK_BYTES);
    BonsaiLoader.phase("REQUESTING WEBGPU DEVICE");
    if (document.body.classList.contains("stage-loading")) {
      await new Promise((resolve) => setTimeout(resolve, 1150));
    }
    try {
      const chat = await this.Bonsai27B.load(this.modelSource, {
        ...this.modelOptions(),
        cache: this.query.has("nocache") ? false : undefined,
        maxLength: Number.parseInt(this.query.get("ctx") ?? "", 10) ||
          undefined,
        overflow: this.query.get("overflow") === "sinks" ? "sinks" : undefined,
        onProgress: (event) => this.onLoadProgress(event),
      });
      this.setChat(chat);
      this.loadState = "ready";
      window.__bonsaiChat = chat;
      this.onChatReady();
      BonsaiLoader.done();
    } catch (error) {
      console.error(error);
      this.loadState = "failed";
      this.showLoadError(error);
    }
  }

  async startLoadFromFile(file) {
    if (this.query.get("runtime") === "worker") {
      throw new Error(
        "LOAD FROM DISK is unavailable with the worker runtime; reload without ?runtime=worker.",
      );
    }
    if (
      !file ||
      this.loadState === "loading" ||
      this.loadState === "ready" ||
      this.loadBlocked
    ) {
      return;
    }
    this.loadState = "loading";
    this.hideLoadError();
    BonsaiLoader.set(0, file.size || FALLBACK_BYTES);
    BonsaiLoader.phase("READING LOCAL GGUF");
    try {
      const chat = await this.Bonsai27B.load(MODEL_ID, {
        ...this.modelOptions(),
        file,
        cache: false,
        maxLength: Number.parseInt(this.query.get("ctx") ?? "", 10) ||
          undefined,
        overflow: this.query.get("overflow") === "sinks" ? "sinks" : undefined,
        onProgress: (event) => this.onLoadProgress(event),
      });
      this.setChat(chat);
      this.loadState = "ready";
      window.__bonsaiChat = chat;
      this.onChatReady();
      BonsaiLoader.done();
    } catch (error) {
      console.error(error);
      this.loadState = "failed";
      this.showLoadError(error);
    }
  }

  pickLocalFile() {
    if (!this.fileInput) return;
    this.fileInput.value = "";
    this.fileInput.click();
  }

  onLocalFile(event) {
    const file = event.target.files && event.target.files[0];
    if (file) this.startLoadFromFile(file);
  }

  wireEvents() {
    const $ = this.byId;
    this.wireGate();
    this.wireLoadButtons();
    this.wireRetry();
  }

  wireGate() {
    this.gateContinue.addEventListener("click", (event) => {
      event.preventDefault();
      this.submitGate();
    });
    this.gateInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submitGate();
      }
    });
    this.gateInput.addEventListener("input", () => this.clearGateError());
    const $ = this.byId;
    $("gateShow").addEventListener("click", () => {
      const hidden = this.gateInput.type === "password";
      this.gateInput.type = hidden ? "text" : "password";
      $("gateShow").textContent = hidden ? "HIDE" : "SHOW";
    });
  }

  wireLoadButtons() {
    const $ = this.byId;
    $("loadCta").addEventListener(
      "click",
      (event) => {
        if (this.loadBlocked) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    const fileCta = $("loadFileCta");
    if (fileCta) {
      fileCta.addEventListener("click", (event) => {
        event.preventDefault();
        if (this.loadBlocked) return;
        this.pickLocalFile();
      });
    }
    this.fileInput?.addEventListener("change", (event) => this.onLocalFile(event));
  }

  wireRetry() {
    const $ = this.byId;
    $("retryBtn").addEventListener("click", (event) => {
      event.preventDefault();
      if (this.loadState === "failed") {
        this.hideLoadError();
        this.startLoad();
      }
    });
    $("changeTokenBtn").addEventListener("click", (event) => {
      event.preventDefault();
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
      this.reauthAfterGate = true;
      this.showGate(this.accessToken ?? "");
    });
  }
}

export function setupModelAccess(deps) {
  const access = new ModelAccess(deps);
  window.BonsaiApp = {
    startLoad: () => access.startLoad(),
    newSession: () => window.newSession?.(),
    openSession: (id) => window.openSession?.(id),
    listSessions: () => JSON.parse(localStorage.getItem("bonsai_chat_sessions_v1") ?? "[]"),
  };
  access.init();
  if (
    document.body.classList.contains("stage-loading") &&
    !access.query.has("demo") &&
    !access.query.has("p")
  ) {
    access.startLoad();
  }
  return access;
}
