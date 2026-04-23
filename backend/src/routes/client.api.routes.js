// src/routes/client.api.routes.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db/pool");

// ===== Pair code (ya lo tenías) =====
function genPairCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// POST /api/client/pair/request
router.post("/pair/request", async (req, res, next) => {
  try {
    const { machine_id, hostname, ip } = req.body;
    if (!machine_id || !hostname || !ip) {
      return res.status(400).json({ error: "Faltan campos: machine_id, hostname, ip." });
    }

    const [pcRows] = await pool.query(
      "SELECT id, estado_vinculo FROM pcs WHERE machine_id = ? LIMIT 1",
      [machine_id]
    );

    let pcId;
    if (pcRows.length === 0) {
      const [ins] = await pool.query(
        `INSERT INTO pcs (machine_id, hostname, ip_last, estado_vinculo, habilitada)
         VALUES (?, ?, ?, 'PENDIENTE', 1)`,
        [machine_id, hostname, ip]
      );
      pcId = ins.insertId;
    } else {
      pcId = pcRows[0].id;
      await pool.query(`UPDATE pcs SET hostname=?, ip_last=? WHERE id=?`, [hostname, ip, pcId]);

      if (pcRows[0].estado_vinculo === "VINCULADA") {
        return res.status(409).json({ error: "Esta PC ya está vinculada." });
      }
    }

    const [pending] = await pool.query(
      `SELECT pair_code, expira_en
       FROM pair_requests
       WHERE machine_id=? AND estado='PENDIENTE' AND expira_en > NOW()
       ORDER BY id DESC LIMIT 1`,
      [machine_id]
    );

    if (pending.length > 0) {
      return res.json({ pair_code: pending[0].pair_code, expira_en: pending[0].expira_en, reused: true });
    }

    const ttlMinutes = Number(process.env.PAIR_CODE_TTL_MIN || 10);

    let pairCode = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      pairCode = genPairCode(6);
      try {
        await pool.query(
          `INSERT INTO pair_requests (pair_code, machine_id, hostname, ip, solicitado_en, expira_en, estado, pc_id)
           VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), 'PENDIENTE', ?)`,
          [pairCode, machine_id, hostname, ip, ttlMinutes, pcId]
        );
        break;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") continue;
        throw err;
      }
    }

    const [row] = await pool.query(
      "SELECT pair_code, expira_en FROM pair_requests WHERE pair_code=? LIMIT 1",
      [pairCode]
    );

    res.json({ pair_code: row[0].pair_code, expira_en: row[0].expira_en, reused: false });
  } catch (e) {
    next(e);
  }
});

// ====== LOGIN ======
/**
 * POST /api/client/login
 * body: { machine_id, codigo, password, hostname?, ip? }
 */
router.post("/login", async (req, res, next) => {
  try {
    const { machine_id, codigo, password, hostname, ip } = req.body;

    if (!machine_id || !codigo || !password) {
      return res.status(400).json({ error: "machine_id, codigo y password son obligatorios." });
    }

    // 1) validar PC vinculada y habilitada
    const [pcRows] = await pool.query(
      `SELECT id, nombre_visible, habilitada, estado_vinculo
       FROM pcs WHERE machine_id=? LIMIT 1`,
      [machine_id]
    );

    if (pcRows.length === 0) {
      return res.status(403).json({ error: "PC no registrada. Vincula primero." });
    }

    const pc = pcRows[0];
    if (pc.estado_vinculo !== "VINCULADA") {
      return res.status(403).json({ error: "PC no vinculada. Espera aprobación." });
    }
    if (pc.habilitada !== 1) {
      return res.status(403).json({ error: "PC deshabilitada por el administrador." });
    }

    // 2) validar usuario
    const [uRows] = await pool.query(
      `SELECT id, codigo, nombre, password_hash, activo, rol_id, carrera_id, semestre
       FROM usuarios WHERE codigo=? LIMIT 1`,
      [codigo]
    );

    if (uRows.length === 0) return res.status(401).json({ error: "Credenciales incorrectas." });

    const u = uRows[0];
    if (u.activo !== 1) return res.status(403).json({ error: "Usuario inactivo." });

    const ok = await bcrypt.compare(String(password), String(u.password_hash));
    if (!ok) return res.status(401).json({ error: "Credenciales incorrectas." });

    // 3) crear sesión ACTIVA
    const [ins] = await pool.query(
      `INSERT INTO sesiones (usuario_id, pc_id, inicio, estado, ultimo_heartbeat)
       VALUES (?, ?, NOW(), 'ACTIVA', NOW())`,
      [u.id, pc.id]
    );

    // 4) actualizar last_seen
    await pool.query(
      `UPDATE pcs SET last_seen=NOW(), hostname=COALESCE(?, hostname), ip_last=COALESCE(?, ip_last)
       WHERE id=?`,
      [hostname || null, ip || null, pc.id]
    );

    res.json({
      ok: true,
      session_id: ins.insertId,
      pc: { id: pc.id, nombre_visible: pc.nombre_visible },
      usuario: { id: u.id, codigo: u.codigo, nombre: u.nombre, carrera_id: u.carrera_id, semestre: u.semestre, rol_id: u.rol_id }
    });
  } catch (e) {
    next(e);
  }
});

