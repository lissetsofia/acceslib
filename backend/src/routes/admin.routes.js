// src/routes/admin.routes.js
const router = require("express").Router();

router.get("/", (req, res) => res.redirect("/admin/dashboard"));

router.get("/dashboard", (req, res) => {
  res.render("dashboard", { title: "Dashboard", page: "dashboard" });
});

router.get("/pcs", (req, res) => {
  res.render("pcs", { title: "PCs", page: "pcs" });
});

router.get("/usuarios", (req, res) => {
  res.render("usuarios", { title: "Usuarios", page: "usuarios" });
});

router.get("/reportes", (req, res) => {
  res.render("reportes", { title: "Reportes", page: "reportes" });
});

router.get("/configuracion", (req, res) => {
  res.render("configuracion", { title: "Configuración", page: "configuracion" });
});

module.exports = router;