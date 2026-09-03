import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/* The API validates initData against config.telegramToken, which is read at
   module load. Set the environment before importing the modules. */
const BOT_TOKEN = "700:integration-test-token";
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.COVENANT_WEB_URL = "https://covenant.example";

const { StateStore } = await import("../src/state.js");
const { createConnectApi } = await import("../src/connect-api.js");

function makeInitData(userId: number): string {
  const user = JSON.stringify({ id: userId, first_name: "Integration" });
  const authDate = Math.floor(Date.now() / 1000);
  const unsigned = `auth_date=${authDate}&query_id=QQ&user=${encodeURIComponent(user)}`;
  const dataCheckString = `auth_date=${authDate}\nquery_id=QQ\nuser=${user}`;
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return `${unsigned}&hash=${hash}`;
}

type Json = Record<string, unknown>;

async function post(base: string, path: string, body: unknown): Promise<{ status: number; json: Json }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

test("the connect API links a wallet to a Telegram account end to end", async () => {
  const dir = await mkdtemp(join(tmpdir(), "covenant-api-"));
  const store = new StateStore(join(dir, "state.json"));
  await store.load();
  const notified: Array<{ userId: number; address: string }> = [];
  const server = createConnectApi(store, {
    health: () => ({ network: "testnet" }),
    onVerified: (userId, address) => notified.push({ userId, address }),
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const initData = makeInitData(424242);

  try {
    // Health.
    const health = await fetch(`${base}/health`).then((r) => r.json() as Promise<Json>);
    assert.equal(health.ok, true);
    assert.equal(health.network, "testnet");

    // Not verified yet.
    const before = await post(base, "/api/connect/session", { initData });
    assert.equal(before.status, 200);
    assert.equal(before.json.verified, false);

    // Tampered initData is rejected.
    const tampered = await post(base, "/api/connect/begin", {
      initData: `${initData.replace("Integration", "Attacker")}`,
    });
    assert.equal(tampered.status, 400);

    // Begin a link.
    const begin = await post(base, "/api/connect/begin", { initData });
    assert.equal(begin.status, 200);
    assert.equal(begin.json.ok, true);
    const code = begin.json.code as string;
    const url = begin.json.url as string;
    assert.ok(url.startsWith("https://covenant.example/telegram/link?code="));
    assert.match(url, new RegExp(`code=${code}$`));

    // Pending status.
    const pending = await post(base, "/api/connect/status", { code });
    assert.equal(pending.json.state, "pending");

    // Unknown code.
    const unknown = await post(base, "/api/connect/status", { code: "ZZZZZZ9999" });
    assert.equal(unknown.json.state, "unknown");

    // The message to sign, for this code and address.
    const wallet = privateKeyToAccount(generatePrivateKey());
    const messageResponse = await fetch(
      `${base}/api/connect/message?code=${code}&address=${wallet.address}`,
    ).then((r) => r.json() as Promise<Json>);
    assert.equal(messageResponse.ok, true);
    const message = messageResponse.message as string;
    assert.ok(message.includes(`Link code: ${code}`));
    assert.ok(message.includes(wallet.address));

    // A signature from a different wallet does not verify.
    const imposter = privateKeyToAccount(generatePrivateKey());
    const imposterSig = await imposter.signMessage({ message });
    const wrongSigner = await post(base, "/api/connect/complete", {
      code,
      address: wallet.address,
      signature: imposterSig,
    });
    assert.equal(wrongSigner.status, 400);
    assert.match(String(wrongSigner.json.message), /does not prove ownership/);

    // The real signature completes the link exactly once.
    const signature = await wallet.signMessage({ message });
    const complete = await post(base, "/api/connect/complete", {
      code,
      address: wallet.address,
      signature,
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.json.address, wallet.address);
    assert.deepEqual(notified, [{ userId: 424242, address: wallet.address }]);

    const replay = await post(base, "/api/connect/complete", {
      code,
      address: wallet.address,
      signature,
    });
    assert.equal(replay.status, 400);
    assert.match(String(replay.json.message), /already used/);

    // Verified status and session reflect the binding.
    const status = await post(base, "/api/connect/status", { code });
    assert.equal(status.json.state, "verified");
    assert.equal(status.json.address, wallet.address);
    const session = await post(base, "/api/connect/session", { initData });
    assert.equal(session.json.verified, true);
    assert.equal(session.json.address, wallet.address);

    // A stale completed code no longer serves messages.
    const staleMessage = await fetch(
      `${base}/api/connect/message?code=${code}&address=${wallet.address}`,
    );
    assert.equal(staleMessage.status, 400);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
