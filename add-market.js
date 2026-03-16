const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('aave.db');

// Add market column
db.run(`ALTER TABLE reserves ADD COLUMN market TEXT`, (err) => {
  if (err) {
    console.log('Market column may already exist:', err.message);
  } else {
    console.log('✅ Added market column');
  }
  
  // For now, set all existing to 'Core' for Ethereum
  db.run(`UPDATE reserves SET market = 'Core' WHERE app = 'Aave'`, (err) => {
    if (err) console.error('Error setting default market:', err.message);
    else console.log('✅ Set default markets');
    db.close();
  });
});
