// Optional off-main-thread host for bitgpu. It deliberately owns the real chat object;
// the page receives only serializable progress and stream events.
import { Bonsai27B } from "./adapter.js";

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
      postMessage({ type: "ready", contextLength: chat.contextLength });
      return;
    }

    if (data.type === "generate" && chat) {
      generationAbort = new AbortController();
      for await (
        const event of chat.streamTurn(data.messages, {
          ...data.options,
          signal: generationAbort.signal,
        })
      ) {
        postMessage({ type: "event", event });
      }
      postMessage({ type: "generation-complete" });
      generationAbort = null;
      return;
    }

    if (data.type === "abort") generationAbort?.abort();
    if (data.type === "reset") chat?.reset();
  } catch (error) {
    generationAbort = null;
    postError(error);
  }
};
