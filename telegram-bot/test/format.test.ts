import assert from "node:assert/strict";
import test from "node:test";
import { cents, commandArgs, escapeHtml, remaining, shortAddress } from "../src/format.js";
import { parseTrade } from "../src/app.js";
import { createHmac } from "node:crypto";
import { telegramUserId } from "../src/telegram-auth.js";
import { WalletCustodyTool } from "../src/wallet-custody.js";

test("formats Event Contract probabilities", () => {
  assert.equal(cents(0.624), "62¢");
  assert.equal(cents(undefined), "—");
});

test("escapes Telegram HTML", () => {
  assert.equal(escapeHtml("A < B & C > D"), "A &lt; B &amp; C &gt; D");
});

test("parses command arguments", () => {
  assert.deepEqual(commandArgs("  1 YES buy 5 0.62  "), ["1", "YES", "buy", "5", "0.62"]);
});

test("shortens addresses", () => {
  assert.equal(shortAddress("0x1234567890123456789012345678901234567890"), "0x1234…7890");
});

test("renders settled expiry", () => {
  assert.equal(remaining(1), "settled");
});

test("parses safe trade previews", () => {
  assert.deepEqual(parseTrade("2 NO buy 4 0.37"), {
    marketNumber: "2",
    outcome: "NO",
    side: "buy",
    shares: 4,
    price: 0.37,
  });
});

test("rejects malformed trade previews", () => {
  assert.throws(() => parseTrade("2 MAYBE buy 4"), /Usage/);
  assert.throws(() => parseTrade("2 YES hold 4"), /buy or sell/);
  assert.throws(() => parseTrade("2 YES buy 0"), /greater than zero/);
  assert.throws(() => parseTrade("2 YES buy 4 2"), /between 0 and 1/);
});

test("accepts Telegram-signed Mini App init data and rejects tampering", () => {
  const botToken = "123456:testing-token";
  const user = JSON.stringify({ id: 424242, first_name: "Covenant" });
  const authDate = Math.floor(Date.now() / 1000);
  const unsigned = `auth_date=${authDate}&query_id=AA&user=${encodeURIComponent(user)}`;
  const dataCheckString = `auth_date=${authDate}\nquery_id=AA\nuser=${user}`;
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const initData = `${unsigned}&hash=${hash}`;
  assert.equal(telegramUserId(initData, botToken), 424242);
  assert.throws(() => telegramUserId(`${unsigned}&hash=${"00".repeat(32)}`, botToken), /verification failed/);
});

test("custody tool stays disabled unless explicitly enabled", () => {
  const tool = new WalletCustodyTool({
    exchange: { walletAddress: undefined } as never,
    canTrade: false,
    decimals: 6,
    tick: 1000n,
    lot: 1n,
  });
  assert.equal(tool.enabled, false);
  assert.rejects(() => tool.executeOrder({} as never), /custody is disabled/);
});
