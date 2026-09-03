const GEAR_TOOL_NAME = "gearshell";

const GEAR_API_TOOLS = [
  {
    name: GEAR_TOOL_NAME,
    description:
      "Call a permitted GearShell API. Use fs.readFileText to read a text file, fs.writeFileText to write one, fs.readDir to list a directory, fs.stat to inspect a path, and config.getShell to inspect non-secret shell configuration.",
    parameters: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: [
            "fs.readFileText",
            "fs.writeFileText",
            "fs.readDir",
            "fs.stat",
            "config.getShell",
          ],
          description: "The permitted GearShell API method to call.",
        },
        args: {
          type: "array",
          items: {},
          description: "Positional arguments for the selected method.",
        },
      },
      required: ["method"],
      additionalProperties: false,
    },
  },
];

function toolError(message) {
  return JSON.stringify({ ok: false, error: message });
}

function toolResult(value) {
  return JSON.stringify({ ok: true, result: value });
}

function normaliseArguments(call) {
  const args = call?.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  return { method: args.method, values: Array.isArray(args.args) ? args.args : [] };
}

async function executeGearCall(call) {
  const input = normaliseArguments(call);
  if (!input?.method) return toolError("Tool call needs a GearShell API method.");
  const target = input.method.split(".").reduce(
    (value, key) => value?.[key],
    window.GearShell,
  );
  if (typeof target !== "function") {
    return toolError(`GearShell API is unavailable: ${input.method}`);
  }
  try {
    return toolResult(await target(...input.values));
  } catch (error) {
    return toolError(String(error?.message ?? error));
  }
}

export function getGearShellTools() {
  return GEAR_API_TOOLS.map((tool) => ({
    type: "function",
    function: tool,
  }));
}

export async function executeToolCall(call) {
  if (call?.name !== GEAR_TOOL_NAME) {
    return toolError(`Unknown tool: ${String(call?.name ?? "")}`);
  }
  return executeGearCall(call);
}
