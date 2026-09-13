importScripts('https://w9y.io/go/wasm_exec.js');

const wasmURL = 'https://w9y.io/go/github.com/btwiuse/piping-ssh-web/go@websocketstream';
const exportedPromise = new Promise((resolve) => {
  self.pipingSshGoExportResolve = resolve;
});
const go = new Go();
const pending = new Map();
let inputController = null;
let requestId = 0;
let resizePort = null;
let latestResize = null;

(async () => {
  const response = await fetch(wasmURL);
  const result = await WebAssembly.instantiateStreaming(response, go.importObject);
  go.run(result.instance);
})().catch((error) => self.postMessage({ type: 'exit', payload: { error: String(error) } }));

function ask(prompt) {
  const id = ++requestId;
  self.postMessage({ type: 'prompt', id, prompt });
  return new Promise((resolve) => pending.set(id, resolve));
}

function startInput() {
  return new ReadableStream({ start(controller) { inputController = controller; } });
}

function createResizePort() {
  const channel = new MessageChannel();
  resizePort = channel.port1;
  if (latestResize) resizePort.postMessage(latestResize);
  return channel.port2;
}

async function start(config) {
  const exported = await exportedPromise;
  const stream = new WebSocketStream(config.pipingServerUrl);
  const transport = await stream.opened;
  await exported.doSsh({
    transport,
    termReadable: startInput(),
    agentForwarding: config.agentForwarding === true,
    initialRows: config.rows || 24,
    initialCols: config.cols || 80,
    username: config.username || '',
    messagePort: createResizePort(),
    authKeySets: config.authKeySets || [],
  }, {
    termWrite: (data) => self.postMessage({ type: 'output', data }),
    onPasswordAuth: () => ask({ kind: 'password', title: 'Password', secret: true, saveable: true })
      .then((answer) => answer == null ? answer : typeof answer === 'object' ? answer.value : answer),
    onKeyboardInteractive: async (name, instruction, questions, echos) => {
      const header = [name, instruction].filter(Boolean).join('\n');
      const answers = [];
      for (let index = 0; index < questions.length; index += 1) {
        answers.push(await ask({
          title: 'Authentication',
          message: [header, questions[index]].filter(Boolean).join('\n'),
          secret: !echos[index],
        }));
      }
      return answers;
    },
    getAuthPrivateKeyPassphrase: (fingerprint) => ask({
      title: 'Passphrase', message: `Enter passphrase for ${fingerprint}`, secret: true,
    }),
    onAuthSigned: () => {},
    onHostKey: async ({ key }) => {
      if (config.trustedHostKeys?.includes(key.fingerprint)) return true;
      const trusted = await ask({
        title: 'New host', message: `${key.type} key fingerprint is ${key.fingerprint}\nTrust this host key?`, input: false, confirmLabel: 'Trust',
      });
      self.postMessage({ type: 'hostKey', fingerprint: key.fingerprint, trusted: trusted !== null });
      return trusted !== null;
    },
    onAgentConfirm: (key, payload) => ask({
      title: 'Agent sign', message: `${key}\nPayload: ${Array.from(payload).map((byte) => byte.toString(16).padStart(2, '0')).join(' ')}`, input: false, confirmLabel: 'Allow',
    }).then((value) => value !== null),
    onConnected: () => self.postMessage({ type: 'connected' }),
  });
  self.postMessage({ type: 'exit', payload: { code: 0 } });
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'start') start(message.config).catch((error) => {
    self.postMessage({ type: 'exit', payload: { error: String(error?.message || error) } });
  });
  if (message?.type === 'input') inputController?.enqueue(message.data);
  if (message?.type === 'resize') {
    latestResize = message.payload;
    resizePort?.postMessage(latestResize);
  }
  if (message?.type === 'response') {
    const resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve?.(message.value);
  }
  if (message?.type === 'close') {
    inputController?.close();
    resizePort?.postMessage({ type: 'disconnect' });
    close();
  }
});
