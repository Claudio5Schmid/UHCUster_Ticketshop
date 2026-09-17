/**
 * Runs `task` over `items`, at most `limit` of them in flight at once.
 *
 * The send loops used to be strictly one at a time, which meant every mail
 * waited out the one before it - and most of that wait is not the provider but
 * fetching the card PDFs from Storage. Overlapping those turns the club's whole
 * list from a ten-minute wait into a couple of minutes.
 *
 * Errors belong to the task: each one is expected to record its own outcome, so
 * a rejection here would abandon the rest of the list. The pace against the mail
 * provider is not this function's business either - the mailer holds that, since
 * the limit belongs to the API key rather than to any one loop.
 */
export async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;

  const queue = [...items];
  const workers = Array.from({ length: Math.min(Math.max(1, limit), queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await task(item);
    }
  });

  await Promise.all(workers);
}
