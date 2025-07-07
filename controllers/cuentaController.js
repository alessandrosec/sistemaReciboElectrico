const { dbConnection, sql } = require('../config/database');

class CuentaController {
    
    /**
     * Obtiene el saldo de una cuenta
     */
    async obtenerSaldo(numeroCuenta) {
        try {
            console.log(`💰 Consultando saldo para cuenta: ${numeroCuenta}`);
            
            const query = `
                SELECT 
                    c.numeroCuenta,
                    c.saldo,
                    c.nombreTitular,
                    c.estado,
                    c.fechaCreacion,
                    COUNT(r.idRecibo) as totalRecibos,
                    SUM(CASE WHEN r.estado = 'pendiente' THEN r.monto ELSE 0 END) as montoPendiente
                FROM Cuentas c
                LEFT JOIN Recibos r ON c.numeroCuenta = r.numeroCuenta
                WHERE c.numeroCuenta = @numeroCuenta
                GROUP BY c.numeroCuenta, c.saldo, c.nombreTitular, c.estado, c.fechaCreacion
            `;

            const result = await dbConnection.query(query, { numeroCuenta });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error('Cuenta no encontrada');
            }

            const cuenta = result.recordset[0];

            return {
                success: true,
                message: 'Saldo obtenido exitosamente',
                data: {
                    numeroCuenta: cuenta.numeroCuenta,
                    saldo: parseFloat(cuenta.saldo),
                    nombreTitular: cuenta.nombreTitular,
                    estado: cuenta.estado,
                    fechaCreacion: cuenta.fechaCreacion,
                    estadisticas: {
                        totalRecibos: cuenta.totalRecibos,
                        montoPendiente: parseFloat(cuenta.montoPendiente) || 0,
                        saldoDisponible: parseFloat(cuenta.saldo) - (parseFloat(cuenta.montoPendiente) || 0)
                    }
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo saldo:', error);
            throw new Error(`Error obteniendo saldo: ${error.message}`);
        }
    }

    /**
     * Obtiene información completa de una cuenta
     */
    async obtenerInformacionCuenta(numeroCuenta) {
        try {
            console.log(`👤 Obteniendo información completa de cuenta: ${numeroCuenta}`);
            
            const query = `
                SELECT 
                    numeroCuenta,
                    saldo,
                    nombreTitular,
                    direccion,
                    telefono,
                    email,
                    estado,
                    fechaCreacion
                FROM Cuentas 
                WHERE numeroCuenta = @numeroCuenta
            `;

            const result = await dbConnection.query(query, { numeroCuenta });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error('Cuenta no encontrada');
            }

            const cuenta = result.recordset[0];

            return {
                success: true,
                message: 'Información de cuenta obtenida exitosamente',
                data: {
                    numeroCuenta: cuenta.numeroCuenta,
                    saldo: parseFloat(cuenta.saldo),
                    nombreTitular: cuenta.nombreTitular,
                    direccion: cuenta.direccion,
                    telefono: cuenta.telefono,
                    email: cuenta.email,
                    estado: cuenta.estado,
                    fechaCreacion: cuenta.fechaCreacion,
                    antiguedad: this.calcularAntiguedad(cuenta.fechaCreacion)
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo información de cuenta:', error);
            throw new Error(`Error obteniendo información de cuenta: ${error.message}`);
        }
    }

    /**
     * Valida si una cuenta existe y está activa
     */
    async validarCuenta(numeroCuenta) {
        try {
            const query = `
                SELECT numeroCuenta, estado, nombreTitular 
                FROM Cuentas 
                WHERE numeroCuenta = @numeroCuenta
            `;

            const result = await dbConnection.query(query, { numeroCuenta });

            if (!result.recordset || result.recordset.length === 0) {
                return {
                    existe: false,
                    activa: false,
                    mensaje: 'Cuenta no encontrada'
                };
            }

            const cuenta = result.recordset[0];
            const activa = cuenta.estado === 'activa';

            return {
                existe: true,
                activa: activa,
                numeroCuenta: cuenta.numeroCuenta,
                nombreTitular: cuenta.nombreTitular,
                estado: cuenta.estado,
                mensaje: activa ? 'Cuenta válida' : `Cuenta ${cuenta.estado}`
            };

        } catch (error) {
            console.error('❌ Error validando cuenta:', error);
            throw new Error(`Error validando cuenta: ${error.message}`);
        }
    }

    /**
     * Obtiene el historial de transacciones de una cuenta
     */
    async obtenerHistorialTransacciones(numeroCuenta, limite = 20) {
        try {
            console.log(`📊 Obteniendo historial de transacciones para cuenta: ${numeroCuenta}`);
            
            const query = `
                SELECT TOP (@limite)
                    t.idTransaccion,
                    t.tipoTransaccion,
                    t.montoAnterior,
                    t.montoTransaccion,
                    t.montoNuevo,
                    t.fechaTransaccion,
                    t.descripcion,
                    t.estadoTransaccion,
                    r.conceptoPago
                FROM Transacciones t
                LEFT JOIN Recibos r ON t.idRecibo = r.idRecibo
                WHERE t.numeroCuenta = @numeroCuenta
                ORDER BY t.fechaTransaccion DESC
            `;

            const result = await dbConnection.query(query, {
                numeroCuenta: numeroCuenta,
                limite: limite
            });

            const transacciones = result.recordset.map(trans => ({
                idTransaccion: trans.idTransaccion,
                tipoTransaccion: trans.tipoTransaccion,
                montoAnterior: parseFloat(trans.montoAnterior),
                montoTransaccion: parseFloat(trans.montoTransaccion),
                montoNuevo: parseFloat(trans.montoNuevo),
                fechaTransaccion: trans.fechaTransaccion,
                descripcion: trans.descripcion,
                estadoTransaccion: trans.estadoTransaccion,
                conceptoPago: trans.conceptoPago,
                esDebito: trans.montoTransaccion < 0,
                esCredito: trans.montoTransaccion > 0
            }));

            return {
                success: true,
                message: 'Historial obtenido exitosamente',
                data: {
                    numeroCuenta: numeroCuenta,
                    transacciones: transacciones,
                    totalTransacciones: transacciones.length,
                    resumen: {
                        totalDebitos: transacciones.filter(t => t.esDebito).length,
                        totalCreditos: transacciones.filter(t => t.esCredito).length,
                        montoTotalDebitos: transacciones
                            .filter(t => t.esDebito)
                            .reduce((sum, t) => sum + Math.abs(t.montoTransaccion), 0),
                        montoTotalCreditos: transacciones
                            .filter(t => t.esCredito)
                            .reduce((sum, t) => sum + t.montoTransaccion, 0)
                    }
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo historial de transacciones:', error);
            throw new Error(`Error obteniendo historial: ${error.message}`);
        }
    }

    /**
     * Recarga saldo a una cuenta
     */
    async recargarSaldo(numeroCuenta, monto, descripcion = 'Recarga de saldo') {
        try {
            console.log(`💳 Recargando saldo - Cuenta: ${numeroCuenta}, Monto: ${monto}`);
            
            if (monto <= 0) {
                throw new Error('El monto debe ser mayor a cero');
            }

            // Validar que la cuenta existe y está activa
            const validacion = await this.validarCuenta(numeroCuenta);
            if (!validacion.existe) {
                throw new Error('Cuenta no encontrada');
            }
            if (!validacion.activa) {
                throw new Error(`No se puede recargar saldo: cuenta ${validacion.estado}`);
            }

            // Obtener saldo actual
            const saldoActual = await this.obtenerSaldo(numeroCuenta);
            const montoAnterior = saldoActual.data.saldo;
            const montoNuevo = montoAnterior + monto;

            // Usar transacción para garantizar consistencia
            const transaction = await dbConnection.beginTransaction();
            
            try {
                // Actualizar saldo
                const updateQuery = `
                    UPDATE Cuentas 
                    SET saldo = saldo + @monto 
                    WHERE numeroCuenta = @numeroCuenta
                `;
                
                const request = new sql.Request(transaction);
                await request
                    .input('monto', sql.Decimal(10, 2), monto)
                    .input('numeroCuenta', sql.NVarChar(20), numeroCuenta)
                    .query(updateQuery);

                // Registrar transacción
                const insertQuery = `
                    INSERT INTO Transacciones 
                    (numeroCuenta, tipoTransaccion, montoAnterior, montoTransaccion, montoNuevo, descripcion)
                    VALUES (@numeroCuenta, 'recarga_saldo', @montoAnterior, @monto, @montoNuevo, @descripcion)
                `;

                await request
                    .input('montoAnterior', sql.Decimal(10, 2), montoAnterior)
                    .input('montoNuevo', sql.Decimal(10, 2), montoNuevo)
                    .input('descripcion', sql.NVarChar(200), descripcion)
                    .query(insertQuery);

                await transaction.commit();

                return {
                    success: true,
                    message: 'Saldo recargado exitosamente',
                    data: {
                        numeroCuenta: numeroCuenta,
                        montoRecargado: monto,
                        saldoAnterior: montoAnterior,
                        nuevoSaldo: montoNuevo,
                        fechaRecarga: new Date().toISOString()
                    }
                };

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ Error recargando saldo:', error);
            throw new Error(`Error recargando saldo: ${error.message}`);
        }
    }

    /**
     * Calcula la antigüedad de una cuenta en años
     */
    calcularAntiguedad(fechaCreacion) {
        const hoy = new Date();
        const creacion = new Date(fechaCreacion);
        const diferencia = hoy.getTime() - creacion.getTime();
        const años = diferencia / (1000 * 60 * 60 * 24 * 365.25);
        return Math.floor(años * 10) / 10; // Redondear a 1 decimal
    }

    /**
     * Obtiene resumen de todas las cuentas (para administración)
     */
    async obtenerResumenCuentas() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as totalCuentas,
                    SUM(saldo) as saldoTotal,
                    AVG(saldo) as saldoPromedio,
                    COUNT(CASE WHEN estado = 'activa' THEN 1 END) as cuentasActivas,
                    COUNT(CASE WHEN estado = 'inactiva' THEN 1 END) as cuentasInactivas,
                    COUNT(CASE WHEN estado = 'suspendida' THEN 1 END) as cuentasSuspendidas
                FROM Cuentas
            `;

            const result = await dbConnection.query(query);
            const resumen = result.recordset[0];

            return {
                success: true,
                data: {
                    estadisticas: {
                        totalCuentas: resumen.totalCuentas,
                        saldoTotal: parseFloat(resumen.saldoTotal) || 0,
                        saldoPromedio: parseFloat(resumen.saldoPromedio) || 0,
                        cuentasActivas: resumen.cuentasActivas,
                        cuentasInactivas: resumen.cuentasInactivas,
                        cuentasSuspendidas: resumen.cuentasSuspendidas
                    }
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo resumen de cuentas:', error);
            throw new Error(`Error obteniendo resumen: ${error.message}`);
        }
    }
}

module.exports = new CuentaController();