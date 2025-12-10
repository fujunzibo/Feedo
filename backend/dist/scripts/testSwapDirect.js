"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const thresholdSwap_1 = require("../services/thresholdSwap");
async function testSwapDirect() {
    console.log('Testing swap function directly...');
    try {
        const result = await (0, thresholdSwap_1.checkThresholdAndSwap)();
        console.log('Swap result:', result);
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testSwapDirect().catch(console.error);
