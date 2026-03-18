#!/usr/bin/env node
/**
 * Aave Protocol Data Fetcher
 * Pulls reserve data from Aave v3 GraphQL API
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'aave.db');
const API_URL = 'https://api.v3.aave.com/graphql';

// GraphQL queries - correct fields based on schema
const QUERIES = {
    chains: `query Chains { chains { name chainId } }`,

    markets: `query Markets($request: MarketsRequest!) {
        markets(request: $request) {
            name
            chain { name chainId }
            reserves {
                underlyingToken { address name symbol decimals }
                size { amount { raw decimals } usd }
                supplyInfo { apy { value } total { raw decimals } }
                borrowInfo { apy { value } total { amount { raw decimals } } availableLiquidity { amount { raw decimals } } utilizationRate { value } }
                isFrozen
                isPaused
            }
        }
    }`
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

// GraphQL fetch helper
async function fetchGraphQL(query) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.errors) {
        throw new Error(`GraphQL error: ${data.errors[0].message}`);
    }
    
    return data.data;
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
function storeReserve(db, reserve, chainId) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO reserves (
                id, chain_id, app, market, underlying_asset, symbol, decimals,
                a_token_address, stable_debt_token_address, variable_debt_token_address,
                is_active, is_frozen, is_paused, borrowing_enabled, stable_borrow_rate_enabled,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                is_active = excluded.is_active,
                is_frozen = excluded.is_frozen,
                is_paused = excluded.is_paused,
                borrowing_enabled = excluded.borrowing_enabled,
                market = excluded.market,
                updated_at = excluded.updated_at
        `, [
            reserve.id,
            chainId,
            'Aave',
            reserve.market || 'Core',
            reserve.underlyingAsset,
            reserve.symbol,
            reserve.decimals,
            reserve.aToken?.id || null,
            reserve.stableDebtToken?.id || null,
            reserve.variableDebtToken?.id || null,
            reserve.isActive ? 1 : 0,
            reserve.isFrozen ? 1 : 0,
            reserve.isPaused ? 1 : 0,
            reserve.borrowingEnabled ? 1 : 0,
            reserve.stableBorrowRateEnabled ? 1 : 0
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
                reserve_id, date, liquidity_rate, stable_borrow_rate, variable_borrow_rate,
                liquidity_index, available_liquidity, total_supplied, total_borrowed,
                utilization_rate, price_in_eth, price_in_usd
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(reserve_id, date) DO UPDATE SET
                liquidity_rate = excluded.liquidity_rate,
                variable_borrow_rate = excluded.variable_borrow_rate,
                available_liquidity = excluded.available_liquidity,
                total_supplied = excluded.total_supplied,
                total_borrowed = excluded.total_borrowed,
                price_in_usd = excluded.price_in_usd
        `, [
            reserveId,
            today,
            data.liquidityRate,
            data.stableBorrowRate,
            data.variableBorrowRate,
            data.liquidityIndex,
            data.availableLiquidity,
            data.totalSupplied,
            data.totalBorrowed,
            data.utilizationRate,
            data.priceInEth,
            data.priceInUsd
        ], function(err) {
            if (err) return reject(err);
            resolve();
        });
    });
}

// Calculate changes
async function calculateChanges(db) {
    const today = new Date().toISOString().split('T')[0];
    
    const queries = [
        // 1-day changes (2 params)
        {
            sql: `INSERT OR REPLACE INTO rate_changes (
                reserve_id, supply_rate_change_1d, borrow_rate_change_1d, tvl_change_1d, updated_at
            )
            SELECT 
                s1.reserve_id,
                ROUND((s1.liquidity_rate - s2.liquidity_rate) * 100.0 / NULLIF(s2.liquidity_rate, 0), 4),
                ROUND((s1.variable_borrow_rate - s2.variable_borrow_rate) * 100.0 / NULLIF(s2.variable_borrow_rate, 0), 4),
                ROUND((CAST(s1.total_supplied AS REAL) - CAST(s2.total_supplied AS REAL)) * 100.0 / NULLIF(CAST(s2.total_supplied AS REAL), 0), 4),
                datetime('now')
            FROM reserve_snapshots s1
            JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
            WHERE s1.date = ? AND s2.date = date(?, '-1 day')`,
            params: [today, today]
        },
        // 7-day changes (6 params)
        {
            sql: `UPDATE rate_changes SET
                supply_rate_change_7d = (
                    SELECT ROUND((s1.liquidity_rate - s2.liquidity_rate) * 100.0 / NULLIF(s2.liquidity_rate, 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-7 days') AND s1.reserve_id = rate_changes.reserve_id
                ),
                borrow_rate_change_7d = (
                    SELECT ROUND((s1.variable_borrow_rate - s2.variable_borrow_rate) * 100.0 / NULLIF(s2.variable_borrow_rate, 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-7 days') AND s1.reserve_id = rate_changes.reserve_id
                ),
                tvl_change_7d = (
                    SELECT ROUND((CAST(s1.total_supplied AS REAL) - CAST(s2.total_supplied AS REAL)) * 100.0 / NULLIF(CAST(s2.total_supplied AS REAL), 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-7 days') AND s1.reserve_id = rate_changes.reserve_id
                )`,
            params: [today, today, today, today, today, today]
        },
        // 30-day changes (6 params)
        {
            sql: `UPDATE rate_changes SET
                supply_rate_change_30d = (
                    SELECT ROUND((s1.liquidity_rate - s2.liquidity_rate) * 100.0 / NULLIF(s2.liquidity_rate, 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-30 days') AND s1.reserve_id = rate_changes.reserve_id
                ),
                borrow_rate_change_30d = (
                    SELECT ROUND((s1.variable_borrow_rate - s2.variable_borrow_rate) * 100.0 / NULLIF(s2.variable_borrow_rate, 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-30 days') AND s1.reserve_id = rate_changes.reserve_id
                ),
                tvl_change_30d = (
                    SELECT ROUND((CAST(s1.total_supplied AS REAL) - CAST(s2.total_supplied AS REAL)) * 100.0 / NULLIF(CAST(s2.total_supplied AS REAL), 0), 4)
                    FROM reserve_snapshots s1
                    JOIN reserve_snapshots s2 ON s1.reserve_id = s2.reserve_id
                    WHERE s1.date = ? AND s2.date = date(?, '-30 days') AND s1.reserve_id = rate_changes.reserve_id
                )`,
            params: [today, today, today, today, today, today]
        },
        // Set alerts (0 params)
        {
            sql: `UPDATE rate_changes SET
                alert_supply_spike = CASE WHEN supply_rate_change_1d > 20 OR supply_rate_change_7d > 50 THEN 1 ELSE 0 END,
                alert_borrow_spike = CASE WHEN borrow_rate_change_1d > 20 OR borrow_rate_change_7d > 50 THEN 1 ELSE 0 END,
                alert_tvl_drop = CASE WHEN tvl_change_1d < -30 OR tvl_change_7d < -50 THEN 1 ELSE 0 END
                WHERE updated_at IS NOT NULL`,
            params: []
        }
    ];

    for (const { sql, params } of queries) {
        await new Promise((resolve) => {
            db.run(sql, params, (err) => {
                if (err) console.error('Change calculation error:', err.message);
                resolve();
            });
        });
    }
}

// Fetch all data for a chain
async function fetchChainData(db, chainName) {
    const chainId = await getChainId(db, chainName);
    if (!chainId) {
        console.log(`Skipping unknown chain: ${chainName}`);
        return 0;
    }
    
    console.log(`Fetching data for ${chainName} (chainId: ${chainId})...`);
    
    // Get markets with proper request variables
    const variables = { request: { chainIds: [chainId] } };
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERIES.markets, variables })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    if (data.errors) throw new Error(`GraphQL error: ${data.errors[0].message}`);
    
    const markets = data.data?.markets || [];
    console.log(`  Found ${markets.length} markets`);
    
    let processed = 0;
    for (const market of markets) {
        // Process reserves (correct field name)
        if (market.reserves) {
            for (const reserve of market.reserves) {
                try {
                    // Check if underlyingToken exists
                    if (!reserve.underlyingToken) {
                        console.log(`    Skipping reserve without underlyingToken`);
                        continue;
                    }
                    
                    const token = reserve.underlyingToken;
                    const apiMarketName = market.name || 'Core';
                    
                    // Map API market names to display names
                    const marketNameMap = {
                        'AaveV3Ethereum': 'Core',
                        'AaveV3EthereumLido': 'Prime',
                        'AaveV3EthereumEtherFi': 'EtherFi',
                        'AaveV3EthereumHorizon': 'Horizon'
                    };
                    const marketName = marketNameMap[apiMarketName] || apiMarketName;
                    const reserveId = `${chainName}_${marketName}_${token.address}`;
                    
                    const reserveData = {
                        id: reserveId,
                        underlyingAsset: token.address,
                        name: token.name,
                        symbol: token.symbol,
                        decimals: token.decimals || 18,
                        aToken: { id: reserveId },
                        isActive: !reserve.isPaused && !reserve.isFrozen,
                        isFrozen: reserve.isFrozen === true,
                        isPaused: reserve.isPaused === true,
                        borrowingEnabled: !reserve.isPaused,
                        market: marketName
                    };
                    
                    await storeReserve(db, reserveData, chainId);
                    
                    // Get data from nested objects (correct field names)
                    const totalLiquidity = Number(reserve.size?.amount?.raw) || 0;
                    const totalDebt = Number(reserve.borrowInfo?.total?.amount?.raw) || 0;
                    const supplyAPY = reserve.supplyInfo?.apy?.value || 0;
                    const borrowAPY = reserve.borrowInfo?.apy?.value || 0;
                    const availableLiquidity = Number(reserve.borrowInfo?.availableLiquidity?.amount?.raw) || 0;
                    const utilizationRate = reserve.borrowInfo?.utilizationRate?.value || 0;
                    
                    await storeSnapshot(db, reserveId, {
                        liquidityRate: supplyAPY,
                        variableBorrowRate: borrowAPY,
                        totalSupplied: String(totalLiquidity),
                        totalBorrowed: String(totalDebt),
                        availableLiquidity: String(availableLiquidity),
                        priceInUsd: reserve.size?.usd || null,
                        utilizationRate: utilizationRate
                    });
                    
                    processed++;
                    
                } catch (err) {
                    console.error(`  Error processing reserve:`, err.message);
                }
            }
        }
    }
    
    return processed;
}

// Main fetch function
async function main() {
    const args = process.argv.slice(2);
    const targetChain = args[0]; // Optional: specific chain only
    
    let db;
    try {
        db = await initDb();
        
        // Log start
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO sync_log (sync_type, started_at, status) VALUES ('daily_update', datetime('now'), 'running')`, 
                function(err) { if (err) reject(err); else resolve(this.lastID); });
        });
        
        // All chains supported by Aave API
        const chainsToProcess = targetChain ? [targetChain] : 
            ['ethereum', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base', 'gnosis', 'metis', 'scroll', 'linea', 'zksync', 'mantle', 'sonic', 'bsc', 'celo', 'plasma'];
        
        let totalReserves = 0;
        for (const chain of chainsToProcess) {
            const count = await fetchChainData(db, chain);
            totalReserves += count;
        }
        
        // Calculate changes
        console.log('Calculating rate changes...');
        await calculateChanges(db);
        
        // Log success
        await new Promise((resolve, reject) => {
            db.run(`UPDATE sync_log SET completed_at = datetime('now'), items_count = ?, status = 'success' 
                    WHERE id = (SELECT MAX(id) FROM sync_log WHERE sync_type = 'daily_update' AND status = 'running')`,
                [totalReserves], (err) => { if (err) reject(err); else resolve(); });
        });
        
        console.log(`\n✅ Fetch complete: ${totalReserves} reserves updated`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (db) {
            await new Promise((resolve) => {
                db.run(`UPDATE sync_log SET completed_at = datetime('now'), status = 'error', error_message = ? 
                        WHERE id = (SELECT MAX(id) FROM sync_log WHERE sync_type = 'daily_update' AND status = 'running')`,
                    [error.message], () => resolve());
            });
        }
        process.exit(1);
    } finally {
        if (db) db.close();
    }
}

// Run
if (require.main === module) {
    main();
}

module.exports = { initDb, fetchGraphQL, calculateChanges };
