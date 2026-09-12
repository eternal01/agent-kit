export async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("concurrency must be a positive integer");
  const results = new Array<R>(values.length);
  let next = 0;

  async function runWorker() {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, runWorker));
  return results;
}
