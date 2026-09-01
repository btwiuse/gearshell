// playground-catalog-agent.js — agent/task/music/events methods for the
// Playground Explorer (500-line split of playground-api-catalog.js).

export const agentCatalog = [
  {
    namespace: "terminal",
    title: "Terminal",
    methods: [
      { name: "list", args: [], hint: "List live terminal and VM bridge sessions." },
      {
        name: "create",
        args: [{ key: "profile", label: "Profile", type: "json", default: "{}", placeholder: '{"cmd":"/bin/bash","term":true}' }],
        hint: "Create a terminal session for an iframe or same-page terminal client.",
      },
      { name: "write", args: [{ key: "id", label: "Session id", type: "string" }, { key: "data", label: "Data", type: "json", default: '"ls\\n"' }], hint: "Write input data to a terminal session." },
      { name: "resize", args: [{ key: "id", label: "Session id", type: "string" }, { key: "cols", label: "Columns", type: "number", default: "80" }, { key: "rows", label: "Rows", type: "number", default: "24" }], hint: "Update terminal dimensions." },
      { name: "dispose", args: [{ key: "id", label: "Session id", type: "string" }], hint: "Dispose a terminal session." },
    ],
  },
  {
    namespace: "vm",
    title: "VM",
    title: "VM",
    methods: [
      { name: "list", args: [], hint: "List VM sessions hosted by the shell." },
      {
        name: "create",
        args: [{ key: "config", label: "Config", type: "json", default: "{}", placeholder: '{"memory":"512M","netdev":""}' }],
        hint: "Create an iframe VM session; VM plugins normally provide the backend and Linux assets.",
      },
    ],
  },
  {
    namespace: "tasks",
    title: "Tasks",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Live workspace-task sessions.",
      },
      {
        name: "create",
        args: [
          {
            key: "spec",
            label: "Spec",
            type: "json",
            default:
              '{"name":"probe","cmd":"echo hi","term":false,"background":true}',
            placeholder:
              '{"name":"probe","cmd":"echo hi","term":false,"background":true}',
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"background":true,"silent":false,"autoClose":true}',
          },
        ],
        hint:
          "background runs headless (no panel); persist:true survives reloads.",
      },
      {
        name: "cancel",
        args: [{ key: "id", label: "Task id", type: "string" }],
        hint: "Kill a task and close its panel.",
      },
      {
        name: "output",
        args: [{ key: "id", label: "Task id", type: "string" }],
        hint: "Captured output of a headless task (terminal tasks refuse).",
      },
    ],
  },
  {
    namespace: "agents",
    title: "Agents",
    methods: [
      {
        name: "list",
        args: [],
        hint: "Live terminal + task sessions (id prefix: terminal-/task-).",
      },
      {
        name: "prompt",
        args: [
          {
            key: "id",
            label: "Session id",
            type: "string",
            placeholder: "terminal-1",
          },
          { key: "text", label: "Text", type: "string", placeholder: "ls -la" },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: "{}",
            placeholder: '{"force":false}',
          },
        ],
        hint:
          "Inject a line into a live terminal; busy/human gates may refuse.",
      },
      {
        name: "read",
        args: [
          {
            key: "id",
            label: "Session id",
            type: "string",
            placeholder: "terminal-1",
          },
          {
            key: "options",
            label: "Options",
            type: "json",
            default: '{"rows":100}',
          },
        ],
        hint: "Snapshot the terminal scrollback as plain text.",
      },
      {
        name: "interrupt",
        args: [{
          key: "id",
          label: "Session id",
          type: "string",
          placeholder: "terminal-1",
        }],
        hint: "Send Ctrl+C to a live session.",
      },
    ],
  },
  {
    namespace: "music",
    title: "Music",
    methods: [
      {
        name: "play",
        args: [
          {
            key: "src",
            label: "URL / VFS path",
            type: "string",
            placeholder:
              "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          },
          { key: "title", label: "Title", type: "string", optional: true },
        ],
        hint: "Replace the queue with one track and play it.",
      },
      {
        name: "playQueue",
        args: [
          {
            key: "tracks",
            label: "Tracks",
            type: "json",
            default: "[]",
            placeholder: '[{"src":"/opfs/home/a.mp3","title":"A"}]',
          },
          {
            key: "startIndex",
            label: "Start index",
            type: "number",
            default: "0",
          },
        ],
        hint: "Queue a list of {src, title} and start at startIndex.",
      },
      {
        name: "enqueue",
        args: [
          { key: "tracks", label: "Tracks", type: "json", default: "[]" },
        ],
        hint: "Append tracks to the queue.",
      },
      { name: "next", args: [], hint: "Skip to the next track." },
      { name: "prev", args: [], hint: "Restart the track or go back." },
      {
        name: "setLoop",
        args: [
          {
            key: "mode",
            label: "Mode",
            type: "string",
            default: "off",
            placeholder: "off | all | one",
          },
        ],
        hint: "Loop mode: off / all / one.",
      },
      {
        name: "setShuffle",
        args: [{ key: "on", label: "On", type: "boolean", default: false }],
        hint: "Toggle random playback order.",
      },
      {
        name: "seek",
        args: [{
          key: "seconds",
          label: "Seconds",
          type: "number",
          default: "0",
        }],
        hint: "Seek the loaded track.",
      },
      {
        name: "reorderQueue",
        args: [
          { key: "from", label: "From", type: "number", default: "0" },
          { key: "to", label: "To", type: "number", default: "0" },
        ],
        hint: "Move a queue entry; the playing track stays pinned.",
      },
      {
        name: "removeFromQueue",
        args: [{ key: "index", label: "Index", type: "number", default: "0" }],
        hint: "Remove a queue entry by index.",
      },
      {
        name: "clearQueue",
        args: [],
        hint: "Empty the queue (keeps playing).",
      },
      { name: "listPlaylists", args: [], hint: "Named playlists." },
      {
        name: "savePlaylist",
        args: [
          { key: "name", label: "Name", type: "string" },
          { key: "tracks", label: "Tracks", type: "json", optional: true },
        ],
        hint: "Save the queue (or explicit tracks) under a name.",
      },
      {
        name: "renamePlaylist",
        args: [
          { key: "id", label: "Playlist id", type: "string" },
          { key: "name", label: "New name", type: "string" },
        ],
        hint: "Rename a playlist.",
      },
      {
        name: "deletePlaylist",
        args: [{ key: "id", label: "Playlist id", type: "string" }],
        hint: "Delete a playlist.",
      },
      {
        name: "loadPlaylist",
        args: [{ key: "id", label: "Playlist id", type: "string" }],
        hint: "Load a playlist into the queue.",
      },
      { name: "pause", args: [], hint: "Pause playback." },
      { name: "resume", args: [], hint: "Resume playback." },
      { name: "stop", args: [], hint: "Stop and unload the track." },
      { name: "nowPlaying", args: [], hint: "Full playback snapshot." },
    ],
  },
  {
    namespace: "events",
    title: "Events",
    methods: [
      {
        name: "on",
        args: [
          {
            key: "topic",
            label: "Topic",
            type: "string",
            placeholder: "task.status",
          },
          { key: "handler", label: "Handler", type: "handler" },
        ],
        hint: "Register an in-page handler; the Explorer passes a no-op.",
      },
      {
        name: "off",
        args: [{ key: "topic", label: "Topic", type: "string" }],
        hint: "Remove all handlers for a topic.",
      },
      {
        name: "emit",
        args: [
          {
            key: "topic",
            label: "Topic",
            type: "string",
            placeholder: "my.topic",
          },
          { key: "payload", label: "Payload", type: "json", default: "{}" },
        ],
        hint: "Publish an event (ring buffer + window CustomEvent mirror).",
      },
      {
        name: "drain",
        args: [],
        hint:
          "Splice the agent event ring buffer. Consumes it — agents rely on this.",
      },
      {
        name: "pending",
        args: [],
        hint: "How many events are buffered for agents.",
      },
    ],
  },
];
