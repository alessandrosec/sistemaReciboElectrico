const { dbConnection, sql } = require('../config/database');

class ReciboController {
    
    /**
     * Consulta recibos pendientes para una cuenta
     */
    async consultarRecibosPendientes(numeroCuenta) {
        try {
            console.log(`🔍 Consultando recibos pendientes para cuenta: ${numeroCuenta}`);
            
            const result = await dbConnection.executeStoredProcedure('sp_ConsultarRecibosPendientes', {
                numeroCuenta: numeroCuenta
            });

            if (!result.recordset || result.recordset.length === 0) {
                return {
                    success: true,
                    message: 'No se encontraron recibos pendientes',
                    data: {
                        numeroCuenta: numeroCuenta,
                        recibos: [],
                        totalRecibos: 0,
                        montoTotal: 0
                    }
                };
            }

            const recibos = result.recordset.map(recibo => ({
                idRecibo: recibo.idRecibo,
                numeroCuenta: recibo.numeroCuenta,
                monto: parseFloat(recibo.monto),
                fecha: recibo.fecha,
                fechaVencimiento: recibo.fechaVencimiento,
                estado: recibo.estado,
                conceptoPago: recibo.conceptoPago,
                periodoFacturacion: recibo.periodoFacturacion,
                consumoKwh: parseFloat(recibo.consumoKwh) || 0,
                estadoVencimiento: recibo.estadoVencimiento,
                diasParaVencer: this.calcularDiasParaVencer(recibo.fechaVencimiento),
                esUrgente: this.esReciboUrgente(recibo.fechaVencimiento)
            }));

            const montoTotal = recibos.reduce((sum, recibo) => sum + recibo.monto, 0);
            const saldoDisponible = result.recordset[0].saldoDisponible;

            return {
                success: true,
                message: `Se encontraron ${recibos.length} recibos pendientes`,
                data: {
                    numeroCuenta: numeroCuenta,
                    saldoDisponible: parseFloat(saldoDisponible),
                    recibos: recibos,
                    totalRecibos: recibos.length,
                    montoTotal: montoTotal,
                    puedePagearTodos: saldoDisponible >= montoTotal,
                    recibosMasUrgentes: recibos.filter(r => r.esUrgente).slice(0, 3)
                }
            };

        } catch (error) {
            console.error('❌ Error consultando recibos pendientes:', error);
            throw new Error(`Error consultando recibos: ${error.message}`);
        }
    }

