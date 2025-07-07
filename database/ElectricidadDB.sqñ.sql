-- =============================================
-- Sistema de Gestión de Recibos Eléctricos
-- Script de Creación de Base de Datos
-- Autor: Desarrollador Senior
-- Fecha: 2025
-- =============================================

-- Verificar si la base de datos existe y eliminarla si es necesario
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'ElectricidadDB')
BEGIN
    ALTER DATABASE ElectricidadDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE ElectricidadDB;
    PRINT 'Base de datos ElectricidadDB eliminada exitosamente';
END

-- Crear la base de datos
CREATE DATABASE ElectricidadDB;
PRINT 'Base de datos ElectricidadDB creada exitosamente';

-- Usar la base de datos
USE ElectricidadDB;

-- =============================================
-- Crear tabla Cuentas
-- =============================================
CREATE TABLE Cuentas (
    numeroCuenta NVARCHAR(20) NOT NULL,
    saldo DECIMAL(10,2) NOT NULL CHECK (saldo >= 0),
    fechaCreacion DATETIME DEFAULT GETDATE(),
    estado NVARCHAR(10) DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva', 'suspendida')),
    nombreTitular NVARCHAR(100) NOT NULL,
    direccion NVARCHAR(200),
    telefono NVARCHAR(15),
    email NVARCHAR(100),
    
    CONSTRAINT PK_Cuentas PRIMARY KEY (numeroCuenta),
    CONSTRAINT CHK_NumeroCuenta CHECK (LEN(numeroCuenta) >= 5),
    CONSTRAINT CHK_Email CHECK (email LIKE '%@%.%')
);

-- =============================================
-- Crear tabla Recibos
-- =============================================
CREATE TABLE Recibos (
    idRecibo INT IDENTITY(1,1) NOT NULL,
    numeroCuenta NVARCHAR(20) NOT NULL,
    monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
    fecha DATETIME DEFAULT GETDATE(),
    fechaVencimiento DATETIME NOT NULL,
    estado NVARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'vencido', 'cancelado')),
    conceptoPago NVARCHAR(200) DEFAULT 'Consumo Eléctrico Mensual',
    periodoFacturacion NVARCHAR(20),
    lecturaAnterior DECIMAL(10,2) DEFAULT 0,
    lecturaActual DECIMAL(10,2) DEFAULT 0,
    consumoKwh DECIMAL(10,2) DEFAULT 0,
    tarifaKwh DECIMAL(6,4) DEFAULT 0.15,
    fechaPago DATETIME NULL,
    metodoPago NVARCHAR(50) NULL,
    numeroTransaccion NVARCHAR(100) NULL,
    
    CONSTRAINT PK_Recibos PRIMARY KEY (idRecibo),
    CONSTRAINT FK_Recibos_Cuentas FOREIGN KEY (numeroCuenta) 
        REFERENCES Cuentas(numeroCuenta) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT CHK_Fechas CHECK (fechaVencimiento > fecha),
    CONSTRAINT CHK_Lecturas CHECK (lecturaActual >= lecturaAnterior)
);

-- =============================================
-- Crear tabla Transacciones (para auditoría)
-- =============================================
CREATE TABLE Transacciones (
    idTransaccion INT IDENTITY(1,1) NOT NULL,
    numeroCuenta NVARCHAR(20) NOT NULL,
    idRecibo INT NULL,
    tipoTransaccion NVARCHAR(50) NOT NULL CHECK (tipoTransaccion IN ('pago_recibo', 'recarga_saldo', 'ajuste_saldo')),
    montoAnterior DECIMAL(10,2) NOT NULL,
    montoTransaccion DECIMAL(10,2) NOT NULL,
    montoNuevo DECIMAL(10,2) NOT NULL,
    fechaTransaccion DATETIME DEFAULT GETDATE(),
    descripcion NVARCHAR(200),
    estadoTransaccion NVARCHAR(20) DEFAULT 'completada' CHECK (estadoTransaccion IN ('pendiente', 'completada', 'fallida', 'cancelada')),
); 
    CONSTRAINT PK_Transacciones PRIMARY KEY (idTransaccion),
    CONSTRAINT FK_Transacciones_Cuentas FOREIGN KEY (numeroCuenta) 
        REFERENCES Cuentas(numeroCuenta) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FK_Transacciones_Recibos FOREIGN KEY (idRecibo) 
        REFERENCES Recibos(idRecibo) ON DELETE SET NULL ON UPDATE CASCADE


