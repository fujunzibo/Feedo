"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSigner = void 0;
exports.getConnection = getConnection;
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../config");
const signer_1 = require("./signer");
Object.defineProperty(exports, "getSigner", { enumerable: true, get: function () { return signer_1.getSigner; } });
function getConnection() {
    const url = config_1.appEnv.rpcUrl || (0, web3_js_1.clusterApiUrl)('devnet');
    return new web3_js_1.Connection(url, 'confirmed');
}
