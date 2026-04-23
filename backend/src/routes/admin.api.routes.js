// src/routes/admin.api.routes.js
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db/pool");

// LISTAR USUARIOS
router.get("/users", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.codigo, u.nombre, u.semestre, u.activo,
             r.nombre AS rol,
             c.nombre AS carrera
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      LEFT JOIN carreras c ON c.id = u.carrera_id
      ORDER BY u.id DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// CREAR USUARIO
router.post("/users", async (req, res, next) => {
  try {
    const { codigo, nombre, rol_id, carrera_id, semestre, password } = req.body;

    if (!codigo || !nombre || !rol_id || !password) {
      return res.status(400).json({ error: "Faltan campos: codigo, nombre, rol_id y password son obligatorios." });
    }

    // validar rol
    const [rolRows] = await pool.query("SELECT id FROM roles WHERE id = ?", [rol_id]);
    if (rolRows.length === 0) {
      return res.status(400).json({ error: "rol_id no existe." });
    }

    // validar carrera (si viene)
    if (carrera_id) {
      const [carRows] = await pool.query("SELECT id FROM carreras WHERE id = ?", [carrera_id]);
      if (carRows.length === 0) {
        return res.status(400).json({ error: "carrera_id no existe." });
      }
    }

    // validar duplicado
    const [dup] = await pool.query("SELECT id FROM usuarios WHERE codigo = ? LIMIT 1", [codigo]);
    if (dup.length > 0) {
      return res.status(409).json({ error: "Ya existe un usuario con ese código." });
    }

    // validar semestre (opcional)
    if (semestre !== undefined && semestre !== null && semestre !== "") {
      const s = Number(semestre);
      if (!Number.isInteger(s) || s < 1 || s > 14) {
        return res.status(400).json({ error: "Semestre inválido (1 a 14)." });
      }
    }

    const password_hash = await bcrypt.hash(String(password), 10);

    const [result] = await pool.query(
      `INSERT INTO usuarios (codigo, nombre, rol_id, carrera_id, semestre, password_hash, activo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [codigo, nombre, rol_id, carrera_id || null, semestre || null, password_hash]
    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) { next(e); }
});

module.exports = router;