    /**
     * Procesa el pago de un recibo
     */
    async procesarPago(idRecibo, numeroCuenta, metodoPago = 'Saldo en cuenta') {
        try {
            console.log(`💳 Procesando pago - Recibo: ${idRecibo}, Cuenta: ${numeroCuenta}`);
            
            // Validar parámetros
            if (!idRecibo || !numeroCuenta) {
                throw new Error('ID de recibo y número de cuenta son requeridos');
            }

            const result = await dbConnection.executeStoredProcedure('sp_ProcesarPago', {
                idRecibo: idRecibo,
                numeroCuenta: numeroCuenta,
                metodoPago: metodoPago
            });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error('No se pudo procesar el pago');
            }

            const pagoInfo = result.recordset[0];

            return {
                success: true,
                message: 'Pago procesado exitosamente',
                data: {
                    idRecibo: idRecibo,
                    numeroCuenta: numeroCuenta,
                    numeroTransaccion: pagoInfo.numeroTransaccion,
                    montoPagado: parseFloat(pagoInfo.montoPagado),
                    fechaPago: pagoInfo.fechaPago,
                    nuevoSaldo: parseFloat(pagoInfo.nuevoSaldo),
                    metodoPago: metodoPago,
                    confirmacion: {
                        codigo: pagoInfo.numeroTransaccion,
                        fecha: new Date().toISOString(),
                        estado: 'COMPLETADO'
                    }
                }
            };

        } catch (error) {
            console.error('❌ Error procesando pago:', error);
            
            // Detectar errores específicos
            if (error.message.includes('Saldo insuficiente')) {
                throw new Error('Saldo insuficiente para realizar el pago');
            } else if (error.message.includes('no encontrado') || error.message.includes('ya está pagado')) {
                throw new Error('Recibo no encontrado o ya está pagado');
            } else {
                throw new Error(`Error procesando pago: ${error.message}`);
            }
        }
    }

    /**
     * Obtiene los detalles de un recibo pagado
     */
    async obtenerReciboPagado(idRecibo, numeroCuenta) {
        try {
            console.log(`📄 Obteniendo recibo pagado - ID: ${idRecibo}, Cuenta: ${numeroCuenta}`);
            
            const result = await dbConnection.executeStoredProcedure('sp_ObtenerReciboPagado', {
                idRecibo: idRecibo,
                numeroCuenta: numeroCuenta
            });

            if (!result.recordset || result.recordset.length === 0) {
                throw new Error('Recibo no encontrado o no está pagado');
            }

            const recibo = result.recordset[0];

            return {
                success: true,
                message: 'Recibo obtenido exitosamente',
                data: {
                    // Información del recibo
                    idRecibo: recibo.idRecibo,
                    numeroCuenta: recibo.numeroCuenta,
                    monto: parseFloat(recibo.monto),
                    fecha: recibo.fecha,
                    fechaVencimiento: recibo.fechaVencimiento,
                    fechaPago: recibo.fechaPago,
                    estado: recibo.estado,
                    conceptoPago: recibo.conceptoPago,
                    periodoFacturacion: recibo.periodoFacturacion,
                    
                    // Información de consumo
                    lecturaAnterior: parseFloat(recibo.lecturaAnterior) || 0,
                    lecturaActual: parseFloat(recibo.lecturaActual) || 0,
                    consumoKwh: parseFloat(recibo.consumoKwh) || 0,
                    tarifaKwh: parseFloat(recibo.tarifaKwh) || 0,
                    
                    // Información de pago
                    metodoPago: recibo.metodoPago,
                    numeroTransaccion: recibo.numeroTransaccion,
                    
                    // Información del cliente
                    nombreTitular: recibo.nombreTitular,
                    direccion: recibo.direccion,
                    saldoActual: parseFloat(recibo.saldoActual),
                    
                    // Información adicional
                    diasPagadoDespuesVencimiento: this.calcularDiasPagadoDespuesVencimiento(recibo.fechaVencimiento, recibo.fechaPago),
                    esReciboPagadoATiempo: new Date(recibo.fechaPago) <= new Date(recibo.fechaVencimiento)
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo recibo pagado:', error);
            throw new Error(`Error obteniendo recibo: ${error.message}`);
        }
    }

    /**
     * Obtiene el historial de recibos de una cuenta
     */
    async obtenerHistorialRecibos(numeroCuenta, limite = 10) {
        try {
            console.log(`📊 Obteniendo historial de recibos para cuenta: ${numeroCuenta}`);
            
            const query = `
                SELECT TOP (@limite)
                    r.idRecibo,
                    r.numeroCuenta,
                    r.monto,
                    r.fecha,
                    r.fechaVencimiento,
                    r.fechaPago,
                    r.estado,
                    r.conceptoPago,
                    r.periodoFacturacion,
                    r.numeroTransaccion
                FROM Recibos r
                WHERE r.numeroCuenta = @numeroCuenta
                ORDER BY r.fecha DESC
            `;

            const result = await dbConnection.query(query, {
                numeroCuenta: numeroCuenta,
                limite: limite
            });

            const historial = result.recordset.map(recibo => ({
                idRecibo: recibo.idRecibo,
                monto: parseFloat(recibo.monto),
                fecha: recibo.fecha,
                fechaVencimiento: recibo.fechaVencimiento,
                fechaPago: recibo.fechaPago,
                estado: recibo.estado,
                periodoFacturacion: recibo.periodoFacturacion,
                numeroTransaccion: recibo.numeroTransaccion
            }));

            return {
                success: true,
                data: {
                    numeroCuenta: numeroCuenta,
                    historial: historial,
                    totalRecibos: historial.length
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo historial:', error);
            throw new Error(`Error obteniendo historial: ${error.message}`);
        }
    }

    /**
     * Calcula los días para vencer un recibo
     */
    calcularDiasParaVencer(fechaVencimiento) {
        const hoy = new Date();
        const vencimiento = new Date(fechaVencimiento);
        const diferencia = vencimiento.getTime() - hoy.getTime();
        return Math.ceil(diferencia / (1000 * 60 * 60 * 24));
    }

    /**
     * Determina si un recibo es urgente (vence en 5 días o menos)
     */
    esReciboUrgente(fechaVencimiento) {
        const diasParaVencer = this.calcularDiasParaVencer(fechaVencimiento);
        return diasParaVencer <= 5 && diasParaVencer >= 0;
    }

    /**
     * Calcula días pagado después del vencimiento
     */
    calcularDiasPagadoDespuesVencimiento(fechaVencimiento, fechaPago) {
        if (!fechaPago) return 0;
        
        const vencimiento = new Date(fechaVencimiento);
        const pago = new Date(fechaPago);
        
        if (pago <= vencimiento) return 0;
        
        const diferencia = pago.getTime() - vencimiento.getTime();
        return Math.ceil(diferencia / (1000 * 60 * 60 * 24));
    }

    /**
     * Obtiene estadísticas de recibos para una cuenta
     */
    async obtenerEstadisticasRecibos(numeroCuenta) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as totalRecibos,
                    SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as recibosPendientes,
                    SUM(CASE WHEN estado = 'pagado' THEN 1 ELSE 0 END) as recibosPagados,
                    SUM(CASE WHEN estado = 'pendiente' THEN monto ELSE 0 END) as montoPendiente,
                    SUM(CASE WHEN estado = 'pagado' THEN monto ELSE 0 END) as montoPagado,
                    AVG(CASE WHEN estado = 'pagado' THEN monto ELSE NULL END) as promedioFactura
                FROM Recibos 
                WHERE numeroCuenta = @numeroCuenta
            `;

            const result = await dbConnection.query(query, { numeroCuenta });
            const stats = result.recordset[0];

            return {
                success: true,
                data: {
                    numeroCuenta: numeroCuenta,
                    estadisticas: {
                        totalRecibos: stats.totalRecibos,
                        recibosPendientes: stats.recibosPendientes,
                        recibosPagados: stats.recibosPagados,
                        montoPendiente: parseFloat(stats.montoPendiente) || 0,
                        montoPagado: parseFloat(stats.montoPagado) || 0,
                        promedioFactura: parseFloat(stats.promedioFactura) || 0
                    }
                }
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw new Error(`Error obteniendo estadísticas: ${error.message}`);
        }
    }
}

module.exports = new ReciboController();