const WebSocket = require('ws');
const reciboController = require('../controllers/reciboController');
const cuentaController = require('../controllers/cuentaController');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Map();
        this.messageHandlers = {
            'consultar_recibo': this.handleConsultarRecibo.bind(this),
            'procesar_pago': this.handleProcesarPago.bind(this),
            'obtener_recibo': this.handleObtenerRecibo.bind(this),
            'ping': this.handlePing.bind(this),
            'obtener_saldo': this.handleObtenerSaldo.bind(this)
        };
    }

    /**
     * Inicializa el servidor WebSocket
     */
    initialize(port = 8080) {
        this.wss = new WebSocket.Server({ 
            port: port,
            perMessageDeflate: false
        });

        console.log(`🔌 Servidor WebSocket iniciado en puerto ${port}`);

        this.wss.on('connection', (ws, request) => {
            const clientId = this.generateClientId();
            const clientInfo = {
                id: clientId,
                ip: request.socket.remoteAddress,
                userAgent: request.headers['user-agent'],
                connectedAt: new Date()
            };

            this.clients.set(ws, clientInfo);
            console.log(`👤 Cliente conectado: ${clientId} desde ${clientInfo.ip}`);

            // Configurar eventos del cliente
            this.setupClientEvents(ws, clientInfo);

            // Enviar mensaje de bienvenida
            this.sendMessage(ws, {
                type: 'connection_established',
                clientId: clientId,
                timestamp: new Date().toISOString(),
                message: 'Conectado al Sistema de Recibos Eléctricos'
            });
        });

        this.wss.on('error', (error) => {
            console.error('❌ Error en WebSocket Server:', error);
        });

        // Configurar limpieza periódica
        this.setupPeriodicCleanup();

        return this.wss;
    }

    /**
     * Configura los eventos de un cliente
     */
    setupClientEvents(ws, clientInfo) {
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log(`📨 Mensaje recibido de ${clientInfo.id}:`, data.action);
                
                await this.handleMessage(ws, data, clientInfo);
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
                this.sendError(ws, 'Error procesando mensaje', error.message);
            }
        });

        ws.on('close', (code, reason) => {
            console.log(`👋 Cliente desconectado: ${clientInfo.id} - Código: ${code}`);
            this.clients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error(`❌ Error con cliente ${clientInfo.id}:`, error);
            this.clients.delete(ws);
        });

        // Configurar ping/pong para mantener conexión
        ws.on('pong', () => {
            ws.isAlive = true;
        });
    }

    /**
     * Maneja los mensajes entrantes
     */
    async handleMessage(ws, data, clientInfo) {
        const { action, ...params } = data;

        if (!action) {
            return this.sendError(ws, 'Acción requerida', 'El campo "action" es obligatorio');
        }

        const handler = this.messageHandlers[action];
        if (!handler) {
            return this.sendError(ws, 'Acción no válida', `La acción "${action}" no está soportada`);
        }

        try {
            await handler(ws, params, clientInfo);
        } catch (error) {
            console.error(`❌ Error en handler ${action}:`, error);
            this.sendError(ws, `Error en ${action}`, error.message);
        }
    }

    /**
     * Handler para consultar recibos pendientes
     */
    async handleConsultarRecibo(ws, params, clientInfo) {
        const { numeroCuenta } = params;

        if (!numeroCuenta) {
            return this.sendError(ws, 'Número de cuenta requerido', 'Debe proporcionar un número de cuenta');
        }

        try {
            const result = await reciboController.consultarRecibosPendientes(numeroCuenta);
            
            this.sendMessage(ws, {
                type: 'consultar_recibo_response',
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });

            // Broadcast a otros clientes si es necesario
            this.broadcastToOthers(ws, {
                type: 'recibo_consultado',
                numeroCuenta: numeroCuenta,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendError(ws, 'Error consultando recibo', error.message);
        }
    }

    /**
     * Handler para procesar pago
     */
    async handleProcesarPago(ws, params, clientInfo) {
        const { idRecibo, numeroCuenta, metodoPago } = params;

        if (!idRecibo || !numeroCuenta) {
            return this.sendError(ws, 'Datos incompletos', 'idRecibo y numeroCuenta son requeridos');
        }

        try {
            const result = await reciboController.procesarPago(idRecibo, numeroCuenta, metodoPago);
            
            this.sendMessage(ws, {
                type: 'procesar_pago_response',
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });

            // Broadcast a todos los clientes sobre el pago procesado
            this.broadcast({
                type: 'pago_procesado',
                idRecibo: idRecibo,
                numeroCuenta: numeroCuenta,
                monto: result.montoPagado,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendError(ws, 'Error procesando pago', error.message);
        }
    }

    /**
     * Handler para obtener recibo pagado
     */
    async handleObtenerRecibo(ws, params, clientInfo) {
        const { idRecibo, numeroCuenta } = params;

        if (!idRecibo || !numeroCuenta) {
            return this.sendError(ws, 'Datos incompletos', 'idRecibo y numeroCuenta son requeridos');
        }

        try {
            const result = await reciboController.obtenerReciboPagado(idRecibo, numeroCuenta);
            
            this.sendMessage(ws, {
                type: 'obtener_recibo_response',
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendError(ws, 'Error obteniendo recibo', error.message);
        }
    }

    /**
     * Handler para obtener saldo
     */
    async handleObtenerSaldo(ws, params, clientInfo) {
        const { numeroCuenta } = params;

        if (!numeroCuenta) {
            return this.sendError(ws, 'Número de cuenta requerido');
        }

        try {
            const result = await cuentaController.obtenerSaldo(numeroCuenta);
            
            this.sendMessage(ws, {
                type: 'obtener_saldo_response',
                success: true,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendError(ws, 'Error obteniendo saldo', error.message);
        }
    }

    /**
     * Handler para ping
     */
    async handlePing(ws, params, clientInfo) {
        this.sendMessage(ws, {
            type: 'pong',
            timestamp: new Date().toISOString(),
            clientId: clientInfo.id
        });
    }

    /**
     * Envía un mensaje a un cliente específico
     */
    sendMessage(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    /**
     * Envía un error a un cliente específico
     */
    sendError(ws, title, message = '') {
        this.sendMessage(ws, {
            type: 'error',
            error: {
                title: title,
                message: message,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Broadcast a todos los clientes conectados
     */
    broadcast(data) {
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    /**
     * Broadcast a todos menos al remitente
     */
    broadcastToOthers(sender, data) {
        this.wss.clients.forEach((client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    /**
     * Genera un ID único para el cliente
     */
    generateClientId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Configura limpieza periódica de conexiones muertas
     */
    setupPeriodicCleanup() {
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log('🧹 Cerrando conexión inactiva');
                    return ws.terminate();
                }

                ws.isAlive = false;
                ws.ping();
            });
        }, 30000); // Cada 30 segundos
    }

    /**
     * Obtiene estadísticas del servidor WebSocket
     */
    getStats() {
        return {
            totalClients: this.wss ? this.wss.clients.size : 0,
            connectedClients: Array.from(this.clients.values()).map(client => ({
                id: client.id,
                ip: client.ip,
                connectedAt: client.connectedAt,
                uptime: Date.now() - client.connectedAt.getTime()
            })),
            serverUptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Cierra el servidor WebSocket
     */
    close() {
        if (this.wss) {
            this.wss.close(() => {
                console.log('🔌 Servidor WebSocket cerrado');
            });
        }
    }
}

module.exports = new WebSocketService();