-- =============================================
-- Crear índices para mejorar performance
-- =============================================

-- Índice para búsquedas por estado de recibo
CREATE NONCLUSTERED INDEX IX_Recibos_Estado 
ON Recibos (estado) INCLUDE (numeroCuenta, monto, fechaVencimiento);

-- Índice para búsquedas por fecha
CREATE NONCLUSTERED INDEX IX_Recibos_Fecha 
ON Recibos (fecha DESC) INCLUDE (numeroCuenta, estado, monto);

-- Índice para búsquedas por número de cuenta
CREATE NONCLUSTERED INDEX IX_Recibos_NumeroCuenta 
ON Recibos (numeroCuenta) INCLUDE (estado, monto, fechaVencimiento);

-- Índice para transacciones por fecha
CREATE NONCLUSTERED INDEX IX_Transacciones_Fecha 
ON Transacciones (fechaTransaccion DESC) INCLUDE (numeroCuenta, tipoTransaccion, montoTransaccion);

-- =============================================
-- Crear triggers para automatización
-- =============================================

-- Trigger para calcular consumo automáticamente
CREATE TRIGGER TR_Recibos_CalcularConsumo
ON Recibos
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    UPDATE r
    SET consumoKwh = r.lecturaActual - r.lecturaAnterior,
        monto = (r.lecturaActual - r.lecturaAnterior) * r.tarifaKwh
    FROM Recibos r
    INNER JOIN inserted i ON r.idRecibo = i.idRecibo
    WHERE r.lecturaActual > 0 AND r.lecturaAnterior >= 0;
END;

-- Trigger para registrar transacciones automáticamente
CREATE TRIGGER TR_Cuentas_RegistrarTransaccion
ON Cuentas
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    IF UPDATE(saldo)
    BEGIN
        INSERT INTO Transacciones (numeroCuenta, tipoTransaccion, montoAnterior, montoTransaccion, montoNuevo, descripcion)
        SELECT 
            i.numeroCuenta,
            'ajuste_saldo',
            d.saldo,
            i.saldo - d.saldo,
            i.saldo,
            'Actualización automática de saldo'
        FROM inserted i
        INNER JOIN deleted d ON i.numeroCuenta = d.numeroCuenta
        WHERE i.saldo != d.saldo;
    END
END;

-- =============================================
-- Crear procedimientos almacenados
-- =============================================

-- Procedimiento para consultar recibos pendientes
CREATE PROCEDURE sp_ConsultarRecibosPendientes
    @numeroCuenta NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        r.idRecibo,
        r.numeroCuenta,
        r.monto,
        r.fecha,
        r.fechaVencimiento,
        r.estado,
        r.conceptoPago,
        r.periodoFacturacion,
        r.consumoKwh,
        CASE 
            WHEN r.fechaVencimiento < GETDATE() THEN 'Vencido'
            WHEN DATEDIFF(day, GETDATE(), r.fechaVencimiento) <= 5 THEN 'Por vencer'
            ELSE 'Vigente'
        END AS estadoVencimiento,
        c.saldo AS saldoDisponible
    FROM Recibos r
    INNER JOIN Cuentas c ON r.numeroCuenta = c.numeroCuenta
    WHERE r.numeroCuenta = @numeroCuenta 
        AND r.estado = 'pendiente'
        AND c.estado = 'activa'
    ORDER BY r.fechaVencimiento ASC;
END;