// ====== LOGOUT ======
/**
 * POST /api/client/logout
 * body: { machine_id, session_id, reason?, elapsed_seconds? }
 */
router.post("/logout", async (req, res, next) => {
  try {
    const { machine_id, session_id, reason, elapsed_seconds } = req.body;
    if (!machine_id || !session_id) {
      return res.status(400).json({ error: "machine_id y session_id son obligatorios." });
    }

    // validar pc
    const [pcRows] = await pool.query(`SELECT id FROM pcs WHERE machine_id=? LIMIT 1`, [machine_id]);
    if (pcRows.length === 0) return res.status(403).json({ error: "PC no registrada." });
    const pcId = pcRows[0].id;

    // calcular segundos si no vino
    let secs = null;
    if (elapsed_seconds !== undefined && elapsed_seconds !== null && elapsed_seconds !== "") {
      secs = Number(elapsed_seconds);
      if (!Number.isFinite(secs) || secs < 0) secs = null;
    }

    if (secs === null) {
      const [sRows] = await pool.query(
        `SELECT inicio FROM sesiones WHERE id=? AND pc_id=? LIMIT 1`,
        [session_id, pcId]
      );
      if (sRows.length === 0) return res.status(404).json({ error: "Sesión no encontrada." });
      const inicio = new Date(sRows[0].inicio);
      secs = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 1000));
    }

    // cerrar sesión
    const [upd] = await pool.query(
      `UPDATE sesiones
       SET fin=NOW(), estado='FINALIZADA',
           motivo_cierre=?, segundos_total=?, ultimo_heartbeat=NOW()
       WHERE id=? AND pc_id=? AND estado='ACTIVA'`,
      [reason || "logout", secs, session_id, pcId]
    );

    // aunque ya estuviera cerrada, igual devolvemos ok
    await pool.query(`UPDATE pcs SET last_seen=NOW() WHERE id=?`, [pcId]);

    res.json({ ok: true, closed: upd.affectedRows === 1, segundos_total: secs });
  } catch (e) {
    next(e);
  }
});

// POST /api/client/heartbeat
// body: { machine_id, session_id, elapsed_seconds }
router.post("/heartbeat", async (req, res, next) => {
  try {
    const { machine_id, session_id, elapsed_seconds, hostname, ip } = req.body;

    if (!machine_id || !session_id) {
      return res.status(400).json({ error: "machine_id y session_id son obligatorios." });
    }

    // buscar pc
    const [pcRows] = await pool.query(
      "SELECT id FROM pcs WHERE machine_id=? LIMIT 1",
      [machine_id]
    );
    if (pcRows.length === 0) return res.status(403).json({ error: "PC no registrada." });
    const pcId = pcRows[0].id;

    let secs = null;
    if (elapsed_seconds !== undefined && elapsed_seconds !== null && elapsed_seconds !== "") {
      secs = Number(elapsed_seconds);
      if (!Number.isFinite(secs) || secs < 0) secs = null;
    }

    // actualizar sesión (si aún está activa)
    if (secs !== null) {
      await pool.query(
        `UPDATE sesiones
         SET segundos_total = ?, ultimo_heartbeat = NOW()
         WHERE id=? AND pc_id=? AND estado='ACTIVA'`,
        [secs, session_id, pcId]
      );
    } else {
      await pool.query(
        `UPDATE sesiones
         SET ultimo_heartbeat = NOW()
         WHERE id=? AND pc_id=? AND estado='ACTIVA'`,
        [session_id, pcId]
      );
    }

    // actualizar last_seen de PC
    await pool.query(
      `UPDATE pcs
       SET last_seen=NOW(),
           hostname=COALESCE(?, hostname),
           ip_last=COALESCE(?, ip_last)
       WHERE id=?`,
      [hostname || null, ip || null, pcId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
module.exports = router;