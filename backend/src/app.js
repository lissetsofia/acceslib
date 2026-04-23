// src/app.js
require("dotenv").config();

const path = require("path");
const express = require("express");
const expressLayouts = require("express-ejs-layouts");

const apiRoutes = require("./routes");            // /api
const adminRoutes = require("./routes/admin.routes"); // /admin

const app = express();

app.use(express.json({ limit: "1mb" }));
// Bootstrap (desde node_modules)
app.use(
  "/vendor/bootstrap",
  express.static(path.join(__dirname, "..", "node_modules", "bootstrap", "dist"))
);

// Bootstrap Icons (css + fonts)
app.use(
  "/vendor/bootstrap-icons",
  express.static(path.join(__dirname, "..", "node_modules", "bootstrap-icons", "font"))
);
const adminApi = require("./routes/admin.api.routes");
app.use("/api/admin", adminApi);

// ✅ Estáticos (AdminLTE y tus assets)
app.use(express.static(path.join(__dirname, "..", "public")));

// ✅ EJS + Layout
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout"); // usa src/views/layout.ejs

// ✅ Rutas
app.use("/api", apiRoutes);
app.use("/admin", adminRoutes);

// Redirección cómoda
app.get("/", (req, res) => res.redirect("/admin/dashboard"));
//clientes api 

const clientApi = require("./routes/client.api.routes");
app.use("/api/client", clientApi);
//api pcs
const adminPcsApi = require("./routes/admin.pcs.api.routes");
app.use("/api/admin", adminPcsApi);
// sessions
const adminSessionsApi = require("./routes/admin.sessions.api.routes");
app.use("/api/admin", adminSessionsApi);
module.exports = { app };

const clientStatusRoutes = require("./routes/client.status.routes");
app.use("/api/client", clientStatusRoutes);