-- Procedimiento para procesar pago
CREATE PROCEDURE sp_ProcesarPago
    @idRecibo INT,
    @numeroCuenta NVARCHAR(20),
    @metodoPago NVARCHAR(50) = 'Saldo en cuenta'
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    
    DECLARE @montoRecibo DECIMAL(10,2);
    DECLARE @saldoActual DECIMAL(10,2);
    DECLARE @numeroTransaccion NVARCHAR(100);
    
    -- Generar número de transacción único
    SET @numeroTransaccion = 'TXN' + FORMAT(GETDATE(), 'yyyyMMddHHmmss') + RIGHT('000' + CAST(@idRecibo AS NVARCHAR), 3);
    
    -- Verificar que el recibo existe y está pendiente
    SELECT @montoRecibo = monto
    FROM Recibos
    WHERE idRecibo = @idRecibo AND numeroCuenta = @numeroCuenta AND estado = 'pendiente';
    
    IF @montoRecibo IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Recibo no encontrado o ya está pagado', 16, 1);
        RETURN;
    END
    
    -- Verificar saldo suficiente
    SELECT @saldoActual = saldo
    FROM Cuentas
    WHERE numeroCuenta = @numeroCuenta;
    
    IF @saldoActual < @montoRecibo
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Saldo insuficiente para realizar el pago', 16, 1);
        RETURN;
    END
    
    -- Actualizar saldo de la cuenta
    UPDATE Cuentas
    SET saldo = saldo - @montoRecibo
    WHERE numeroCuenta = @numeroCuenta;
    
    -- Actualizar estado del recibo
    UPDATE Recibos
    SET estado = 'pagado',
        fechaPago = GETDATE(),
        metodoPago = @metodoPago,
        numeroTransaccion = @numeroTransaccion
    WHERE idRecibo = @idRecibo;
    
    -- Registrar transacción
    INSERT INTO Transacciones (numeroCuenta, idRecibo, tipoTransaccion, montoAnterior, montoTransaccion, montoNuevo, descripcion)
    VALUES (@numeroCuenta, @idRecibo, 'pago_recibo', @saldoActual, -@montoRecibo, @saldoActual - @montoRecibo, 'Pago de recibo eléctrico #' + CAST(@idRecibo AS NVARCHAR));
    
    COMMIT TRANSACTION;
    
    -- Retornar información del pago
    SELECT 
        @numeroTransaccion AS numeroTransaccion,
        @montoRecibo AS montoPagado,
        GETDATE() AS fechaPago,
        @saldoActual - @montoRecibo AS nuevoSaldo;
END;

-- Procedimiento para obtener recibo pagado
CREATE PROCEDURE sp_ObtenerReciboPagado
    @idRecibo INT,
    @numeroCuenta NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        r.idRecibo,
        r.numeroCuenta,
        r.monto,
        r.fecha,
        r.fechaVencimiento,
        r.fechaPago,
        r.estado,
        r.conceptoPago,
        r.periodoFacturacion,
        r.lecturaAnterior,
        r.lecturaActual,
        r.consumoKwh,
        r.tarifaKwh,
        r.metodoPago,
        r.numeroTransaccion,
        c.nombreTitular,
        c.direccion,
        c.saldo AS saldoActual
    FROM Recibos r
    INNER JOIN Cuentas c ON r.numeroCuenta = c.numeroCuenta
    WHERE r.idRecibo = @idRecibo 
        AND r.numeroCuenta = @numeroCuenta 
        AND r.estado = 'pagado';
END;

-- =============================================
-- Crear vistas útiles
-- =============================================

-- Vista de resumen de cuentas
CREATE VIEW vw_ResumenCuentas AS
SELECT 
    c.numeroCuenta,
    c.nombreTitular,
    c.saldo,
    c.estado,
    COUNT(r.idRecibo) AS totalRecibos,
    SUM(CASE WHEN r.estado = 'pendiente' THEN 1 ELSE 0 END) AS recibosPendientes,
    SUM(CASE WHEN r.estado = 'pendiente' THEN r.monto ELSE 0 END) AS montoPendiente,
    MAX(r.fecha) AS ultimoRecibo
FROM Cuentas c
LEFT JOIN Recibos r ON c.numeroCuenta = r.numeroCuenta
GROUP BY c.numeroCuenta, c.nombreTitular, c.saldo, c.estado;

-- =============================================
-- Configuraciones finales
-- =============================================

-- Configurar opciones de la base de datos
ALTER DATABASE ElectricidadDB SET RECOVERY SIMPLE;
ALTER DATABASE ElectricidadDB SET AUTO_SHRINK OFF;
ALTER DATABASE ElectricidadDB SET AUTO_CREATE_STATISTICS ON;
ALTER DATABASE ElectricidadDB SET AUTO_UPDATE_STATISTICS ON;

