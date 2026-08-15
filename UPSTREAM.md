# Why a small upstream Pi AI change is required for streamed Responses

## The boundary

A Prime extension receives `after_provider_response` **before** the SSE body is
consumed. That event has HTTP status and headers only. For KI:connect, the
truthful model name is commonly in the later `response.created` / `response.completed`
SSE object's `response.model`. It cannot be turned into an HTTP header after
headers have been sent.

The installed Pi AI type already has the correct field:

```ts
interface AssistantMessage {
  model: string;          // configured client alias; must not be overwritten
  responseModel?: string; // actual provider-reported model
}
```

Chat Completions already set `output.responseModel ||= chunk.model`. The
Responses parser does not, so an extension cannot see the value even though it
was parsed by the OpenAI SDK. This is an upstream Pi AI omission, not a LiteLLM
or extension-API capability.

## Proposed upstream patch

Target `packages/pi-ai/src/providers/openai-responses-shared.ts` (or its
source-equivalent). In `processResponsesStream`, retain the provider-returned
model independently of `output.model`:

```diff
 if (event.type === "response.created") {
   output.responseId = event.response.id;
+  if (typeof event.response.model === "string" && event.response.model) {
+    output.responseModel ||= event.response.model;
+  }
 }
 ...
 else if (event.type === "response.completed") {
   const response = event.response;
   if (response?.id) output.responseId = response.id;
+  if (typeof response?.model === "string" && response.model) {
+    output.responseModel ||= response.model;
+  }
```

Use `||=` deliberately: retain the first observed provider value and never
replace the configured `output.model`. Replacing it would make conversation
continuation falsely treat the prior assistant message as a different model.

## Effect

* **Direct KI:connect, Chat Completions:** works already because the Chat
  parser sets `responseModel`.
* **Direct KI:connect, Responses:** works after the upstream patch above.
* **LiteLLM non-streaming Responses:** the gateway may forward a truthful
  `X-Gateway-Upstream-Model` header, which this extension displays now.
* **LiteLLM streaming Responses:** LiteLLM cannot know that header before KI's
  later SSE event; the upstream patch makes the body value available at
  `message_end` instead.

The extension never substitutes a requested alias (`gpt-5-mini`) or gateway
route for a missing actual model, so it cannot falsely claim a deployment name.

## Local verification on 2026-08-15

A live low-output request through the local IONOS LiteLLM tunnel returned this
client-visible SSE event (only event metadata was retained):

```json
{"event":"response.created","model":"gpt-5-mini-Mitarbeitende","id_present":true}
```

So LiteLLM is already passing a provider-returned model through the Responses
SSE body in this route. It cannot make that later field available as an HTTP
header without delaying the response start and buffering SSE frames. The
installed Pi AI compiled parser was locally patched with the change above and
verified with a synthetic `response.created`/`response.completed` stream; it
produced `responseModel: "gpt-5-mini-Mitarbeitende"`. This local package edit
will be overwritten by a Prime/Pi AI update; keep the patch file in
`patches/pi-ai-openai-responses-response-model.patch` until upstreamed.
