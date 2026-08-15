import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_TYPE, renderStatus, restoreStatus, statusFromHeaders, statusFromResponseModel,
} from "../src/logic.mjs";

test("accepts only gateway-labelled quota and a provenance-labelled actual model", () => {
  const status = statusFromHeaders({
    "X-Gateway-RateLimit-Source": "local-shared",
    "X-RateLimit-Limit-Hour": "1000",
    "X-RateLimit-Remaining-Hour": "999",
    "X-RateLimit-Reset-Hour": "42",
    "X-Gateway-Upstream-Model": "gpt-5-mini",
    "X-Gateway-Upstream-Model-Source": "response.model",
  }, 123);
  assert.deepEqual(status, {
    limit: 1000, remaining: 999, resetSeconds: 42, quotaSource: "local-shared",
    actualModel: "gpt-5-mini", modelSource: "gateway:response.model", observedAt: 123,
  });
});

test("does not mistake plain or SAIA-shaped headers for KI gateway state", () => {
  const status = statusFromHeaders({
    "llm_provider-x-ratelimit-remaining-hour": "12",
    "x-ratelimit-remaining-hour": "999",
    "x-gateway-upstream-model": "untrusted",
  });
  assert.deepEqual(status, { observedAt: status.observedAt });
});

test("parses RFC RateLimit fields and keeps stream model unknown when header is absent", () => {
  const status = statusFromHeaders({
    "x-gateway-ratelimit-source": "local-shared",
    "ratelimit-limit": "100;w=3600",
    "ratelimit-remaining": "71",
    "ratelimit-reset": "3599",
  }, 3);
  assert.equal(status.limit, 100);
  assert.equal(status.remaining, 71);
  assert.equal(status.actualModel, undefined);
});

test("accepts body responseModel independently for direct Chat and patched Responses paths", () => {
  assert.deepEqual(statusFromResponseModel("gpt-5.6-terra", 9), {
    actualModel: "gpt-5.6-terra", modelSource: "response.body", observedAt: 9,
  });
  assert.deepEqual(statusFromResponseModel("bad\nmodel"), {});
});

test("renders compact and detailed views without a configured-alias fallback", () => {
  const status = { actualModel: "gpt-5-mini", modelSource: "response.body", limit: 1000, remaining: 998, resetSeconds: 11, observedAt: 0 };
  assert.deepEqual(renderStatus(status, { tokensPerSecond: 72 }), ["KI: gpt-5-mini · 998/1000/h · 72 T/s"]);
  const detail = renderStatus(status, { detailed: true, tokensPerSecond: 72 });
  assert.match(detail[1], /response.body/);
  assert.match(detail[2], /11s/);
});

test("restores only the newest validated namespaced custom entry", () => {
  const restored = restoreStatus([
    { type: "custom", customType: CUSTOM_TYPE, data: { actualModel: "old", observedAt: 1 } },
    { type: "custom", customType: CUSTOM_TYPE, data: { actualModel: "gpt-5-mini", remaining: 999, limit: 1000, quotaSource: "local-shared", observedAt: 2 } },
  ]);
  assert.equal(restored.actualModel, "gpt-5-mini");
  assert.equal(restored.remaining, 999);
});
