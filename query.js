#!/usr/bin/env node
/**
 * Aave Database Query Interface
 * For subagents and Discord bot integration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'aave.db');

class AaveDB {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    }
    
    close() {
        this.db.close();
    }
    
    // Get top supply rates
    getTopSupplyRates(chain = null, minTvl = 100000, limit = 10) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT r.symbol, r.underlying_asset, c.name as chain,
                       s.liquidity_rate as supply_rate, s.price_in_usd,
                       CAST(s.total_supplied AS REAL) * COALESCE(s.price_in_usd, 0) / 1e18 as tvl_usd,
                       ch.supply_rate_change_1d, ch.supply_rate_change_7d
                FROM reserves r
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id
                LEFT JOIN rate_changes ch ON r.id = ch.reserve_id
                WHERE s.date = date('now')
                  AND r.is_active = 1
                  ${chain ? 'AND c.name = ?' : ''}
                  AND CAST(s.total_supplied AS REAL) * COALESCE(s.price_in_usd, 0) / 1e18 >= ?
                ORDER BY s.liquidity_rate DESC
                LIMIT ?
            `;
            const params = chain ? [chain, minTvl, limit] : [minTvl, limit];
            
            this.db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    
    // Get top borrow rates
    getTopBorrowRates(chain = null, limit = 10) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT r.symbol, c.name as chain,
                       s.variable_borrow_rate as borrow_rate,
                       CAST(s.total_borrowed AS REAL) * s.price_in_usd / 1e18 as borrowed_usd,
                       ch.borrow_rate_change_1d
                FROM reserves r
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id
                LEFT JOIN rate_changes ch ON r.id = ch.reserve_id
                WHERE s.date = date('now')
                  AND r.is_active = 1
                  AND r.borrowing_enabled = 1
                  ${chain ? 'AND c.name = ?' : ''}
                ORDER BY s.variable_borrow_rate ASC
                LIMIT ?
            `;
            const params = chain ? [chain, limit] : [limit];
            
            this.db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    
    // Get alerts
    getAlerts() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT r.symbol, c.name as chain,
                       s.liquidity_rate, s.variable_borrow_rate,
                       ch.supply_rate_change_1d, ch.borrow_rate_change_1d,
                       ch.tvl_change_1d,
                       CASE 
                           WHEN ch.alert_supply_spike = 1 THEN 'SUPPLY_SPIKE'
                           WHEN ch.alert_borrow_spike = 1 THEN 'BORROW_SPIKE'
                           WHEN ch.alert_tvl_drop = 1 THEN 'TVL_DROP'
                       END as alert_type
                FROM rate_changes ch
                JOIN reserves r ON ch.reserve_id = r.id
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id AND s.date = date('now')
                WHERE ch.alert_supply_spike = 1 OR ch.alert_borrow_spike = 1 OR ch.alert_tvl_drop = 1
                ORDER BY ABS(ch.supply_rate_change_1d) DESC, ABS(ch.borrow_rate_change_1d) DESC
            `, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    
    // Get by chain
    getByChain(chainName, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT r.symbol, s.liquidity_rate, s.variable_borrow_rate,
                       CAST(s.total_supplied AS REAL) * s.price_in_usd / 1e18 as tvl_usd,
                       s.utilization_rate
                FROM reserves r
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id
                WHERE c.name = ? AND s.date = date('now') AND r.is_active = 1
                ORDER BY tvl_usd DESC
                LIMIT ?
            `, [chainName, limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    
    // Get historical data for a reserve
    getReserveHistory(symbol, chain, days = 30) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT s.date, s.liquidity_rate, s.variable_borrow_rate,
                       CAST(s.total_supplied AS REAL) * s.price_in_usd / 1e18 as tvl_usd
                FROM reserves r
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id
                WHERE r.symbol = ? AND c.name = ? AND s.date >= date('now', '-${days} days')
                ORDER BY s.date ASC
            `, [symbol, chain], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
    
    // Get chain summary
    getChainSummary(chainName) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    c.name,
                    COUNT(DISTINCT r.id) as total_reserves,
                    SUM(CAST(s.total_supplied AS REAL) * s.price_in_usd / 1e18) as total_supplied_usd,
                    SUM(CAST(s.total_borrowed AS REAL) * s.price_in_usd / 1e18) as total_borrowed_usd,
                    AVG(s.liquidity_rate) as avg_supply_rate,
                    AVG(s.variable_borrow_rate) as avg_borrow_rate
                FROM chains c
                LEFT JOIN reserves r ON c.chain_id = r.chain_id AND r.is_active = 1
                LEFT JOIN reserve_snapshots s ON r.id = s.reserve_id AND s.date = date('now')
                WHERE c.name = ?
                GROUP BY c.chain_id
            `, [chainName], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }
    
    // Get last sync info
    getLastSync() {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM sync_log 
                WHERE status = 'success' 
                ORDER BY completed_at DESC LIMIT 1
            `, [], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    }
    
    // Search by symbol
    search(symbol) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT r.symbol, c.name as chain, s.liquidity_rate, s.variable_borrow_rate
                FROM reserves r
                JOIN chains c ON r.chain_id = c.chain_id
                JOIN reserve_snapshots s ON r.id = s.reserve_id
                WHERE r.symbol LIKE ? AND s.date = date('now') AND r.is_active = 1
                ORDER BY s.liquidity_rate DESC
            `, [`%${symbol.toUpperCase()}%`], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const db = new AaveDB();
    
    switch (command) {
        case 'top-supply':
            db.getTopSupplyRates(args[1], 100000, 10).then(rows => {
                console.log('Top 10 Supply Rates:');
                rows.forEach((r, i) => {
                    const rate = (r.supply_rate * 100).toFixed(2);
                    const change = r.supply_rate_change_1d ? `(${r.supply_rate_change_1d > 0 ? '+' : ''}${r.supply_rate_change_1d.toFixed(2)}%)` : '';
                    console.log(`${i+1}. ${r.symbol} on ${r.chain}: ${rate}% APY ${change}`);
                });
            }).finally(() => db.close());
            break;
            
        case 'top-borrow':
            db.getTopBorrowRates(args[1], 10).then(rows => {
                console.log('Lowest Borrow Rates:');
                rows.forEach((r, i) => {
                    const rate = (r.borrow_rate * 100).toFixed(2);
                    console.log(`${i+1}. ${r.symbol} on ${r.chain}: ${rate}%`);
                });
            }).finally(() => db.close());
            break;
            
        case 'alerts':
            db.getAlerts().then(rows => {
                console.log(`Found ${rows.length} alerts:`);
                rows.forEach(r => {
                    console.log(`[${r.alert_type}] ${r.symbol} on ${r.chain}`);
                });
            }).finally(() => db.close());
            break;
            
        case 'chain':
            db.getByChain(args[1] || 'ethereum', 20).then(rows => {
                console.log(`Top reserves on ${args[1] || 'ethereum'}:`);
                rows.forEach((r, i) => {
                    const supply = (r.liquidity_rate * 100).toFixed(2);
                    const tvl = (r.tvl_usd / 1e6).toFixed(2);
                    console.log(`${i+1}. ${r.symbol}: ${supply}% supply, $${tvl}M TVL`);
                });
            }).finally(() => db.close());
            break;
            
        case 'search':
            db.search(args[1] || 'USDC').then(rows => {
                console.log(`Search results for "${args[1] || 'USDC'}":`);
                rows.forEach(r => {
                    console.log(`${r.symbol} on ${r.chain}: Supply ${(r.liquidity_rate * 100).toFixed(2)}%, Borrow ${(r.variable_borrow_rate * 100).toFixed(2)}%`);
                });
            }).finally(() => db.close());
            break;
            
        case 'stats':
            db.getLastSync().then(sync => {
                console.log('Last sync:', sync?.completed_at || 'Never');
                console.log('Reserves synced:', sync?.items_count || 0);
            }).finally(() => db.close());
            break;
            
        default:
            console.log('Aave DB Query Tool');
            console.log('');
            console.log('Commands:');
            console.log('  top-supply [chain]    - Top supply rates');
            console.log('  top-borrow [chain]    - Lowest borrow rates');
            console.log('  alerts                - Show rate/TVL alerts');
            console.log('  chain <name>          - Reserves by chain');
            console.log('  search <symbol>       - Search by symbol');
            console.log('  stats                 - Sync status');
            console.log('');
            db.close();
    }
}

module.exports = { AaveDB };
