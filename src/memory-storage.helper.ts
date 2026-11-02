import type { ReminderStorage } from './store';

/** In-memory stand-in for `ctx.storage`, with the same paging behaviour. */
export class MemoryStorage implements ReminderStorage {
  private readonly values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }

  async scan(options: { prefix: string; after?: string; limit?: number }) {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(options.prefix)).sort();
    const start = options.after ? keys.indexOf(options.after) + 1 : 0;
    const slice = keys.slice(start, start + (options.limit ?? 100));
    const last = slice.at(-1);
    const hasMore = last !== undefined && keys.indexOf(last) + 1 < keys.length;

    return {
      entries: slice.map((key) => ({ key, value: this.values.get(key) })),
      ...(hasMore && last ? { next: last } : {}),
    };
  }
}
