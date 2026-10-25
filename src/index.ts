import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CUSTOM_TYPE,
  meaningfulStatus,
  mergeStatus,
  renderStatus,
  restoreStatus,
  statusFromHeaders,
  statusFromResponseModel,
  statusKey,
} from "./logic.mjs";

const WIDGET_ID = "prime-agent-kiconnect-status";

type StoredStatus = {
  actualModel?: string;
  modelSource?: string;
  limit?: number;
  remaining?: number;
  resetSeconds?: number;
  quotaSource?: "local-shared";
  quotaMode?: "unlimited";
  observedAt?: number;
};

type AssistantMessage = {
  role?: unknown;
  provider?: unknown;
  responseModel?: unknown;
  usage?: { output?: unknown };
};

let status: StoredStatus = {};
let detailed = false;
let lastWidgetKey: string | undefined;
let responseStartedAt: number | undefined;
let tokensPerSecond = 0;

function isKiconnect(ctx: ExtensionContext): boolean {
  return ctx.model?.provider === "kiconnect";
}

function display(ctx: ExtensionContext): void {
  const lines = renderStatus(status, { detailed, tokensPerSecond });
  const key = lines.join("\n");
  if (key === lastWidgetKey) return;
  lastWidgetKey = key;
  ctx.ui.setWidget(WIDGET_ID, lines.length ? lines : undefined, { placement: "aboveEditor" });
}

function clear(ctx: ExtensionContext): void {
  status = {};
  responseStartedAt = undefined;
  tokensPerSecond = 0;
  lastWidgetKey = undefined;
  ctx.ui.setWidget(WIDGET_ID, undefined, { placement: "aboveEditor" });
}

function persist(pi: ExtensionAPI): void {
  // Do not store headers, aliases, prompts, response text, or credentials.
  pi.appendEntry(CUSTOM_TYPE, status);
}

function apply(patch: StoredStatus, pi: ExtensionAPI, ctx: ExtensionContext): void {
  const next = mergeStatus(status, patch) as StoredStatus;
  if (statusKey(next) !== statusKey(status)) {
    status = next;
    persist(pi);
  } else {
    status = next; // retain a fresher observed timestamp without writing an entry.
  }
  display(ctx);
}

export default function (pi: ExtensionAPI) {
  console.log("[prime-agent-kiconnect] loaded");

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (!isKiconnect(ctx)) return clear(ctx);
    const saved = restoreStatus((ctx.sessionManager as any).getEntries?.());
    if (saved) status = saved;
    display(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    if (!ctx.hasUI || !isKiconnect(ctx)) return clear(ctx);
    // Do not carry a verified model name from a previous selected model into a
    // new one. The next response will repopulate it.
    status = {};
    responseStartedAt = undefined;
    tokensPerSecond = 0;
    lastWidgetKey = undefined;
    display(ctx);
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (!ctx.hasUI || !isKiconnect(ctx)) return;
    responseStartedAt = Date.now();
    apply(statusFromHeaders(event.headers) as StoredStatus, pi, ctx);
  });

  pi.on("message_end", (event, ctx) => {
    if (!ctx.hasUI || !isKiconnect(ctx)) return;
    const message = event.message as AssistantMessage;
    if (message.role !== "assistant" || message.provider !== "kiconnect") return;
    const output = typeof message.usage?.output === "number" ? message.usage.output : 0;
    if (responseStartedAt && output > 0) {
      const elapsed = Date.now() - responseStartedAt;
      if (elapsed > 0) tokensPerSecond = Math.round((output / elapsed) * 1000);
    }
    // responseModel is deliberately distinct from configured message.model.
    // Current Pi AI fills it for Chat Completions. The upstream two-line
    // Responses parser fix documented in UPSTREAM.md fills it for KI streams.
    apply(statusFromResponseModel(message.responseModel) as StoredStatus, pi, ctx);
  });

  pi.registerCommand("kiconnect-status", {
    description: "Toggle detailed KI:connect verified model and gateway quota status",
    handler: async (_args, ctx) => {
      if (!isKiconnect(ctx)) {
        ctx.ui.notify("KI:connect is not the active provider.", "info");
        return;
      }
      detailed = !detailed;
      lastWidgetKey = undefined;
      display(ctx);
      ctx.ui.notify(`KI:connect detailed status ${detailed ? "shown" : "hidden"}`, "info");
    },
  });
}
