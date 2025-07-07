/**
 * JavaScript para la página de consulta de recibos
 */

class ConsultaManager {
    constructor() {
        this.elementos = {
            form: document.getElementById('consultaForm'),
            numeroCuenta: document.getElementById('numeroCuenta'),
            consultarBtn: document.getElementById('consultarBtn'),
            resultadosContainer: document.getElementById('resultadosContainer'),
            infoCuentaContent: document.getElementById('infoCuentaContent'),
            resumenContent: document.getElementById('resumenContent'),
            recibosContent: document.getElementById('recibosContent'),
            nuevaConsultaBtn: document.getElementById('nuevaConsultaBtn'),
            irPagoBtn: document.getElementById('irPagoBtn'),
            mensajesContainer: document.getElementById('mensajesContainer'),
            loadingOverlay: document.getElementById('loadingOverlay')
        };

        this.currentCuenta = null;
        this.currentRecibos = [];
        
        this.inicializar();
    }

    /**
     * Inicializa los event listeners y configuraciones
     */
    inicializar() {
        // Event listeners del formulario
        this.elementos.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.elementos.numeroCuenta.addEventListener('input', (e) => this.handleInputChange(e));
        this.elementos.nuevaConsultaBtn.addEventListener('click', () => this.nuevaConsulta());

        // Event listeners de WebSocket
        document.addEventListener('ws_connected', () => {
            this.mostrarMensaje('success', 'Conectado', 'Conexión establecida correctamente');
        });

        document.addEventListener('ws_disconnected', () => {
            this.mostrarMensaje('warning', 'Desconectado', 'Se perdió la conexión. Reintentando...');
        });

        // Autocompletar desde localStorage
        this.cargarUltimaCuenta();

        // Focus automático en el campo de entrada
        this.elementos.numeroCuenta.focus();
    }

    /**
     * Maneja el envío del formulario
     */
    async handleSubmit(e) {
        e.preventDefault();
        
        const numeroCuenta = this.elementos.numeroCuenta.value.trim().toUpperCase();
        
        if (!numeroCuenta) {
            this.mostrarMensaje('error', 'Error', 'Por favor ingresa un número de cuenta');
            return;
        }

        await this.consultarRecibos(numeroCuenta);
    }

    /**
     * Maneja cambios en el input
     */
    handleInputChange(e) {
        const valor = e.target.value.trim();
        e.target.value = valor.toUpperCase();
        
        // Validación en tiempo real
        if (valor.length > 0) {
            e.target.classList.remove('invalid');
        }
    }

    /**
     * Consulta los recibos pendientes
     */
    async consultarRecibos(numeroCuenta) {
        try {
            this.mostrarLoading(true);
            this.deshabilitarFormulario(true);
            
            console.log(`🔍 Consultando recibos para cuenta: ${numeroCuenta}`);
            
            // Verificar conexión WebSocket
            if (!wsClient.isConnected) {
                throw new Error('No hay conexión con el servidor. Por favor espera un momento.');
            }

            // Realizar consulta
            const response = await wsClient.consultarRecibo(numeroCuenta);
            
            if (response.success) {
                this.currentCuenta = numeroCuenta;
                this.currentRecibos = response.data.recibos || [];
                
                // Guardar en localStorage para próxima vez
                localStorage.setItem('ultimaCuenta', numeroCuenta);
                
                // Mostrar resultados
                this.mostrarResultados(response.data);
                
                this.mostrarMensaje('success', 'Consulta Exitosa', 
                    `Se encontraron ${this.currentRecibos.length} recibos pendientes`);
                    
            } else {
                throw new Error(response.message || 'Error consultando recibos');
            }
            
        } catch (error) {
            console.error('❌ Error en consulta:', error);
            this.mostrarMensaje('error', 'Error en la Consulta', error.message);
            this.ocultarResultados();
            
        } finally {
            this.mostrarLoading(false);
            this.deshabilitarFormulario(false);
        }
    }

