// Convert bitgpu's callback-plus-generator API into UI-friendly typed events.
function createEventQueue() {
  const events = [];
  let wake = null;
  return {
    events,
    push(event) {
      events.push(event);
      wake?.();
      wake = null;
    },
    wait() {
      return new Promise((resolve) => {
        wake = resolve;
      });
    },
    wake() {
      wake?.();
      wake = null;
    },
  };
}

async function produceEvents(chat, messages, options, queue, state) {
  try {
    const { onToolCall, ...streamOptions } = options;
    const stream = chat.stream(messages, {
      ...streamOptions,
      onThink: (delta) => {
        if (delta) queue.push({ type: "thinking", delta });
      },
      onToolCall: (call) => {
        queue.push({ type: "tool_call", call });
        onToolCall?.(call);
      },
    });
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        queue.push({ type: "complete", result: next.value });
        break;
      }
      if (next.value) queue.push({ type: "text", delta: next.value });
    }
  } catch (error) {
    state.failure = error;
  } finally {
    state.finished = true;
    queue.wake();
  }
}

export async function* streamChatEvents(chat, messages, options = {}) {
  const queue = createEventQueue();
  const state = { finished: false, failure: null };
  const producer = produceEvents(chat, messages, options, queue, state);
  while (!state.finished || queue.events.length > 0) {
    if (queue.events.length > 0) yield queue.events.shift();
    else await queue.wait();
  }
  await producer;
  if (state.failure) throw state.failure;
}
