# prime-agent-kiconnect

A small Prime Agent extension that shows two independently verified facts above
the editor when the active provider is `kiconnect`:

1. **the actual KI:connect model** returned by the provider (`response.model`),
   never merely the client alias; and
2. **the shared gateway request quota**, but only when the LiteLLM gateway marks
   it `X-Gateway-RateLimit-Source: local-shared`.

Example compact widget:

```text
KI: gpt-5-mini · 998/1000/h · 72 T/s
```

Run `/kiconnect-status` for provenance, reset time, and observation timestamp.

## Install

```bash
cd /Users/ek/tmp/prime-agent-kiconnect
npm test
bash install.sh
```

Then restart Prime Agent or run `/reload`.

The extension has no credentials, model catalogue, HTTP client, or quota gate.
Those remain in the generated Prime model catalogue and the central LiteLLM
service. It persists only sanitized actual-model/quota fields in the session's
extension-only custom entries.

## Honest coverage boundaries

Prime extensions receive only status and headers at `after_provider_response`,
not the later SSE body. The existing gateway deliberately cannot emit a model
header for a stream if LiteLLM only learns it from the later body.

* Gateway response header available: displayed immediately.
* Direct KI Chat Completions: Pi AI already puts `chunk.model` in
  `assistant.responseModel`; displayed at message completion.
* Direct or gateway **Responses streaming**: requires the two-line Pi AI parser
  fix in [`UPSTREAM.md`](UPSTREAM.md). The field already exists in Pi AI's
  public `AssistantMessage` type; only the Responses parser fails to fill it.

This distinction matters: showing the configured alias when metadata is absent
would make the UI look complete while defeating the purpose of the extension.

## Development

```bash
npm test
prime-agent -e ./src/index.ts
```

The tests cover header provenance, RFC quota fallback, missing streaming model
metadata, response-body metadata, rendering, and session restoration. A live
smoke should be a single short KI request through the tunnel, followed by one
direct-route test only after the upstream parser patch is available.