    /**
     * Muestra los resultados de la consulta
     */
    mostrarResultados(data) {
        // Mostrar información de la cuenta
        this.mostrarInfoCuenta(data);
        
        // Mostrar resumen
        this.mostrarResumen(data);
        
        // Mostrar lista de recibos
        this.mostrarListaRecibos(data.recibos);
        
        // Configurar botón de pago
        this.configurarBotonPago(data.numeroCuenta);
        
        // Mostrar container de resultados
        this.elementos.resultadosContainer.classList.remove('hidden');
        
        // Scroll suave hacia los resultados
        this.elementos.resultadosContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    /**
     * Muestra la información de la cuenta
     */
    mostrarInfoCuenta(data) {
        const html = `
            <div class="recibo-details">
                <div class="detail-item">
                    <span class="detail-label">Número de Cuenta</span>
                    <span class="detail-value font-bold">${data.numeroCuenta}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Saldo Disponible</span>
                    <span class="detail-value font-bold text-success">Q${data.saldoDisponible.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Estado</span>
                    <span class="detail-value">
                        <span class="estado-${data.puedePagearTodos ? 'pagado' : 'pendiente'}">
                            ${data.puedePagearTodos ? 'Saldo Suficiente' : 'Saldo Insuficiente'}
                        </span>
                    </span>
                </div>
            </div>
        `;
        
        this.elementos.infoCuentaContent.innerHTML = html;
    }

    /**
     * Muestra el resumen de recibos
     */
    mostrarResumen(data) {
        const html = `
            <div class="recibo-details">
                <div class="detail-item">
                    <span class="detail-label">Total de Recibos</span>
                    <span class="detail-value font-bold">${data.totalRecibos}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Monto Total</span>
                    <span class="detail-value font-bold text-warning">Q${data.montoTotal.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Recibos Urgentes</span>
                    <span class="detail-value font-bold ${data.recibosMasUrgentes.length > 0 ? 'text-error' : 'text-success'}">
                        ${data.recibosMasUrgentes.length}
                    </span>
                </div>
            </div>
            
            ${data.recibosMasUrgentes.length > 0 ? `
                <div class="alert alert-warning mt-lg">
                    <strong>⚠️ Atención:</strong> Tienes ${data.recibosMasUrgentes.length} recibo(s) próximo(s) a vencer.
                </div>
            ` : ''}
            
            ${!data.puedePagearTodos ? `
                <div class="alert alert-error mt-lg">
                    <strong>❌ Saldo Insuficiente:</strong> 
                    Necesitas Q${(data.montoTotal - data.saldoDisponible).toFixed(2)} adicionales para pagar todos los recibos.
                </div>
            ` : `
                <div class="alert alert-success mt-lg">
                    <strong>✅ Saldo Suficiente:</strong> 
                    Puedes pagar todos tus recibos pendientes.
                </div>
            `}
        `;
        
        this.elementos.resumenContent.innerHTML = html;
    }

    /**
     * Muestra la lista de recibos
     */
    mostrarListaRecibos(recibos) {
        if (!recibos || recibos.length === 0) {
            this.elementos.recibosContent.innerHTML = `
                <div class="alert alert-info text-center">
                    <h4>🎉 ¡Excelente!</h4>
                    <p>No tienes recibos pendientes en este momento.</p>
                </div>
            `;
            return;
        }

        const recibosHtml = recibos.map(recibo => this.generarHtmlRecibo(recibo)).join('');
        this.elementos.recibosContent.innerHTML = recibosHtml;
    }

    /**
     * Genera el HTML para un recibo individual
     */
    generarHtmlRecibo(recibo) {
        const fechaVencimiento = new Date(recibo.fechaVencimiento).toLocaleDateString('es-GT');
        const fechaEmision = new Date(recibo.fecha).toLocaleDateString('es-GT');
        const esUrgente = recibo.esUrgente;
        
        return `
            <div class="recibo-item ${esUrgente ? 'urgente' : ''}" data-recibo-id="${recibo.idRecibo}">
                <div class="recibo-header">
                    <div>
                        <span class="recibo-id">Recibo #${recibo.idRecibo}</span>
                        <span class="estado-${recibo.estado.toLowerCase()}">${recibo.estado.toUpperCase()}</span>
                        ${esUrgente ? '<span class="estado-vencido">URGENTE</span>' : ''}
                    </div>
                    <div class="recibo-monto">Q${recibo.monto.toFixed(2)}</div>
                </div>
                
                <div class="recibo-details">
                    <div class="detail-item">
                        <span class="detail-label">Concepto</span>
                        <span class="detail-value">${recibo.conceptoPago}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Período</span>
                        <span class="detail-value">${recibo.periodoFacturacion}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fecha Emisión</span>
                        <span class="detail-value">${fechaEmision}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fecha Vencimiento</span>
                        <span class="detail-value ${esUrgente ? 'text-error font-bold' : ''}">${fechaVencimiento}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Consumo</span>
                        <span class="detail-value">${recibo.consumoKwh.toFixed(2)} kWh</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Estado Vencimiento</span>
                        <span class="detail-value">
                            <span class="estado-${recibo.estadoVencimiento === 'Vencido' ? 'vencido' : 
                                recibo.estadoVencimiento === 'Por vencer' ? 'pendiente' : 'pagado'}">
                                ${recibo.estadoVencimiento}
                            </span>
                        </span>
                    </div>
                </div>
                
                ${esUrgente ? `
                    <div class="alert alert-warning mt-md mb-0">
                        <strong>⚠️ Recibo Urgente:</strong> 
                        ${recibo.diasParaVencer >= 0 ? 
                            `Vence en ${recibo.diasParaVencer} día(s)` : 
                            `Venció hace ${Math.abs(recibo.diasParaVencer)} día(s)`
                        }
                    </div>
                ` : ''}
                
                <div class="mt-lg text-center">
                    <button class="btn btn-primary" onclick="irAPagar('${recibo.idRecibo}', '${recibo.numeroCuenta}')">
                        💳 Pagar Este Recibo
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Configura el botón de pago principal
     */
    configurarBotonPago(numeroCuenta) {
        const url = `/pago.html?cuenta=${encodeURIComponent(numeroCuenta)}`;
        this.elementos.irPagoBtn.href = url;
    }

    /**
     * Oculta los resultados
     */
    ocultarResultados() {
        this.elementos.resultadosContainer.classList.add('hidden');
    }

    /**
     * Realiza una nueva consulta
     */
    nuevaConsulta() {
        this.elementos.numeroCuenta.value = '';
        this.elementos.numeroCuenta.focus();
        this.ocultarResultados();
        this.limpiarMensajes();
        this.currentCuenta = null;
        this.currentRecibos = [];
    }

    /**
     * Carga la última cuenta consultada
     */
    cargarUltimaCuenta() {
        const ultimaCuenta = localStorage.getItem('ultimaCuenta');
        if (ultimaCuenta) {
            this.elementos.numeroCuenta.value = ultimaCuenta;
        }
    }

    /**
     * Muestra/oculta el loading
     */
    mostrarLoading(mostrar) {
        if (mostrar) {
            this.elementos.loadingOverlay.classList.remove('hidden');
            this.elementos.consultarBtn.querySelector('.btn-text').classList.add('hidden');
            this.elementos.consultarBtn.querySelector('.spinner').classList.remove('hidden');
        } else {
            this.elementos.loadingOverlay.classList.add('hidden');
            this.elementos.consultarBtn.querySelector('.btn-text').classList.remove('hidden');
            this.elementos.consultarBtn.querySelector('.spinner').classList.add('hidden');
        }
    }

    /**
     * Habilita/deshabilita el formulario
     */
    deshabilitarFormulario(deshabilitar) {
        this.elementos.numeroCuenta.disabled = deshabilitar;
        this.elementos.consultarBtn.disabled = deshabilitar;
    }

    /**
     * Muestra un mensaje al usuario
     */
    mostrarMensaje(tipo, titulo, mensaje) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${tipo} animate-fade-in`;
        alertDiv.innerHTML = `
            <div>
                <strong>${titulo}</strong>
                ${mensaje ? `<br><span style="font-size: 0.9em;">${mensaje}</span>` : ''}
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                font-size: 1.2em;
                cursor: pointer;
                margin-left: 10px;
                color: inherit;
            ">×</button>
        `;

        // Limpiar mensajes anteriores
        this.limpiarMensajes();
        
        // Agregar nuevo mensaje
        this.elementos.mensajesContainer.appendChild(alertDiv);

        // Auto-remover después de 5 segundos para mensajes de éxito
        if (tipo === 'success') {
            setTimeout(() => {
                if (alertDiv.parentElement) {
                    alertDiv.remove();
                }
            }, 5000);
        }
    }

    /**
     * Limpia todos los mensajes
     */
    limpiarMensajes() {
        this.elementos.mensajesContainer.innerHTML = '';
    }
}

/**
 * Función global para ir a pagar un recibo específico
 */
function irAPagar(idRecibo, numeroCuenta) {
    const url = `/pago.html?recibo=${encodeURIComponent(idRecibo)}&cuenta=${encodeURIComponent(numeroCuenta)}`;
    window.location.href = url;
}

/**
 * Función global para formatear moneda
 */
function formatearMoneda(monto) {
    return new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        minimumFractionDigits: 2
    }).format(monto);
}

