import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Address } from "viem";

/** A one-time wallet-link session created from inside the Telegram Mini App. */
export type LinkSession = {
  userId: number;
  expiresAt: number;
  /** Set when the signature verified; the code can no longer be completed. */
  completedAddress?: Address;
};

type State = {
  wallets: Record<string, Address>;
  readOnlyWallets: Record<string, Address>;
  linkSessions: Record<string, LinkSession>;
  /** One active code per Telegram user, so a new begin invalidates the old. */
  linkCodeByUser: Record<string, string>;
};

export class StateStore {
  private state: State = {
    wallets: {},
    readOnlyWallets: {},
    linkSessions: {},
    linkCodeByUser: {},
  };
  private writeQueue = Promise.resolve();

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      const loaded = JSON.parse(await readFile(this.file, "utf8")) as Partial<State>;
      this.state = {
        wallets: loaded.wallets ?? {},
        readOnlyWallets: loaded.readOnlyWallets ?? {},
        linkSessions: loaded.linkSessions ?? {},
        linkCodeByUser: loaded.linkCodeByUser ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        /* A truncated/corrupt state file must not crash-loop the worker on
           every restart: preserve the bad file for inspection and continue
           from empty state rather than dying on boot. */
        console.error(`State file ${this.file} is unreadable — starting fresh.`, error);
        await rename(this.file, `${this.file}.corrupt`).catch(() => undefined);
      }
    }
  }

  wallet(userId: number): Address | undefined {
    return this.state.wallets[String(userId)];
  }

  readOnlyWallet(userId: number): Address | undefined {
    return this.state.readOnlyWallets[String(userId)];
  }

  setReadOnlyWallet(userId: number, address: Address): Promise<void> {
    this.state.readOnlyWallets[String(userId)] = address;
    return this.persist();
  }

  setWallet(userId: number, address: Address): Promise<void> {
    this.state.wallets[String(userId)] = address;
    return this.persist();
  }

  removeWallet(userId: number): Promise<void> {
    delete this.state.wallets[String(userId)];
    delete this.state.readOnlyWallets[String(userId)];
    return this.persist();
  }

  /**
   * Create (or replace) the link session for a Telegram user and return its
   * one-time code. Expired sessions are pruned so the state file cannot grow
   * without bound.
   */
  beginLink(userId: number, code: string, expiresAt: number): void {
    const previous = this.state.linkCodeByUser[String(userId)];
    if (previous) delete this.state.linkSessions[previous];
    const now = Date.now();
    for (const [existing, session] of Object.entries(this.state.linkSessions)) {
      if (session.expiresAt < now) delete this.state.linkSessions[existing];
    }
    this.state.linkSessions[code] = { userId, expiresAt };
    this.state.linkCodeByUser[String(userId)] = code;
    /* Fire-and-forget like the old challenge store: the session is usable in
       memory immediately, and an unhandled rejection must never kill the bot. */
    this.persist().catch((error) => {
      console.error("Link session persist failed.", error);
    });
  }

  linkSession(code: string): LinkSession | undefined {
    return this.state.linkSessions[code];
  }

  /**
   * Atomically consume a pending session: marks it completed and returns the
   * Telegram user it belongs to. Returns undefined when the code is unknown,
   * expired, or already used — the caller must treat that as a failure.
   */
  completeLink(code: string, address: Address): number | undefined {
    const session = this.state.linkSessions[code];
    if (!session || session.expiresAt < Date.now() || session.completedAddress) {
      return undefined;
    }
    session.completedAddress = address;
    this.persist().catch((error) => {
      console.error("Link completion persist failed.", error);
    });
    return session.userId;
  }

  private persist(): Promise<void> {
    /* Chain onto the previous write but recover from its failure: a rejected
       queue would otherwise poison every subsequent persist AND surface as an
       unhandled rejection wherever persist() was not awaited. */
    const run = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.tmp`;
        await writeFile(temporary, JSON.stringify(this.state, null, 2));
        await rename(temporary, this.file);
      });
    this.writeQueue = run;
    return run;
  }
}
