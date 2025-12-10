"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../lib/prisma");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
async function main() {
    const file = (0, node_path_1.resolve)(process.cwd(), 'seed', 'wallets.json');
    const data = JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'));
    for (const w of data) {
        await prisma_1.prisma.wallet.upsert({
            where: { address: w.address },
            update: { name: w.name, type: w.type },
            create: { name: w.name, address: w.address, type: w.type },
        });
    }
    console.log('Seeded wallets:', data.map((w) => `${w.type}:${w.address}`).join(', '));
}
main().finally(async () => {
    await prisma_1.prisma.$disconnect();
});