/**
 * Función global para formatear fechas
 */
function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-GT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    const consultaManager = new ConsultaManager();
    
    // Hacer disponible globalmente para debugging
    window.consultaManager = consultaManager;
    
    // Verificar si hay parámetros en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const cuentaParam = urlParams.get('cuenta');
    
    if (cuentaParam) {
        document.getElementById('numeroCuenta').value = cuentaParam.toUpperCase();
        // Auto-consultar después de un pequeño delay
        setTimeout(() => {
            consultaManager.consultarRecibos(cuentaParam.toUpperCase());
        }, 1000);
    }
});

// Manejar teclas de acceso rápido
document.addEventListener('keydown', (e) => {
    // Enter en cualquier lugar para enviar formulario
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const form = document.getElementById('consultaForm');
        if (form && !document.querySelector('.loading-overlay:not(.hidden)')) {
            e.preventDefault();
            form.dispatchEvent(new Event('submit'));
        }
    }
    
    // Escape para nueva consulta
    if (e.key === 'Escape') {
        const nuevaConsultaBtn = document.getElementById('nuevaConsultaBtn');
        if (nuevaConsultaBtn && !nuevaConsultaBtn.closest('.hidden')) {
            nuevaConsultaBtn.click();
        }
    }
    
    // F5 para recargar (prevenir si hay datos)
    if (e.key === 'F5' && window.consultaManager && window.consultaManager.currentRecibos.length > 0) {
        if (!confirm('¿Estás seguro de que quieres recargar la página? Se perderán los resultados de la consulta.')) {
            e.preventDefault();
        }
    }
});