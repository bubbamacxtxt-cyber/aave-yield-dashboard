const express = require('express');
const path = require('path');
const { AaveDB } = require('./query');

const app = express();
const PORT = process.env.PORT || 3456;

// Serve static files
app.use(express.static(path.join(__dirname)));

// API endpoint for dashboard data
app.get('/api/data', async (req, res) => {
    const db = new AaveDB();
    try {
        const [topSupply, topBorrow, alerts, lastSync] = await Promise.all([
            db.getTopSupplyRates(null, 100000, 20),
            db.getTopBorrowRates(null, 10),
            db.getAlerts(),
            db.getLastSync()
        ]);
        
        // Get chain breakdown
        const chains = ['ethereum', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base'];
        const chainData = {};
        for (const chain of chains) {
            chainData[chain] = await db.getByChain(chain, 10);
        }
        
        res.json({
            topSupply,
            topBorrow,
            alerts,
            lastSync,
            chainData,
            totalReserves: topSupply.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

// API for specific chain
app.get('/api/chain/:chain', async (req, res) => {
    const db = new AaveDB();
    try {
        const data = await db.getByChain(req.params.chain, 50);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

// API for search
app.get('/api/search/:symbol', async (req, res) => {
    const db = new AaveDB();
    try {
        const data = await db.search(req.params.symbol);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

app.listen(PORT, () => {
    console.log(`Aave Dashboard Server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/dashboard-new.html to view`);
});
