/**
 * Cliente WebSocket para el Sistema de Recibos Eléctricos
 * Maneja la comunicación en tiempo real con el servidor
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // 1 segundo inicial
        this.maxReconnectDelay = 30000; // 30 segundos máximo
        this.messageHandlers = new Map();
        this.connectionStatusElement = null;
        this.pendingRequests = new Map();
        this.requestId = 0;
        
        this.initializeConnectionStatus();
        this.setupEventHandlers();
    }

    /**
     * Inicializa el indicador de estado de conexión
     */
    initializeConnectionStatus() {
        // Crear elemento de estado si no existe
        if (!document.querySelector('.connection-status')) {
            const statusElement = document.createElement('div');
            statusElement.className = 'connection-status disconnected';
            statusElement.innerHTML = `
                <span class="status-indicator">●</span>
                <span class="status-text">Desconectado</span>
            `;
            document.body.appendChild(statusElement);
        }
        
        this.connectionStatusElement = document.querySelector('.connection-status');
    }

    /**
     * Configura los manejadores de eventos globales
     */
    setupEventHandlers() {
        // Reconectar cuando la página se vuelve visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !this.isConnected) {
                this.connect();
            }
        });

        // Reconectar cuando se recupera la conexión a internet
        window.addEventListener('online', () => {
            console.log('🌐 Conexión a internet recuperada');
            if (!this.isConnected) {
                this.connect();
            }
        });

        window.addEventListener('offline', () => {
            console.log('📴 Conexión a internet perdida');
            this.updateConnectionStatus('disconnected', 'Sin conexión a internet');
        });
    }

    /**
     * Establece conexión con el servidor WebSocket
     */
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        try {
            this.updateConnectionStatus('connecting', 'Conectando...');
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.hostname;
            const port = window.location.hostname === 'localhost' ? ':8080' : '';
            const wsUrl = `${protocol}//${host}${port}`;
            
            console.log(`🔌 Conectando a WebSocket: ${wsUrl}`);
            
            this.ws = new WebSocket(wsUrl);
            this.setupWebSocketEvents();
            
        } catch (error) {
            console.error('❌ Error conectando WebSocket:', error);
            this.handleConnectionError();
        }
    }

    /**
     * Configura los eventos del WebSocket
     */
    setupWebSocketEvents() {
        this.ws.onopen = (event) => {
            console.log('✅ WebSocket conectado exitosamente');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
            this.updateConnectionStatus('connected', 'Conectado');
            
            // Reenviar mensajes pendientes
            this.resendPendingRequests();
            
            // Emitir evento personalizado
            this.emit('connected', event);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Mensaje recibido:', data.type);
                this.handleMessage(data);
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('🔌 WebSocket desconectado:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Desconectado');
            
            // Emitir evento personalizado
            this.emit('disconnected', event);
            
            // Intentar reconectar si no fue cierre intencional
            if (event.code !== 1000) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('❌ Error en WebSocket:', error);
            this.emit('error', error);
        };
    }

    /**
     * Maneja los mensajes entrantes del servidor
     */
    handleMessage(data) {
        const { type, requestId } = data;

        // Manejar respuesta a solicitud específica
        if (requestId && this.pendingRequests.has(requestId)) {
            const request = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);
            
            if (request.resolve) {
                request.resolve(data);
            }
            return;
        }

        // Manejar mensajes generales
        switch (type) {
            case 'connection_established':
                console.log('🎉 Conexión establecida:', data.message);
                break;
                
            case 'pong':
                console.log('🏓 Pong recibido');
                break;
                
            case 'error':
                console.error('❌ Error del servidor:', data.error);
                this.showNotification('error', data.error.title, data.error.message);
                break;
                
            case 'pago_procesado':
                this.showNotification('success', 'Pago Procesado', 
                    `Se procesó un pago por Q${data.monto} para la cuenta ${data.numeroCuenta}`);
                break;
                
            case 'recibo_consultado':
                console.log('📄 Recibo consultado:', data.numeroCuenta);
                break;
                
            default:
                // Verificar si hay manejador registrado para este tipo
                if (this.messageHandlers.has(type)) {
                    const handler = this.messageHandlers.get(type);
                    handler(data);
                } else {
                    console.log('📝 Mensaje no manejado:', type, data);
                }
        }
    }

    /**
     * Envía un mensaje al servidor
     */
    send(action, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('WebSocket no está conectado'));
                return;
            }

            const requestId = ++this.requestId;
            const message = {
                action,
                requestId,
                ...params
            };

            // Guardar la promesa para resolver cuando llegue la respuesta
            this.pendingRequests.set(requestId, { resolve, reject, message, timestamp: Date.now() });

            try {
                this.ws.send(JSON.stringify(message));
                console.log(`📤 Enviado: ${action}`, params);
                
                // Timeout para requests
                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error('Timeout: El servidor no respondió'));
                    }
                }, 30000); // 30 segundos timeout
                
            } catch (error) {
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    /**
     * Registra un manejador para un tipo de mensaje específico
     */
    on(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }

    /**
     * Emite un evento personalizado
     */
    emit(eventName, data) {
        const event = new CustomEvent(`ws_${eventName}`, { detail: data });
        document.dispatchEvent(event);
    }

    /**
     * Programa un intento de reconexión
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Máximo de intentos de reconexión alcanzado');
            this.updateConnectionStatus('disconnected', 'Conexión perdida');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.updateConnectionStatus('connecting', `Reconectando... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Reenvía las solicitudes pendientes después de reconectar
     */
    resendPendingRequests() {
        const currentTime = Date.now();
        const expiredRequests = [];
        
        for (const [requestId, request] of this.pendingRequests) {
            // Verificar si la solicitud ha expirado (más de 60 segundos)
            if (currentTime - request.timestamp > 60000) {
                expiredRequests.push(requestId);
                continue;
            }
            
            // Reenviar solicitud
            try {
                this.ws.send(JSON.stringify(request.message));
                console.log(`📤 Reenviado: ${request.message.action}`);
            } catch (error) {
                console.error('❌ Error reenviando solicitud:', error);
                request.reject(error);
                expiredRequests.push(requestId);
            }
        }
        
        // Limpiar solicitudes expiradas
        expiredRequests.forEach(id => {
            const request = this.pendingRequests.get(id);
            if (request && request.reject) {
                request.reject(new Error('Solicitud expirada después de reconexión'));
            }
            this.pendingRequests.delete(id);
        });
    }

    /**
     * Actualiza el estado visual de la conexión
     */
    updateConnectionStatus(status, message) {
        if (!this.connectionStatusElement) return;

        this.connectionStatusElement.className = `connection-status ${status}`;
        
        const statusText = this.connectionStatusElement.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = message;
        }

        // Actualizar el indicador visual
        const indicator = this.connectionStatusElement.querySelector('.status-indicator');
        if (indicator) {
            switch (status) {
                case 'connected':
                    indicator.style.color = '#10b981';
                    break;
                case 'connecting':
                    indicator.style.color = '#f59e0b';
                    break;
                case 'disconnected':
                default:
                    indicator.style.color = '#ef4444';
                    break;
            }
        }
    }

    /**
     * Muestra una notificación al usuario
     */
    showNotification(type, title, message) {
        // Remover notificación anterior si existe
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Crear nueva notificación
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} notification`;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;
        
        notification.innerHTML = `
            <div>
                <strong>${title}</strong>
                ${message ? `<br><span style="font-size: 0.9em;">${message}</span>` : ''}
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                font-size: 1.2em;
                cursor: pointer;
                margin-left: 10px;
            ">×</button>
        `;

        document.body.appendChild(notification);

        // Auto-remover después de 5 segundos
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    /**
     * Maneja errores de conexión
     */
    handleConnectionError() {
        this.isConnected = false;
        this.updateConnectionStatus('disconnected', 'Error de conexión');
        this.scheduleReconnect();
    }

    /**
     * Envía un ping al servidor
     */
    ping() {
        if (this.isConnected) {
            try {
                this.ws.send(JSON.stringify({ action: 'ping' }));
                console.log('🏓 Ping enviado');
            } catch (error) {
                console.error('❌ Error enviando ping:', error);
            }
        }
    }

    /**
     * Cierra la conexión WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Desconexión intencional');
            this.ws = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus('disconnected', 'Desconectado');
    }

    /**
     * Verifica si está conectado
     */
    getConnectionState() {
        return {
            isConnected: this.isConnected,
            readyState: this.ws ? this.ws.readyState : WebSocket.CLOSED,
            reconnectAttempts: this.reconnectAttempts,
            pendingRequests: this.pendingRequests.size
        };
    }

    /**
     * Métodos específicos para las funcionalidades del sistema
     */

    async consultarRecibo(numeroCuenta) {
        return this.send('consultar_recibo', { numeroCuenta });
    }

    async procesarPago(idRecibo, numeroCuenta, metodoPago = 'Saldo en cuenta') {
        return this.send('procesar_pago', { idRecibo, numeroCuenta, metodoPago });
    }

    async obtenerRecibo(idRecibo, numeroCuenta) {
        return this.send('obtener_recibo', { idRecibo, numeroCuenta });
    }

    async obtenerSaldo(numeroCuenta) {
        return this.send('obtener_saldo', { numeroCuenta });
    }
}

// Crear instancia global del cliente WebSocket
const wsClient = new WebSocketClient();

// Auto-conectar cuando la página se carga
document.addEventListener('DOMContentLoaded', () => {
    wsClient.connect();
});

// Configurar ping periódico para mantener la conexión viva
setInterval(() => {
    if (wsClient.isConnected) {
        wsClient.ping();
    }
}, 30000); // Cada 30 segundos

// Exportar para uso global
window.wsClient = wsClient;