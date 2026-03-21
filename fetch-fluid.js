#!/usr/bin/env node
/**
 * Fluid Protocol Data Fetcher
 * Pulls lending data from Fluid's official API
 * https://api.fluid.instadapp.io/v2/lending/<chain-id>/tokens
 * 
 * Rates are in 1e2 precision (100 = 1%, 10000 = 100%)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'aave.db');

// Chain ID mapping (same as Aave schema)
const CHAINS = {
    1: 'ethereum',
    137: 'polygon',
    42161: 'arbitrum',
    8453: 'base',
    56: 'bsc',
    9745: 'plasma',
};

// Initialize database
function initDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) return reject(err);
            const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
            db.exec(schema, (err) => {
                if (err) return reject(err);
                resolve(db);
            });
        });
    });
}

// Get chain ID from name
function getChainId(db, chainName) {
    return new Promise((resolve, reject) => {
        db.get('SELECT chain_id FROM chains WHERE name = ?', [chainName], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.chain_id : null);
        });
    });
}

// Store reserve
function storeReserve(db, reserveId, chainId, symbol, assetAddress) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO reserves (
                id, chain_id, app, market, underlying_asset, symbol, decimals,
                is_active, is_frozen, is_paused, borrowing_enabled, stable_borrow_rate_enabled,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 18, 1, 0, 0, 0, 0, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                is_active = excluded.is_active,
                symbol = excluded.symbol,
                updated_at = excluded.updated_at
        `, [
            reserveId,
            chainId,
            'Fluid',
            'Lending',
            assetAddress,
            symbol
        ], function(err) {
            if (err) return reject(err);
            resolve();
        });
    });
}

// Store snapshot
function storeSnapshot(db, reserveId, data) {
    return new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];
        db.run(`
            INSERT INTO reserve_snapshots (
                reserve_id, date, liquidity_rate, variable_borrow_rate,
                total_supplied, utilization_rate, price_in_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(reserve_id, date) DO UPDATE SET
                liquidity_rate = excluded.liquidity_rate,
                variable_borrow_rate = excluded.variable_borrow_rate,
                total_supplied = excluded.total_supplied,
                price_in_usd = excluded.price_in_usd
        `, [
            reserveId,
            today,
            data.supplyRate,
            data.borrowRate || null,
            String(data.totalAssets),
            null,
            data.tvlUsd
        ], function(err) {
            if (err) return reject(err);
            resolve();
        });
    });
}

// Fetch a single chain
async function fetchChain(db, chainId) {
    const chainName = CHAINS[chainId];
    if (!chainName) {
        console.log(`  Skipping unknown chain: ${chainId}`);
        return 0;
    }

    const dbChainId = await getChainId(db, chainName);
    if (!dbChainId) {
        console.log(`  Chain not in DB: ${chainName}`);
        return 0;
    }

    console.log(`Fetching Fluid on ${chainName} (chainId: ${chainId})...`);

    const res = await fetch(`https://api.fluid.instadapp.io/v2/lending/${chainId}/tokens`);
    if (!res.ok) throw new Error(`API error: ${res.status} for chain ${chainId}`);

    const data = await res.json();
    const tokens = data.data || [];
    console.log(`  Found ${tokens.length} tokens`);

    let processed = 0;
    for (const token of tokens) {
        try {
            const symbol = token.asset?.symbol || token.symbol;
            const assetAddress = token.assetAddress || token.address;
            const reserveId = `fluid_${chainName}_${symbol}_${token.address.slice(2, 10).toLowerCase()}`;

            // Rates: API returns in 1e2 (100 = 1%), store as decimal (0.01)
            const supplyRate = parseInt(token.supplyRate || 0) / 10000;
            const totalRate = parseInt(token.totalRate || 0) / 10000;
            const rewardsRate = parseInt(token.rewardsRate || 0) / 10000;

            // TVL: totalAssets * price / 10^decimals
            const totalAssets = parseInt(token.totalAssets || 0);
            const price = parseFloat(token.asset?.price || 0);
            const decimals = parseInt(token.decimals || 18);
            const tvlUsd = totalAssets * price / Math.pow(10, decimals);

            await storeReserve(db, reserveId, dbChainId, symbol, assetAddress);
            await storeSnapshot(db, reserveId, {
                supplyRate: totalRate, // totalRate includes rewards
                borrowRate: null,
                totalAssets: totalAssets,
                tvlUsd: tvlUsd,
            });

            processed++;
        } catch (err) {
            console.error(`  Error processing token ${token.symbol}:`, err.message);
        }
    }

    return processed;
}

// Main
async function main() {
    let db;
    try {
        db = await initDb();

        // Log start
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO sync_log (sync_type, chain_name, started_at, status) VALUES ('fluid_update', 'all', datetime('now'), 'running')`,
                function(err) { if (err) reject(err); else resolve(this.lastID); });
        });

        let total = 0;
        for (const chainId of Object.keys(CHAINS)) {
            const count = await fetchChain(db, parseInt(chainId));
            total += count;
        }

        // Log success
        await new Promise((resolve, reject) => {
            db.run(`UPDATE sync_log SET completed_at = datetime('now'), items_count = ?, status = 'success'
                    WHERE id = (SELECT MAX(id) FROM sync_log WHERE sync_type = 'fluid_update' AND status = 'running')`,
                [total], (err) => { if (err) reject(err); else resolve(); });
        });

        console.log(`\n✅ Fluid fetch complete: ${total} tokens updated`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (db) {
            await new Promise((resolve) => {
                db.run(`UPDATE sync_log SET completed_at = datetime('now'), status = 'error', error_message = ?
                        WHERE id = (SELECT MAX(id) FROM sync_log WHERE sync_type = 'fluid_update' AND status = 'running')`,
                    [error.message], () => resolve());
            });
        }
        process.exit(1);
    } finally {
        if (db) db.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { initDb };
