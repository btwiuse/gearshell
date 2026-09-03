// Convert bitgpu's callback-plus-generator API into UI-friendly typed events.
export async function* streamChatEvents(chat, messages, options = {}) {
  const events = [];
  let wake = null;
  let finished = false;
  let failure = null;

  const push = (event) => {
    events.push(event);
    wake?.();
    wake = null;
  };

  const producer = (async () => {
    try {
      const stream = chat.stream(messages, {
        ...options,
        onThink: (delta) => {
          if (delta) push({ type: "thinking", delta });
        },
      });
      for (;;) {
        const next = await stream.next();
        if (next.done) {
          push({ type: "complete", result: next.value });
          break;
        }
        if (next.value) push({ type: "text", delta: next.value });
      }
    } catch (error) {
      failure = error;
    } finally {
      finished = true;
      wake?.();
      wake = null;
    }
  })();

  while (!finished || events.length > 0) {
    if (events.length > 0) {
      yield events.shift();
    } else {
      await new Promise((resolve) => {
        wake = resolve;
      });
    }
  }

  await producer;
  if (failure) throw failure;
}