PRINT '=============================================';
PRINT 'Base de datos ElectricidadDB creada exitosamente';
PRINT 'Tablas: Cuentas, Recibos, Transacciones';
PRINT 'Procedimientos almacenados: 3';
PRINT 'Triggers: 2';
PRINT 'Índices: 4';
PRINT 'Vistas: 1';
PRINT '=============================================';

-- Mostrar estadísticas de las tablas creadas
SELECT 
    t.name AS 'Tabla',
    p.rows AS 'Filas',
    CAST(ROUND(((SUM(a.total_pages) * 8) / 1024.00), 2) AS NUMERIC(36, 2)) AS 'Tamaño (MB)'
FROM sys.tables t
INNER JOIN sys.indexes i ON t.OBJECT_ID = i.object_id
INNER JOIN sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
LEFT OUTER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.NAME NOT LIKE 'dt%' 
    AND t.is_ms_shipped = 0
    AND i.OBJECT_ID > 255
GROUP BY t.Name, s.Name, p.Rows
ORDER BY t.Name;


-- =============================================
-- Insertar datos en tabla Cuentas
-- =============================================

-- Deshabilitar trigger temporalmente para inserción inicial
DISABLE TRIGGER TR_Cuentas_RegistrarTransaccion ON Cuentas;

INSERT INTO Cuentas (numeroCuenta, saldo, nombreTitular, direccion, telefono, email, estado) VALUES
('CTA001', 1500.00, 'Juan Carlos Pérez López', 'Av. Las Américas 123, Zona 14, Guatemala', '2345-6789', 'juan.perez@email.com', 'activa'),
('CTA002', 850.75, 'María Elena Rodríguez García', 'Calle Real 456, Antigua Guatemala', '7890-1234', 'maria.rodriguez@email.com', 'activa'),
('CTA003', 2250.50, 'Carlos Antonio Méndez Soto', 'Boulevard Liberación 789, Zona 12, Guatemala', '5678-9012', 'carlos.mendez@email.com', 'activa'),
('CTA004', 125.25, 'Ana Sofía Morales Castillo', 'Avenida Hincapié 321, Zona 13, Guatemala', '3456-7890', 'ana.morales@email.com', 'activa'),
('CTA005', 3500.00, 'Roberto Miguel Hernández Luna', 'Calzada Roosevelt 654, Zona 11, Guatemala', '9012-3456', 'roberto.hernandez@email.com', 'activa'),
('CTA006', 95.80, 'Claudia Patricia Jiménez Vega', 'Calle Montúfar 987, Zona 9, Guatemala', '6789-0123', 'claudia.jimenez@email.com', 'activa'),
('CTA007', 750.40, 'Diego Fernando Gutiérrez Ramos', 'Avenida Petapa 147, Zona 21, Guatemala', '2109-8765', 'diego.gutierrez@email.com', 'activa'),
('CTA008', 50.00, 'Lucía Alejandra Torres Mendoza', 'Boulevard Los Próceres 258, Zona 10, Guatemala', '4321-0987', 'lucia.torres@email.com', 'activa'),
('CTA009', 1800.90, 'Fernando José Ruiz Contreras', 'Calzada San Juan 369, Zona 7, Guatemala', '8765-4321', 'fernando.ruiz@email.com', 'activa'),
('CTA010', 200.15, 'Gabriela Beatriz Vargas Solórzano', 'Avenida Elena 741, Zona 4, Guatemala', '0987-6543', 'gabriela.vargas@email.com', 'activa');

-- Rehabilitar trigger
ENABLE TRIGGER TR_Cuentas_RegistrarTransaccion ON Cuentas;

PRINT 'Cuentas insertadas: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- =============================================
-- Insertar datos en tabla Recibos
-- =============================================

-- Deshabilitar trigger temporalmente para inserción inicial
DISABLE TRIGGER TR_Recibos_CalcularConsumo ON Recibos;

