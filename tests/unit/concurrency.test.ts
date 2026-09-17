import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "@/lib/concurrency";

describe("runWithConcurrency", () => {
  it("keeps at most the given number in flight", async () => {
    let inFlight = 0;
    let highWater = 0;

    await runWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    });

    expect(highWater).toBe(4);
  });

  it("works through every item", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(item);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("is faster than one at a time - the point of the exercise", async () => {
    const started = Date.now();
    await runWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // Twelve items of 20ms: 240ms one at a time, three rounds of 20ms at four abreast.
    expect(Date.now() - started).toBeLessThan(150);
  });

  it("does nothing with an empty list", async () => {
    let calls = 0;
    await runWithConcurrency([], 4, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  it("never starts more workers than there are items", async () => {
    let highWater = 0;
    let inFlight = 0;
    await runWithConcurrency([1, 2], 10, async () => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    });
    expect(highWater).toBe(2);
  });
});
