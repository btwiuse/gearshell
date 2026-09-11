// Optional off-main-thread host for the bitgpu runtime extracted from
// index.html. It deliberately owns the real chat object; the page
// receives only serializable progress and stream updates.
//
// Drives the runtime's token stream directly (chat.generate) so the
// plugin's Worker runtime uses the same protocol as the main-thread
// Bonsai27B; the main-thread facade re-emits the legacy streamTurn
// events expected by app.js and turn.js.
import { Bonsai27B } from "./index-runtime.js";

let chat = null;
let generationAbort = null;

function postError(error) {
  postMessage({
    type: "error",
    message: String(error?.message ?? error),
    contextFull: chat?.contextFull === true,
  });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      chat = await Bonsai27B.load(data.source, {
        ...data.options,
        onProgress: (progress) => postMessage({ type: "progress", progress }),
      });
      postMessage({
        type: "ready",
        contextLength: chat.contextLength,
        thinkCloseTokenId: chat.thinkCloseTokenId,
      });
      return;
    }

    if (data.type === "generate" && chat) {
      generationAbort = new AbortController();
      chat.chatTemplateArgs = data.chatTemplateArgs ?? {};
      for await (const update of chat.generate(data.messages, {
        ...data.options,
        signal: generationAbort.signal,
      })) {
        postMessage({ type: "update", update });
      }
      postMessage({
        type: "generation-complete",
        lastAssistantContent: chat.lastAssistantContent,
      });
      generationAbort = null;
      return;
    }

    if (data.type === "abort") generationAbort?.abort();
    if (data.type === "reset") chat?.reset();
    if (data.type === "template" && chat) chat.chatTemplateArgs = data.args ?? {};
  } catch (error) {
    generationAbort = null;
    postError(error);
  }
};
