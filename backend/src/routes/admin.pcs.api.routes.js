// src/routes/admin.pcs.api.routes.js
const router = require("express").Router();
const { pool } = require("../db/pool");

// umbral para ONLINE/OFFLINE (segundos)
const ONLINE_SEC = Number(process.env.ONLINE_THRESHOLD_SEC || 60);

// 1) LISTAR PENDIENTES
router.get("/pcs/pending", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        pr.id,
        pr.pair_code,
        pr.machine_id,
        pr.hostname,
        pr.ip,
        pr.solicitado_en,
        pr.expira_en,
        pr.estado
      FROM pair_requests pr
      WHERE pr.estado = 'PENDIENTE' AND pr.expira_en > NOW()
      ORDER BY pr.id DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// 2) APROBAR (VINCULAR) UNA PC POR pair_code
router.post("/pcs/approve", async (req, res, next) => {
  const { pair_code, nombre_visible, habilitada } = req.body;

  if (!pair_code || !nombre_visible) {
    return res.status(400).json({ error: "pair_code y nombre_visible son obligatorios." });
  }

  const hab = String(habilitada) === "0" ? 0 : 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Buscar request pendiente y vigente
    const [reqRows] = await conn.query(
      `SELECT id, pair_code, machine_id, hostname, ip, expira_en, estado, pc_id
       FROM pair_requests
       WHERE pair_code = ? AND estado = 'PENDIENTE' AND expira_en > NOW()
       LIMIT 1
       FOR UPDATE`,
      [pair_code]
    );

    if (reqRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "No existe solicitud pendiente (o ya expiró)." });
    }

    const pr = reqRows[0];

    // Determinar pc_id (si vino null, buscar/crear por machine_id)
    let pcId = pr.pc_id;

    if (!pcId) {
      const [pcRows] = await conn.query(
        "SELECT id FROM pcs WHERE machine_id = ? LIMIT 1 FOR UPDATE",
        [pr.machine_id]
      );

      if (pcRows.length === 0) {
        const [ins] = await conn.query(
          `INSERT INTO pcs (machine_id, hostname, ip_last, estado_vinculo, habilitada)
           VALUES (?, ?, ?, 'PENDIENTE', 1)`,
          [pr.machine_id, pr.hostname, pr.ip]
        );
        pcId = ins.insertId;
      } else {
        pcId = pcRows[0].id;
      }
    }

    // Actualizar PC -> VINCULADA
    await conn.query(
      `UPDATE pcs
       SET nombre_visible = ?,
           hostname = ?,
           ip_last = ?,
           habilitada = ?,
           estado_vinculo = 'VINCULADA',
           last_seen = NOW()
       WHERE id = ?`,
      [nombre_visible, pr.hostname, pr.ip, hab, pcId]
    );

    // Marcar request como APROBADA
    await conn.query(
      `UPDATE pair_requests
       SET estado = 'APROBADA',
           aprobado_en = NOW(),
           pc_id = ?
       WHERE id = ?`,
      [pcId, pr.id]
    );

    await conn.commit();
    res.json({ ok: true, pc_id: pcId });
  } catch (e) {
    if (conn) await conn.rollback();
    next(e);
  } finally {
    if (conn) conn.release();
  }
});

// 3) LISTAR PCS VINCULADAS (con ONLINE/OFFLINE y usuario actual si hay sesión)
router.get("/pcs", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.nombre_visible,
        p.hostname,
        p.ip_last,
        p.last_seen,
        p.habilitada,
        CASE
          WHEN p.last_seen IS NOT NULL
           AND TIMESTAMPDIFF(SECOND, p.last_seen, NOW()) <= ?
          THEN 'ONLINE'
          ELSE 'OFFLINE'
        END AS estado_pc,
        u.codigo AS usuario_codigo,
        u.nombre AS usuario_nombre,
        s.inicio AS sesion_inicio,
        s.segundos_total
      FROM pcs p
      LEFT JOIN sesiones s
        ON s.pc_id = p.id AND s.estado = 'ACTIVA'
      LEFT JOIN usuarios u
        ON u.id = s.usuario_id
      WHERE p.estado_vinculo = 'VINCULADA'
      ORDER BY estado_pc DESC, p.nombre_visible ASC
      LIMIT 500
      `,
      [ONLINE_SEC]
    );

    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;