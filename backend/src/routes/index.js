const router = require("express").Router();
const { pool } = require("../db/pool");

router.get("/health", async (req, res) => {
  const [rows] = await pool.query("SELECT 1 AS ok");
  res.json({ status: "ok", db: rows[0].ok });
});
// src/routes/index.js
module.exports = require("./index");
module.exports = router;