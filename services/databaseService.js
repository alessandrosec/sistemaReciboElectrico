// databaseService.js

class DatabaseService {
    constructor() {
    }

    /**
     * Obtiene un recibo específico por ID y número de cuenta.
     * Corresponde a wsClient.obtenerRecibo en el frontend.
     * @param {number} idRecibo
     * @param {string} numeroCuenta
     * @returns {Promise<Object|null>} El objeto recibo si se encuentra, de lo contrario null.
     */
    async obtenerRecibo(idRecibo, numeroCuenta) {
        try {
            const mockRecibos = [
                { idRecibo: 123, numeroCuenta: 'ABC', nombreCliente: 'Juan Pérez', fecha: '2023-01-15T10:00:00Z', fechaVencimiento: '2023-02-15T10:00:00Z', fechaPago: '2023-01-20T11:30:00Z', montoTotal: 150.75, estado: 'Pagado', descripcion: 'Pago de servicio mensual' },
                { idRecibo: 456, numeroCuenta: 'DEF', nombreCliente: 'María López', fecha: '2023-03-01T09:00:00Z', fechaVencimiento: '2023-04-01T09:00:00Z', fechaPago: null, montoTotal: 220.50, estado: 'Pendiente' },
            ];
            const foundRecibo = mockRecibos.find(r => r.idRecibo === idRecibo && r.numeroCuenta === numeroCuenta);
            return foundRecibo || null;

        } catch (error) {
            console.error('Error en databaseService.obtenerRecibo:', error);
            throw new Error('No se pudo obtener el recibo de la base de datos.');
        }
    }

    /**
     * Consulta recibos pendientes para una cuenta.
     * Corresponde a wsClient.consultarRecibo en el frontend.
     * @param {string} numeroCuenta
     * @returns {Promise<Object>} Un objeto con recibos y saldo disponible.
     */
    async consultarRecibosPendientes(numeroCuenta) {
        try {
            const mockData = {
                'ABC': {
                    saldoDisponible: 500.00,
                    recibos: [
                        { idRecibo: 789, conceptoPago: 'Electricidad', periodoFacturacion: 'Ene-Feb', monto: 120.00, estado: 'Pendiente', esUrgente: false, fechaVencimiento: '2025-07-20T23:59:59Z', consumoKwh: 150 },
                        { idRecibo: 101, conceptoPago: 'Agua', periodoFacturacion: 'Feb-Mar', monto: 80.00, estado: 'Pendiente', esUrgente: false, fechaVencimiento: '2025-07-25T23:59:59Z', consumoKwh: 20 },
                        { idRecibo: 102, conceptoPago: 'Internet', periodoFacturacion: 'Mar-Abr', monto: 300.00, estado: 'Pendiente', esUrgente: true, fechaVencimiento: '2025-07-05T23:59:59Z', consumoKwh: null },
                    ]
                },
                'XYZ': {
                    saldoDisponible: 50.00,
                    recibos: [
                        { idRecibo: 200, conceptoPago: 'Gas', periodoFacturacion: 'Abr-May', monto: 100.00, estado: 'Pendiente', esUrgente: false, fechaVencimiento: '2025-07-30T23:59:59Z', consumoKwh: 30 },
                    ]
                },
                'EMPTY': {
                    saldoDisponible: 1000.00,
                    recibos: []
                }
            };
            
            const data = mockData[numeroCuenta] || { saldoDisponible: 0, recibos: [] };
            const montoTotalPendiente = data.recibos.reduce((sum, r) => sum + r.monto, 0);
            const puedePagarTodos = data.saldoDisponible >= montoTotalPendiente;

            return {
                numeroCuenta: numeroCuenta,
                saldoDisponible: data.saldoDisponible,
                recibos: data.recibos,
                totalRecibos: data.recibos.length,
                montoTotal: montoTotalPendiente,
                puedePagarTodos: puedePagarTodos
            };

        } catch (error) {
            console.error('Error en databaseService.consultarRecibosPendientes:', error);
            throw new Error('No se pudieron consultar los recibos pendientes de la base de datos.');
        }
    }

    /**
     * Procesa un pago para un recibo.
     * Corresponde a wsClient.procesarPago en el frontend.
     * @param {number} idRecibo
     * @param {string} numeroCuenta
     * @param {string} metodoPago
     * @returns {Promise<Object>} Resultado del pago.
     */
    async procesarPago(idRecibo, numeroCuenta, metodoPago) {
        try {
            const success = Math.random() > 0.1;

            if (success) {
                const currentRecibo = await this.obtenerRecibo(idRecibo, numeroCuenta);
                if (!currentRecibo) {
                    throw new Error('Recibo no encontrado para procesar el pago.');
                }
                const currentAccountData = await this.consultarRecibosPendientes(numeroCuenta);
                if (currentAccountData.saldoDisponible < currentRecibo.montoTotal) {
                    throw new Error('Saldo insuficiente para completar el pago.');
                }

                const newSaldo = Math.max(0, currentAccountData.saldoDisponible - currentRecibo.montoTotal);

                return {
                    idRecibo: idRecibo,
                    numeroCuenta: numeroCuenta,
                    montoPagado: currentRecibo.montoTotal || 0,
                    fechaPago: new Date().toISOString(),
                    metodoPago: metodoPago,
                    numeroTransaccion: `TXN-${Date.now()}-${idRecibo}`,
                    confirmacion: { estado: 'Confirmado', mensaje: 'Pago registrado exitosamente.' },
                    nuevoSaldo: newSaldo
                };
            } else {
                throw new Error('Fallo simulado al procesar el pago. Intente de nuevo.');
            }

        } catch (error) {
            console.error('Error en databaseService.procesarPago:', error);
            throw new Error(`No se pudo procesar el pago para el recibo ${idRecibo}: ${error.message}`);
        }
    }
}

module.exports = new DatabaseService();