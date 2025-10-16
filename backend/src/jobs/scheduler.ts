import cron from 'node-cron';
import { logger } from '../lib/logger';

type Job = () => Promise<void> | void;

export function scheduleMonthlyTransfer(job: Job) {
  // At 00:00 on day-of-month 1.
  cron.schedule('0 0 1 * *', () => runJob('monthly-transfer', job));
}

export function scheduleThresholdSwap(job: Job) {
  // Every 5 minutes.
  cron.schedule('*/5 * * * *', () => runJob('threshold-swap', job));
}

async function runJob(name: string, job: Job) {
  try {
    logger.info(`Job start: ${name}`);
    await job();
    logger.info(`Job success: ${name}`);
  } catch (err) {
    logger.error(`Job failed: ${name}`, { err: (err as Error).message });
  }
}


