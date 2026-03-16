const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'aave.db');

const db = new sqlite3.Database(DB_PATH);

db.run(`ALTER TABLE reserves ADD COLUMN app TEXT DEFAULT 'Aave'`, (err) => {
    if (err) {
        console.log('Column may already exist:', err.message);
    } else {
        console.log('✅ Added app column to reserves table');
    }
    db.close();
});
