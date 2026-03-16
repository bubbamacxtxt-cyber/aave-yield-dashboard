const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'aave.db');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  return new Promise((resolve) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Database error: ' + err.message })
        });
        return;
      }

      // Get top supply rates
      db.all(`
        SELECT r.symbol, c.name as chain, s.liquidity_rate as supply_rate,
               s.price_in_usd as tvl_usd, ch.supply_rate_change_1d, ch.supply_rate_change_7d
        FROM reserves r
        JOIN chains c ON r.chain_id = c.chain_id
        JOIN reserve_snapshots s ON r.id = s.reserve_id
        LEFT JOIN rate_changes ch ON r.id = ch.reserve_id
        WHERE s.date = date('now') AND r.is_active = 1
        ORDER BY s.liquidity_rate DESC
        LIMIT 50
      `, [], (err, topSupply) => {
        if (err) {
          db.close();
          resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
          });
          return;
        }

        // Get top borrow rates
        db.all(`
          SELECT r.symbol, c.name as chain, s.variable_borrow_rate as borrow_rate
          FROM reserves r
          JOIN chains c ON r.chain_id = c.chain_id
          JOIN reserve_snapshots s ON r.id = s.reserve_id
          WHERE s.date = date('now') AND r.is_active = 1 AND r.borrowing_enabled = 1
          ORDER BY s.variable_borrow_rate ASC
          LIMIT 20
        `, [], (err, topBorrow) => {
          if (err) {
            db.close();
            resolve({
              statusCode: 500,
              headers,
              body: JSON.stringify({ error: err.message })
            });
            return;
          }

          // Get last sync
          db.get(`
            SELECT * FROM sync_log WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1
          `, [], (err, lastSync) => {
            db.close();
            
            if (err) {
              resolve({
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: err.message })
              });
              return;
            }

            resolve({
              statusCode: 200,
              headers,
              body: JSON.stringify({
                topSupply: topSupply || [],
                topBorrow: topBorrow || [],
                lastSync,
                source: 'sqlite'
              })
            });
          });
        });
      });
    });
  });
};