-- Recibos pendientes (para probar consultas y pagos)
INSERT INTO Recibos (numeroCuenta, monto, fecha, fechaVencimiento, estado, conceptoPago, periodoFacturacion, lecturaAnterior, lecturaActual, tarifaKwh) VALUES
-- Recibos con saldo suficiente para pagar
('CTA001', 245.50, DATEADD(day, -15, GETDATE()), DATEADD(day, 15, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 1250.5, 1885.8, 0.15),
('CTA003', 189.75, DATEADD(day, -10, GETDATE()), DATEADD(day, 20, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 980.2, 1245.5, 0.15),
('CTA005', 312.80, DATEADD(day, -8, GETDATE()), DATEADD(day, 22, GETDATE()), 'pendiente', 'Consumo Eléctrico Comercial', 'ENE-2025', 2150.8, 2635.1, 0.18),
('CTA007', 156.25, DATEADD(day, -12, GETDATE()), DATEADD(day, 18, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 850.3, 1195.6, 0.15),
('CTA009', 278.90, DATEADD(day, -5, GETDATE()), DATEADD(day, 25, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 1680.4, 2540.7, 0.15),

-- Recibos con saldo insuficiente (para probar validaciones)
('CTA004', 180.75, DATEADD(day, -20, GETDATE()), DATEADD(day, 10, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 750.1, 955.8, 0.15),
('CTA006', 145.30, DATEADD(day, -18, GETDATE()), DATEADD(day, 12, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 620.5, 825.2, 0.15),
('CTA008', 98.60, DATEADD(day, -25, GETDATE()), DATEADD(day, 5, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 450.8, 608.5, 0.15),

-- Recibos próximos a vencer
('CTA002', 134.85, DATEADD(day, -28, GETDATE()), DATEADD(day, 2, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 890.2, 1189.5, 0.15),
('CTA010', 167.40, DATEADD(day, -26, GETDATE()), DATEADD(day, 4, GETDATE()), 'pendiente', 'Consumo Eléctrico Residencial', 'ENE-2025', 520.7, 1636.4, 0.15);

-- Recibos ya pagados (para mostrar historial)
INSERT INTO Recibos (numeroCuenta, monto, fecha, fechaVencimiento, estado, conceptoPago, periodoFacturacion, lecturaAnterior, lecturaActual, tarifaKwh, fechaPago, metodoPago, numeroTransaccion) VALUES
('CTA001', 198.45, DATEADD(day, -45, GETDATE()), DATEADD(day, -15, GETDATE()), 'pagado', 'Consumo Eléctrico Residencial', 'DIC-2024', 1050.2, 1374.5, 0.15, DATEADD(day, -20, GETDATE()), 'Saldo en cuenta', 'TXN20241201143022001'),
('CTA002', 156.80, DATEADD(day, -40, GETDATE()), DATEADD(day, -10, GETDATE()), 'pagado', 'Consumo Eléctrico Residencial', 'DIC-2024', 750.8, 1098.6, 0.15, DATEADD(day, -15, GETDATE()), 'Saldo en cuenta', 'TXN20241205091234002'),
('CTA003', 234.20, DATEADD(day, -50, GETDATE()), DATEADD(day, -20, GETDATE()), 'pagado', 'Consumo Eléctrico Residencial', 'DIC-2024', 850.5, 1405.8, 0.15, DATEADD(day, -25, GETDATE()), 'Saldo en cuenta', 'TXN20241210165545003'),
('CTA005', 289.75, DATEADD(day, -35, GETDATE()), DATEADD(day, -5, GETDATE()), 'pagado', 'Consumo Eléctrico Comercial', 'DIC-2024', 1950.3, 2560.1, 0.18, DATEADD(day, -10, GETDATE()), 'Saldo en cuenta', 'TXN20241215201156004'),
('CTA007', 145.60, DATEADD(day, -42, GETDATE()), DATEADD(day, -12, GETDATE()), 'pagado', 'Consumo Eléctrico Residencial', 'DIC-2024', 690.4, 1061.8, 0.15, DATEADD(day, -18, GETDATE()), 'Saldo en cuenta', 'TXN20241218134422005');

-- Rehabilitar trigger
ENABLE TRIGGER TR_Recibos_CalcularConsumo ON Recibos;

PRINT 'Recibos insertados: ' + CAST(@@ROWCOUNT AS NVARCHAR);

-- =============================================
-- Insertar transacciones históricas
-- =============================================

INSERT INTO Transacciones (numeroCuenta, idRecibo, tipoTransaccion, montoAnterior, montoTransaccion, montoNuevo, fechaTransaccion, descripcion, estadoTransaccion) VALUES
-- Recargas de saldo
('CTA001', NULL, 'recarga_saldo', 1301.95, 500.00, 1801.95, DATEADD(day, -30, GETDATE()), 'Recarga de saldo - Transferencia bancaria', 'completada'),
('CTA002', NULL, 'recarga_saldo', 850.75, 300.00, 1150.75, DATEADD(day, -25, GETDATE()), 'Recarga de saldo - Depósito en efectivo', 'completada'),
('CTA003', NULL, 'recarga_saldo', 2016.30, 1000.00, 3016.30, DATEADD(day, -35, GETDATE()), 'Recarga de saldo - Transferencia electrónica', 'completada'),
('CTA005', NULL, 'recarga_saldo', 3210.25, 800.00, 4010.25, DATEADD(day, -40, GETDATE()), 'Recarga de saldo - Cheque', 'completada'),

-- Pagos de recibos históricos
('CTA001', 11, 'pago_recibo', 1801.95, -198.45, 1603.50, DATEADD(day, -20, GETDATE()), 'Pago de recibo eléctrico #11', 'completada'),
('CTA002', 12, 'pago_recibo', 1150.75, -156.80, 993.95, DATEADD(day, -15, GETDATE()), 'Pago de recibo eléctrico #12', 'completada'),
('CTA003', 13, 'pago_recibo', 3016.30, -234.20, 2782.10, DATEADD(day, -25, GETDATE()), 'Pago de recibo eléctrico #13', 'completada'),
('CTA005', 14, 'pago_recibo', 4010.25, -289.75, 3720.50, DATEADD(day, -10, GETDATE()), 'Pago de recibo eléctrico #14', 'completada'),
('CTA007', 15, 'pago_recibo', 901.00, -145.60, 755.40, DATEADD(day, -18, GETDATE()), 'Pago de recibo eléctrico #15', 'completada');

PRINT 'Transacciones insertadas: ' + CAST(@@ROWCOUNT AS NVARCHAR);
 
-- =============================================
-- Actualizar estadísticas y verificar datos
-- =============================================

-- Actualizar estadísticas de las tablas
UPDATE STATISTICS Cuentas;
UPDATE STATISTICS Recibos;
UPDATE STATISTICS Transacciones;

-- =============================================
-- Mostrar resumen de datos insertados
-- =============================================

PRINT '=============================================';
PRINT 'RESUMEN DE DATOS INSERTADOS:';
PRINT '=============================================';

SELECT 'Cuentas' AS Tabla, COUNT(*) AS Total FROM Cuentas
UNION ALL
SELECT 'Recibos', COUNT(*) FROM Recibos
UNION ALL
SELECT 'Transacciones', COUNT(*) FROM Transacciones;

PRINT '';
PRINT 'ESTADO DE RECIBOS:';
SELECT 
    estado,
    COUNT(*) AS cantidad,
    SUM(monto) AS montoTotal
FROM Recibos 
GROUP BY estado 
ORDER BY estado;

PRINT '';
PRINT 'CUENTAS CON RECIBOS PENDIENTES:';
SELECT 
    c.numeroCuenta,
    c.nombreTitular,
    c.saldo,
    COUNT(r.idRecibo) AS recibosPendientes,
    SUM(r.monto) AS montoPendiente,
    CASE 
        WHEN c.saldo >= SUM(r.monto) THEN 'Saldo suficiente'
        ELSE 'Saldo insuficiente'
    END AS estadoPago
FROM Cuentas c
LEFT JOIN Recibos r ON c.numeroCuenta = r.numeroCuenta AND r.estado = 'pendiente'
WHERE r.idRecibo IS NOT NULL
GROUP BY c.numeroCuenta, c.nombreTitular, c.saldo
ORDER BY c.numeroCuenta;

PRINT '';
PRINT 'DATOS DE PRUEBA PARA DESARROLLO:';
PRINT '=============================================';
PRINT 'Cuentas con saldo suficiente para pagar:';
PRINT '- CTA001 (Juan Carlos) - Saldo: Q1,500.00';
PRINT '-