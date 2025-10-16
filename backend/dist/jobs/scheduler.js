"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleMonthlyTransfer = scheduleMonthlyTransfer;
exports.scheduleThresholdSwap = scheduleThresholdSwap;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../lib/logger");
function scheduleMonthlyTransfer(job) {
    // At 00:00 on day-of-month 1.
    node_cron_1.default.schedule('0 0 1 * *', () => runJob('monthly-transfer', job));
}
function scheduleThresholdSwap(job) {
    // Every 5 minutes.
    node_cron_1.default.schedule('*/5 * * * *', () => runJob('threshold-swap', job));
}
async function runJob(name, job) {
    try {
        logger_1.logger.info(`Job start: ${name}`);
        await job();
        logger_1.logger.info(`Job success: ${name}`);
    }
    catch (err) {
        logger_1.logger.error(`Job failed: ${name}`, { err: err.message });
    }
}
