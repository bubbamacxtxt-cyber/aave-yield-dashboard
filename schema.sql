-- Aave Protocol Database Schema
-- Tracks reserves, rates, and historical changes across chains

-- Supported chains
CREATE TABLE IF NOT EXISTS chains (
    chain_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    network TEXT,
    is_active INTEGER DEFAULT 1
);

-- Aave reserves (lending pools)
CREATE TABLE IF NOT EXISTS reserves (
    id TEXT PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    underlying_asset TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimals INTEGER DEFAULT 18,
    a_token_address TEXT,
    stable_debt_token_address TEXT,
    variable_debt_token_address TEXT,
    is_active INTEGER DEFAULT 1,
    is_frozen INTEGER DEFAULT 0,
    is_paused INTEGER DEFAULT 0,
    borrowing_enabled INTEGER DEFAULT 1,
    stable_borrow_rate_enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chain_id) REFERENCES chains(chain_id)
);

-- Daily snapshots of reserve data
CREATE TABLE IF NOT EXISTS reserve_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reserve_id TEXT NOT NULL,
    date DATE NOT NULL,
    liquidity_rate REAL,
    stable_borrow_rate REAL,
    variable_borrow_rate REAL,
    liquidity_index REAL,
    available_liquidity TEXT,
    total_supplied TEXT,
    total_borrowed TEXT,
    utilization_rate REAL,
    price_in_eth TEXT,
    price_in_usd REAL,
    FOREIGN KEY (reserve_id) REFERENCES reserves(id),
    UNIQUE(reserve_id, date)
);

-- Computed changes for alerts
CREATE TABLE IF NOT EXISTS rate_changes (
    reserve_id TEXT PRIMARY KEY,
    supply_rate_change_1d REAL,
    supply_rate_change_7d REAL,
    supply_rate_change_30d REAL,
    borrow_rate_change_1d REAL,
    borrow_rate_change_7d REAL,
    borrow_rate_change_30d REAL,
    tvl_change_1d REAL,
    tvl_change_7d REAL,
    tvl_change_30d REAL,
    alert_supply_spike INTEGER DEFAULT 0,
    alert_borrow_spike INTEGER DEFAULT 0,
    alert_tvl_drop INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reserve_id) REFERENCES reserves(id)
);

-- Market summaries per chain
CREATE TABLE IF NOT EXISTS chain_summaries (
    chain_id INTEGER PRIMARY KEY,
    date DATE NOT NULL,
    total_supplied_usd REAL,
    total_borrowed_usd REAL,
    total_reserves INTEGER,
    avg_supply_rate REAL,
    avg_borrow_rate REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chain_id) REFERENCES chains(chain_id)
);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_type TEXT NOT NULL,
    chain_name TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    items_count INTEGER,
    status TEXT DEFAULT 'running',
    error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reserves_chain ON reserves(chain_id);
CREATE INDEX IF NOT EXISTS idx_reserves_symbol ON reserves(symbol);
CREATE INDEX IF NOT EXISTS idx_snapshots_reserve_date ON reserve_snapshots(reserve_id, date);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON reserve_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_changes_alert ON rate_changes(alert_supply_spike, alert_borrow_spike, alert_tvl_drop);

-- Insert known Aave chains
INSERT OR IGNORE INTO chains (chain_id, name, network) VALUES
    (1, 'ethereum', 'mainnet'),
    (137, 'polygon', 'mainnet'),
    (43114, 'avalanche', 'mainnet'),
    (42161, 'arbitrum', 'mainnet'),
    (10, 'optimism', 'mainnet'),
    (8453, 'base', 'mainnet'),
    (100, 'gnosis', 'mainnet'),
    (1088, 'metis', 'mainnet');
