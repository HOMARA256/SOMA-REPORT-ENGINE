import assert from "node:assert/strict";
import test from "node:test";
import { edgeFunctionErrorCode } from "../apps/web/src/utils/edgeFunctionError.ts";
test("reads an Edge Function code from a successful JSON payload", async () => {
    assert.equal(await edgeFunctionErrorCode({ error: "SCHOOL_ADMIN_REQUIRED" }, null), "SCHOOL_ADMIN_REQUIRED");
});
test("reads a non-2xx Edge Function error body without consuming it", async () => {
    const context = new Response(JSON.stringify({ error: "TEACHER_ACCOUNT_ALREADY_REGISTERED" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
    });
    assert.equal(await edgeFunctionErrorCode(null, { context }), "TEACHER_ACCOUNT_ALREADY_REGISTERED");
    assert.deepEqual(await context.json(), { error: "TEACHER_ACCOUNT_ALREADY_REGISTERED" });
});
test("unknown or malformed Edge Function failures keep the generic fallback", async () => {
    assert.equal(await edgeFunctionErrorCode(null, { context: new Response("bad response", { status: 500 }) }), "");
    assert.equal(await edgeFunctionErrorCode(null, new Error("Network failure")), "");
});
