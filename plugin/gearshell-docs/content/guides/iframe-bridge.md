---
id: iframe-bridge
title: "Calling the API from an iframe plugin"
kind: guide
---

# Calling the API from an iframe plugin

An iframe plugin's page is a separate browsing context. It loads
`/plugin/gear-bridge.js` as a classic script, which installs a
`window.GearShell` Proxy that turns every property access into a
`postMessage` to the parent shell. The parent validates the call
against the plugin's `permissions.api` whitelist and replies with the
result.

## The manifest

Every iframe plugin declares which API paths it can call:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "iframe": {
    "src": "/plugin/my-plugin/index.html",
    "allow": "clipboard-read; clipboard-write"
  },
  "permissions": {
    "api": [
      "panels.list",
      "panels.open",
      "music.nowPlaying",
      "music.play",
      "config.getShell"
    ]
  }
}
```

## The bridge in code

```html
<script src="/plugin/gear-bridge.js"></script>
<script type="module">
  // Every call is async — the bridge round-trips through postMessage.
  const { panels } = await GearShell.panels.list();
  console.log(panels);

  // Errors come back as { ok: false, error }.
  const reply = await GearShell.music.play("https://example.com/song.mp3");
  if (!reply.ok) console.error(reply.error);
</script>
```

## Events

`postMessage` cannot carry function references, so subscribing to a
topic from an iframe uses a dedicated local channel:

```js
// Open the channel for "task.status" once.
GearShell.subscribe("task.status");

// Add handlers with the local API.
GearShell.on("task.status", (payload) => {
  console.log("task status", payload);
});
```

The shell mirrors every event the agent event ring buffer sees into
the local channel for each subscribed topic.

## Permissions denied

Calling a path not in your `permissions.api` returns:

```js
const reply = await GearShell.config.reset();
// { ok: false, error: "permission denied: config.reset" }
```

Update the manifest and reload the plugin to grant the path.

