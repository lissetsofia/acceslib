CREATE DATABASE IF NOT EXISTS acceslib
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE acceslib;

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (nombre) VALUES
('Administrador'), ('Estudiante'), ('Docente');

-- Carreras
CREATE TABLE IF NOT EXISTS carreras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Usuarios (semestre opcional)
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  carrera_id INT NULL,
  semestre TINYINT NULL,                 -- 1..12 (opcional)
  rol_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_roles FOREIGN KEY (rol_id) REFERENCES roles(id),
  CONSTRAINT fk_usuarios_carreras FOREIGN KEY (carrera_id) REFERENCES carreras(id),
  CONSTRAINT chk_semestre CHECK (semestre IS NULL OR (semestre BETWEEN 1 AND 14))
) ENGINE=InnoDB;

-- PCs vinculadas
CREATE TABLE IF NOT EXISTS pcs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_visible VARCHAR(60) NULL,
  machine_id CHAR(36) NULL UNIQUE,
  hostname VARCHAR(100) NULL,
  ip_last VARCHAR(45) NULL,
  last_seen DATETIME NULL,
  estado_vinculo ENUM('PENDIENTE','VINCULADA') NOT NULL DEFAULT 'PENDIENTE',
  habilitada TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Solicitudes de vinculación
CREATE TABLE IF NOT EXISTS pair_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  pair_code VARCHAR(12) NOT NULL UNIQUE,
  machine_id CHAR(36) NOT NULL,
  hostname VARCHAR(100) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  solicitado_en DATETIME NOT NULL,
  expira_en DATETIME NOT NULL,
  estado ENUM('PENDIENTE','APROBADA','RECHAZADA','EXPIRADA') NOT NULL DEFAULT 'PENDIENTE',
  aprobado_en DATETIME NULL,
  pc_id INT NULL,
  INDEX idx_pair_estado (estado),
  INDEX idx_pair_expira (expira_en),
  CONSTRAINT fk_pair_pc FOREIGN KEY (pc_id) REFERENCES pcs(id)
) ENGINE=InnoDB;

-- Sesiones
CREATE TABLE IF NOT EXISTS sesiones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  pc_id INT NOT NULL,
  inicio DATETIME NOT NULL,
  fin DATETIME NULL,
  segundos_total INT NOT NULL DEFAULT 0,
  estado ENUM('ACTIVA','FINALIZADA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  motivo_cierre VARCHAR(80) NULL,
  ultimo_heartbeat DATETIME NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sesiones_inicio (inicio),
  INDEX idx_sesiones_estado (estado),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_sesiones_pc FOREIGN KEY (pc_id) REFERENCES pcs(id)
) ENGINE=InnoDB;