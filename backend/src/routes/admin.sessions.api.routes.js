// src/routes/admin.sessions.api.routes.js
const router = require("express").Router();
const { pool } = require("../db/pool");

// Sesiones activas (para Dashboard)
router.get("/sessions/active", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        s.id AS session_id,
        s.inicio,
        TIMESTAMPDIFF(SECOND, s.inicio, NOW()) AS duracion_seg,
        p.nombre_visible AS pc,
        u.codigo AS usuario_codigo,
        u.nombre AS usuario_nombre
      FROM sesiones s
      JOIN pcs p ON p.id = s.pc_id
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = 'ACTIVA'
      ORDER BY s.inicio DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// Historial (para Reportes)
router.get("/sessions/history", async (req, res, next) => {
  try {
    const { from, to } = req.query;

    // Si no mandan filtros, muestra últimas 200
    if (!from && !to) {
      const [rows] = await pool.query(`
        SELECT
          s.id AS session_id,
          s.inicio, s.fin, s.segundos_total, s.motivo_cierre,
          p.nombre_visible AS pc,
          u.codigo AS usuario_codigo,
          u.nombre AS usuario_nombre
        FROM sesiones s
        JOIN pcs p ON p.id = s.pc_id
        JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.estado = 'FINALIZADA'
        ORDER BY s.fin DESC
        LIMIT 200
      `);
      return res.json(rows);
    }

    const fromDate = from ? `${from} 00:00:00` : "1970-01-01 00:00:00";
    const toDate = to ? `${to} 23:59:59` : "2999-12-31 23:59:59";

    const [rows] = await pool.query(
      `
      SELECT
        s.id AS session_id,
        s.inicio, s.fin, s.segundos_total, s.motivo_cierre,
        p.nombre_visible AS pc,
        u.codigo AS usuario_codigo,
        u.nombre AS usuario_nombre
      FROM sesiones s
      JOIN pcs p ON p.id = s.pc_id
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.estado = 'FINALIZADA'
        AND s.inicio BETWEEN ? AND ?
      ORDER BY s.inicio DESC
      LIMIT 500
      `,
      [fromDate, toDate]
    );

    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;