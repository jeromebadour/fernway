// The delivery queue on Redis (BullMQ). One job per try; its id names the shipment and the try, so the same try is
// never queued twice while it waits. GHL allows about 100 requests per 10 s per location; Fernway stays under it.
import { Queue, Worker, type ConnectionOptions } from "bullmq";

export const QUEUE = "deliveries";
export type TryJob = { shipmentId: number; try: number };

export const jobId = (shipmentId: number, tryNumber: number) => `s${shipmentId}-t${tryNumber}`;

export function createQueue(connection: ConnectionOptions, prefix = "fernway") {
  const queue = new Queue<TryJob>(QUEUE, { connection, prefix });
  const schedule = async (shipmentId: number, tryNumber: number, delayMs: number) => {
    // The queue keeps finished jobs for a while, and adding a job whose id it still holds does nothing. A try that
    // already ran or failed can rightly come again (a resend starts at try 1; the sweep re-queues a stalled try), so
    // its old job is cleared first. A try still waiting or running keeps its job: the same try is never queued twice.
    const old = await queue.getJob(jobId(shipmentId, tryNumber));
    if (old) {
      const state = await old.getState();
      if (state === "completed" || state === "failed") await old.remove();
    }
    await queue.add("try", { shipmentId, try: tryNumber }, {
      jobId: jobId(shipmentId, tryNumber),
      delay: delayMs,
      attempts: 1,
      removeOnComplete: { count: 2_000 },
      removeOnFail: { count: 5_000 },
    });
  };
  return { queue, schedule };
}

export function createDeliveryWorker(
  connection: ConnectionOptions,
  run: (job: TryJob) => Promise<string>,
  opts: { concurrency?: number; prefix?: string } = {},
) {
  return new Worker<TryJob, string>(QUEUE, (job) => run(job.data), {
    connection,
    prefix: opts.prefix ?? "fernway",
    concurrency: opts.concurrency ?? 5,
    limiter: { max: 40, duration: 10_000 },
  });
}
