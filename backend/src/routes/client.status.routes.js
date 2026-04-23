// src/routes/client.status.routes.js
const router = require("express").Router();
const { pool } = require("../db/pool");

// GET /api/client/status?machine_id=...
router.get("/status", async (req, res, next) => {
  try {
    const { machine_id } = req.query;
    if (!machine_id) {
      return res.status(400).json({ error: "machine_id es obligatorio." });
    }

    const [rows] = await pool.query(
      `SELECT id, estado_vinculo, habilitada, nombre_visible
       FROM pcs
       WHERE machine_id = ?
       LIMIT 1`,
      [machine_id]
    );

    if (rows.length === 0) {
      return res.json({ status: "NO_REGISTRADA" });
    }

    const pc = rows[0];
    if (pc.estado_vinculo === "VINCULADA") {
      return res.json({
        status: "VINCULADA",
        habilitada: pc.habilitada === 1,
        nombre_visible: pc.nombre_visible || null,
      });
    }

    return res.json({ status: "PENDIENTE" });
  } catch (e) {
    next(e);
  }
});

module.exports = router;