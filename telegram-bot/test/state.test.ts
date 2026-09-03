import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state.js";

const ADDRESS_A = "0x1234567890123456789012345678901234567890";
const ADDRESS_B = "0x2345678901234567890123456789012345678901";

test("state store survives a corrupt file instead of crash-looping", async () => {
  const dir = await mkdtemp(join(tmpdir(), "covenant-state-"));
  const file = join(dir, "state.json");
  await writeFile(file, "{ truncated json");
  const store = new StateStore(file);
  await store.load();
  assert.equal(store.wallet(1), undefined);
  await store.setWallet(1, ADDRESS_A as never);
  assert.equal(store.wallet(1), ADDRESS_A);
  // The unreadable original is preserved for inspection.
  assert.ok(existsSync(`${file}.corrupt`));
  await rm(dir, { recursive: true, force: true });
});

test("link sessions are single-use, per-user, and expire", async () => {
  const dir = await mkdtemp(join(tmpdir(), "covenant-state-"));
  const file = join(dir, "state.json");
  const store = new StateStore(file);
  await store.load();

  store.beginLink(7, "CODE23456", Date.now() + 60_000);
  assert.equal(store.linkSession("CODE23456")?.userId, 7);
  // Completing once returns the user; a second attempt is rejected.
  assert.equal(store.completeLink("CODE23456", ADDRESS_A as never), 7);
  assert.equal(store.completeLink("CODE23456", ADDRESS_B as never), undefined);

  // A new begin for the same user replaces the previous code.
  store.beginLink(7, "NEXT7890", Date.now() + 60_000);
  assert.equal(store.linkSession("CODE23456"), undefined);
  assert.equal(store.linkSession("NEXT7890")?.userId, 7);

  // Expired sessions cannot be completed.
  store.beginLink(8, "OLDCODE99", Date.now() - 1_000);
  assert.equal(store.completeLink("OLDCODE99", ADDRESS_A as never), undefined);

  // Writes after fire-and-forget persists still land (queue recovery).
  await store.setWallet(2, ADDRESS_B as never);
  const onDisk = JSON.parse(await readFile(file, "utf8")) as {
    wallets: Record<string, string>;
    linkSessions: Record<string, { userId?: number; completedAddress?: string }>;
  };
  assert.equal(onDisk.wallets["2"], ADDRESS_B);
  // CODE23456 was replaced by NEXT7890 when user 7 began again.
  assert.equal(onDisk.linkSessions["CODE23456"], undefined);
  assert.equal(onDisk.linkSessions["NEXT7890"]?.userId, 7);
  await rm(dir, { recursive: true, force: true });
});

test("expired sessions are pruned when a new link begins", async () => {
  const dir = await mkdtemp(join(tmpdir(), "covenant-state-"));
  const store = new StateStore(join(dir, "state.json"));
  await store.load();
  store.beginLink(1, "STALE1234", Date.now() - 60_000);
  store.beginLink(2, "FRESH1234", Date.now() + 60_000);
  assert.equal(store.linkSession("STALE1234"), undefined);
  assert.equal(store.linkSession("FRESH1234")?.userId, 2);
  // Flush the queued fire-and-forget writes before the directory is removed.
  await store.setWallet(3, ADDRESS_B as never);
  await rm(dir, { recursive: true, force: true });
});
