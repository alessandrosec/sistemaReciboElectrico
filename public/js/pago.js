/**
 * JavaScript para la página de pago de recibos
 */

class PagoManager {
    constructor() {
        this.elementos = {
            busquedaForm: document.getElementById('busquedaForm'),
            numeroCuentaPago: document.getElementById('numeroCuentaPago'),
            buscarBtn: document.getElementById('buscarBtn'),
            saldoCard: document.getElementById('saldoCard'),
            saldoContent: document.getElementById('saldoContent'),
            seleccionCard: document.getElementById('seleccionCard'),
            recibosDisponibles: document.getElementById('recibosDisponibles'),
            resumenSeleccion: document.getElementById('resumenSeleccion'),
            confirmacionCard: document.getElementById('confirmacionCard'),
            detallesPago: document.getElementById('detallesPago'),
            confirmacionForm: document.getElementById('confirmacionForm'),
            metodoPago: document.getElementById('metodoPago'),
            confirmarPago: document.getElementById('confirmarPago'),
            procesarPagoBtn: document.getElementById('procesarPagoBtn'),
            cancelarPagoBtn: document.getElementById('cancelarPagoBtn'),
            resultadoCard: document.getElementById('resultadoCard'),
            resultadoContent: document.getElementById('resultadoContent'),
            mensajesContainer: document.getElementById('mensajesContainer'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            loadingText: document.getElementById('loadingText'),
            modalConfirmacion: document.getElementById('modalConfirmacion'),
            modalContent: document.getElementById('modalContent'),
            modalCancelar: document.getElementById('modalCancelar'),
            modalConfirmar: document.getElementById('modalConfirmar')
        };

        this.cuentaActual = null;
        this.recibosDisponibles = [];
        this.recibosSeleccionados = new Set();
        this.saldoDisponible = 0;
        
        this.inicializar();
    }

    /**
     * Inicializa los event listeners
     */
    inicializar() {
        // Event listeners del formulario de búsqueda
        this.elementos.busquedaForm.addEventListener('submit', (e) => this.handleBusqueda(e));
        this.elementos.numeroCuentaPago.addEventListener('input', (e) => this.handleInputChange(e));

        // Event listeners de confirmación
        this.elementos.confirmacionForm.addEventListener('submit', (e) => this.handleConfirmacion(e));
        this.elementos.confirmarPago.addEventListener('change', (e) => this.toggleBotonProcesar());
        this.elementos.cancelarPagoBtn.addEventListener('click', () => this.cancelarPago());

        // Event listeners del modal
        this.elementos.modalCancelar.addEventListener('click', () => this.cerrarModal());
        this.elementos.modalConfirmar.addEventListener('click', () => this.confirmarPagoFinal());

        // Event listeners de WebSocket
        document.addEventListener('ws_connected', () => {
            this.mostrarMensaje('success', 'Conectado', 'Conexión establecida correctamente');
        });

        document.addEventListener('ws_disconnected', () => {
            this.mostrarMensaje('warning', 'Desconectado', 'Se perdió la conexión. Reintentando...');
        });

        // Procesar parámetros de URL
        this.procesarParametrosURL();

        // Focus automático
        this.elementos.numeroCuentaPago.focus();
    }

    /**
     * Procesa los parámetros de la URL
     */
    procesarParametrosURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const cuenta = urlParams.get('cuenta');
        const recibo = urlParams.get('recibo');

        if (cuenta) {
            this.elementos.numeroCuentaPago.value = cuenta.toUpperCase();
            
            // Auto-buscar después de un delay
            setTimeout(() => {
                this.buscarRecibos(cuenta.toUpperCase()).then(() => {
                    // Si también hay un recibo específico, seleccionarlo
                    if (recibo) {
                        this.seleccionarReciboEspecifico(recibo);
                    }
                });
            }, 1000);
        }
    }

    /**
     * Maneja el cambio en el input
     */
    handleInputChange(e) {
        const valor = e.target.value.trim();
        e.target.value = valor.toUpperCase();
    }

    /**
     * Maneja la búsqueda de recibos
     */
    async handleBusqueda(e) {
        e.preventDefault();
        
        const numeroCuenta = this.elementos.numeroCuentaPago.value.trim();
        
        if (!numeroCuenta) {
            this.mostrarMensaje('error', 'Error', 'Por favor ingresa un número de cuenta');
            return;
        }

        await this.buscarRecibos(numeroCuenta);
    }

    /**
     * Busca los recibos disponibles para pago
     */
    async buscarRecibos(numeroCuenta) {
        try {
            this.mostrarLoading(true, 'Buscando recibos...');
            this.deshabilitarFormulario(true);
            this.ocultarTarjetas(); // Ocultar todas las tarjetas al inicio de una nueva búsqueda
            this.limpiarMensajes(); // Limpiar mensajes anteriores
            this.recibosSeleccionados.clear(); // Limpiar selección anterior
            this.toggleBotonProcesar(); // Deshabilitar botón de procesar si no hay selección
            
            console.log(`🔍 Buscando recibos para cuenta: ${numeroCuenta}`);
            
            // Asumiendo que wsClient está definido globalmente como indicaste
            if (typeof wsClient === 'undefined' || !wsClient.isConnected) {
                throw new Error('No hay conexión con el servidor. Por favor espera un momento.');
            }

            // Consultar recibos pendientes
            const response = await wsClient.consultarRecibo(numeroCuenta);
            
            if (response.success) {
                this.cuentaActual = numeroCuenta;
                this.recibosDisponibles = response.data.recibos || [];
                this.saldoDisponible = response.data.saldoDisponible || 0;
                
                // Mostrar información
                this.mostrarInformacionSaldo(response.data);
                this.mostrarRecibosDisponibles(this.recibosDisponibles);
                
                if (this.recibosDisponibles.length === 0) {
                    this.mostrarMensaje('info', 'Sin Recibos Pendientes', 
                        '¡Excelente! No tienes recibos pendientes de pago para esta cuenta.');
                } else {
                    this.mostrarMensaje('success', 'Recibos Encontrados', 
                        `Se encontraron ${this.recibosDisponibles.length} recibos disponibles para pago`);
                }
                
            } else {
                throw new Error(response.message || 'Error consultando recibos');
            }
            
        } catch (error) {
            console.error('❌ Error en búsqueda:', error);
            this.mostrarMensaje('error', 'Error en la Búsqueda', error.message);
            this.ocultarTarjetas();
            
        } finally {
            this.mostrarLoading(false);
            this.deshabilitarFormulario(false);
        }
    }

    /**
     * Muestra la información de saldo
     */
    mostrarInformacionSaldo(data) {
        const html = `
            <div class="recibo-details">
                <div class="detail-item">
                    <span class="detail-label">Número de Cuenta</span>
                    <span class="detail-value font-bold">${data.numeroCuenta}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Saldo Disponible</span>
                    <span class="detail-value font-bold text-success">Q${data.saldoDisponible ? data.saldoDisponible.toFixed(2) : '0.00'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Recibos Pendientes</span>
                    <span class="detail-value font-bold">${data.totalRecibos || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Monto Total Pendiente</span>
                    <span class="detail-value font-bold text-warning">Q${data.montoTotal ? data.montoTotal.toFixed(2) : '0.00'}</span>
                </div>
            </div>
            
            ${!data.puedePagearTodos ? `
                <div class="alert alert-warning mt-lg">
                    <strong>⚠️ Saldo Insuficiente:</strong> 
                    Necesitas Q${(data.montoTotal - data.saldoDisponible).toFixed(2)} adicionales para pagar todos los recibos.
                    Puedes pagar algunos recibos individualmente.
                </div>
            ` : `
                <div class="alert alert-success mt-lg">
                    <strong>✅ Saldo Suficiente:</strong> 
                    Puedes pagar todos tus recibos pendientes.
                </div>
            `}
        `;
        
        this.elementos.saldoContent.innerHTML = html;
        this.elementos.saldoCard.classList.remove('hidden');
    }

    /**
     * Muestra los recibos disponibles para pago
     */
    mostrarRecibosDisponibles(recibos) {
        if (!recibos || recibos.length === 0) {
            this.elementos.recibosDisponibles.innerHTML = `
                <div class="alert alert-info text-center">
                    <h4>🎉 ¡Excelente!</h4>
                    <p>No tienes recibos pendientes para pagar en este momento.</p>
                </div>
            `;
            this.elementos.seleccionCard.classList.remove('hidden');
            return;
        }

        const recibosHtml = recibos.map(recibo => this.generarHtmlReciboSeleccionable(recibo)).join('');
        
        this.elementos.recibosDisponibles.innerHTML = `
            <div class="mb-lg text-center">
                <button class="btn btn-secondary" onclick="pagoManager.seleccionarTodos()">
                    ✅ Seleccionar Todos
                </button>
                <button class="btn btn-secondary" onclick="pagoManager.deseleccionarTodos()">
                    ❌ Deseleccionar Todos
                </button>
            </div>
            ${recibosHtml}
        `;
        
        this.elementos.seleccionCard.classList.remove('hidden');
    }

    /**
     * Genera HTML para un recibo seleccionable
     */
    generarHtmlReciboSeleccionable(recibo) {
        const fechaVencimiento = new Date(recibo.fechaVencimiento).toLocaleDateString('es-GT');
        // Asegúrate de que `recibo.monto` es un número antes de la comparación
        const puedePagar = this.saldoDisponible >= recibo.monto; 
        const isSelected = this.recibosSeleccionados.has(recibo.idRecibo.toString());
        
        return `
            <div class="recibo-item ${recibo.esUrgente ? 'urgente' : ''}" data-recibo-id="${recibo.idRecibo}">
                <div class="recibo-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <input 
                            type="checkbox" 
                            id="recibo_${recibo.idRecibo}" 
                            data-recibo-id="${recibo.idRecibo}"
                            data-monto="${recibo.monto}"
                            onchange="pagoManager.toggleSeleccion(this)"
                            ${!puedePagar ? 'disabled title="Saldo insuficiente"' : ''}
                            ${isSelected ? 'checked' : ''}
                            style="transform: scale(1.2);"
                        >
                        <label for="recibo_${recibo.idRecibo}" style="cursor: pointer;">
                            <span class="recibo-id">Recibo #${recibo.idRecibo}</span>
                            <span class="estado-${recibo.estado.toLowerCase()}">${recibo.estado.toUpperCase()}</span>
                            ${recibo.esUrgente ? '<span class="estado-vencido">URGENTE</span>' : ''}
                        </label>
                    </div>
                    <div class="recibo-monto ${!puedePagar ? 'text-error' : ''}">
                        Q${recibo.monto ? recibo.monto.toFixed(2) : '0.00'}
                        ${!puedePagar ? '<br><small>Saldo insuficiente</small>' : ''}
                    </div>
                </div>
                
                <div class="recibo-details">
                    <div class="detail-item">
                        <span class="detail-label">Concepto</span>
                        <span class="detail-value">${recibo.conceptoPago || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Período</span>
                        <span class="detail-value">${recibo.periodoFacturacion || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Vencimiento</span>
                        <span class="detail-value ${recibo.esUrgente ? 'text-error font-bold' : ''}">${fechaVencimiento}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Consumo</span>
                        <span class="detail-value">${recibo.consumoKwh ? recibo.consumoKwh.toFixed(2) : '0.00'} kWh</span>
                    </div>
                </div>
                
                ${recibo.esUrgente ? `
                    <div class="alert alert-warning mt-md mb-0">
                        <strong>⚠️ Recibo Urgente:</strong> 
                        ${recibo.diasParaVencer !== undefined ? 
                            (recibo.diasParaVencer >= 0 ? 
                            `Vence en ${recibo.diasParaVencer} día(s)` : 
                            `Venció hace ${Math.abs(recibo.diasParaVencer)} día(s)`) : ''
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Maneja la selección/deselección de recibos
     */
    toggleSeleccion(checkbox) {
        const reciboId = checkbox.dataset.reciboId;
        const monto = parseFloat(checkbox.dataset.monto);
        
        if (checkbox.checked) {
            let montoTotalSeleccionado = 0;
            // Recorrer el Set para sumar los montos de los recibos ya seleccionados
            for (const id of this.recibosSeleccionados) {
                const recibo = this.recibosDisponibles.find(r => r.idRecibo.toString() === id);
                if (recibo) {
                    montoTotalSeleccionado += recibo.monto;
                }
            }
            
            if (montoTotalSeleccionado + monto > this.saldoDisponible) {
                checkbox.checked = false;
                this.mostrarMensaje('warning', 'Saldo Insuficiente', 
                    'No tienes saldo suficiente para pagar este recibo junto con los otros seleccionados');
                return;
            }
            
            this.recibosSeleccionados.add(reciboId);
        } else {
            this.recibosSeleccionados.delete(reciboId);
        }
        
        this.actualizarResumenSeleccion();
    }

    /**
     * Actualiza la sección de resumen de selección y muestra/oculta la confirmación.
     * Este era el bloque que contenía código fuera de contexto en tu versión original.
     */
    actualizarResumenSeleccion() {
        const numSeleccionados = this.recibosSeleccionados.size;
        
        if (numSeleccionados > 0) {
            const recibosSeleccionadosData = Array.from(this.recibosSeleccionados).map(id => {
                return this.recibosDisponibles.find(r => r.idRecibo.toString() === id);
            }).filter(Boolean); // Filtrar por recibos encontrados

            const totalSeleccionado = recibosSeleccionadosData.reduce((sum, recibo) => sum + recibo.monto, 0);
            const saldoRestante = this.saldoDisponible - totalSeleccionado;

            let html = `
                <div class="recibo-details mb-md">
                    <div class="detail-item">
                        <span class="detail-label">Recibos Seleccionados</span>
                        <span class="detail-value font-bold">${numSeleccionados}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Monto Seleccionado</span>
                        <span class="detail-value font-bold text-warning">Q${totalSeleccionado.toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Saldo Restante</span>
                        <span class="detail-value font-bold ${saldoRestante < 0 ? 'text-error' : 'text-success'}">Q${saldoRestante.toFixed(2)}</span>
                    </div>
                </div>
            `;
            this.elementos.resumenSeleccion.innerHTML = html;
            this.elementos.resumenSeleccion.style.display = 'block';
            this.mostrarConfirmacion(); // Muestra la sección de confirmación
            this.toggleBotonProcesar(); // Actualiza el estado del botón de procesar
        } else {
            this.elementos.resumenSeleccion.innerHTML = '';
            this.elementos.resumenSeleccion.style.display = 'none';
            this.ocultarConfirmacion();
            this.toggleBotonProcesar(); // Deshabilita el botón si no hay selección
        }
    }

    /**
     * Selecciona todos los recibos posibles
     */
    seleccionarTodos() {
        let montoAcumulado = 0;
        const checkboxes = document.querySelectorAll('#recibosDisponibles input[type="checkbox"]'); // Más específico
        this.recibosSeleccionados.clear(); // Limpiar antes de seleccionar todos

        checkboxes.forEach(checkbox => {
            if (!checkbox.disabled) { // Solo si no está deshabilitado por saldo
                const monto = parseFloat(checkbox.dataset.monto);
                // Aquí la lógica debe ser si el saldo actual puede cubrir este recibo en particular
                // o si el monto acumulado + este recibo no excede el saldo.
                // Ajustamos para que solo seleccione si el saldo actual del usuario es suficiente
                // para este recibo. La lógica de saldo acumulado se maneja en toggleSeleccion.
                if (this.saldoDisponible >= monto) { // Verificar si el saldo disponible permite pagar *este* recibo
                     // Para seleccionar todos, nos basamos en el saldo total.
                    // Si ya tengo seleccionados algunos, y al añadir este me paso, no lo añado.
                    // Pero para "seleccionar todos", la lógica es: si mi saldo disponible es
                    // mayor o igual al monto de ESTE recibo, lo selecciono.
                    // Luego, actualizar el resumen se encargará de mostrar si el total excede.
                    
                    // Lógica para "Seleccionar Todos" de forma inteligente:
                    // Sólo selecciona los recibos que *individualmente* pueden ser pagados
                    // con el saldo disponible y los añade al Set.
                    // El total acumulado se verifica en `actualizarResumenSeleccion`.
                    const currentTotalSelected = Array.from(this.recibosSeleccionados).reduce((sum, id) => {
                        const r = this.recibosDisponibles.find(rc => rc.idRecibo.toString() === id);
                        return sum + (r ? r.monto : 0);
                    }, 0);

                    if (currentTotalSelected + monto <= this.saldoDisponible) {
                        checkbox.checked = true;
                        this.recibosSeleccionados.add(checkbox.dataset.reciboId);
                    } else {
                        checkbox.checked = false; // Asegurar que no esté marcado si no se puede pagar
                    }
                } else {
                    checkbox.checked = false; // Desmarcar si no se puede pagar
                }
            } else {
                checkbox.checked = false; // Asegurar que los deshabilitados no estén marcados
            }
        });
        
        this.actualizarResumenSeleccion();
    }

    /**
     * Deselecciona todos los recibos
     */
    deseleccionarTodos() {
        const checkboxes = document.querySelectorAll('#recibosDisponibles input[type="checkbox"]'); // Más específico
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.recibosSeleccionados.clear();
        this.actualizarResumenSeleccion();
    }

    /**
     * Selecciona un recibo específico (desde URL)
     */
    seleccionarReciboEspecifico(reciboId) {
        const checkbox = document.querySelector(`input[data-recibo-id="${reciboId}"]`);
        if (checkbox && !checkbox.disabled) {
            checkbox.checked = true;
            this.toggleSeleccion(checkbox);
            
            // Scroll al recibo
            checkbox.closest('.recibo-item').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }

    /**
     * Muestra la sección de confirmación
     */
    mostrarConfirmacion() {
        const recibosSeleccionadosData = Array.from(this.recibosSeleccionados).map(id => {
            return this.recibosDisponibles.find(r => r.idRecibo.toString() === id);
        }).filter(Boolean);

        const total = recibosSeleccionadosData.reduce((sum, recibo) => sum + recibo.monto, 0);
        const saldoDespuesPago = this.saldoDisponible - total;

        const html = `
            <div class="alert alert-info">
                <h4>📋 Detalles del Pago</h4>
                <div class="mt-md">
                    <strong>Recibos a pagar:</strong>
                    <ul class="mt-sm">
                        ${recibosSeleccionadosData.map(recibo => `
                            <li>Recibo #${recibo.idRecibo} - ${recibo.conceptoPago || 'Sin Concepto'} - Q${recibo.monto ? recibo.monto.toFixed(2) : '0.00'}</li>
                        `).join('')}
                    </ul>
                </div>
                <div class="recibo-details mt-lg">
                    <div class="detail-item">
                        <span class="detail-label">Total a Pagar</span>
                        <span class="detail-value font-bold text-warning">Q${total.toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Saldo Actual</span>
                        <span class="detail-value font-bold">Q${this.saldoDisponible.toFixed(2)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Saldo Después del Pago</span>
                        <span class="detail-value font-bold ${saldoDespuesPago < 0 ? 'text-error' : 'text-success'}">Q${saldoDespuesPago.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;

        this.elementos.detallesPago.innerHTML = html;
        this.elementos.confirmacionCard.classList.remove('hidden');
    }

    /**
     * Oculta la sección de confirmación
     */
    ocultarConfirmacion() {
        this.elementos.confirmacionCard.classList.add('hidden');
        this.elementos.detallesPago.innerHTML = ''; // Limpiar detalles
    }

    /**
     * Activa/desactiva el botón de procesar pago
     */
    toggleBotonProcesar() {
        const habilitado = this.elementos.confirmarPago.checked && this.recibosSeleccionados.size > 0;
        this.elementos.procesarPagoBtn.disabled = !habilitado;
    }

    /**
     * Maneja la confirmación del pago
     */
    async handleConfirmacion(e) {
        e.preventDefault();
        
        if (this.recibosSeleccionados.size === 0) {
            this.mostrarMensaje('warning', 'Sin Selección', 'Debes seleccionar al menos un recibo para pagar');
            return;
        }

        // Verificar si el saldo es suficiente para el total seleccionado
        const recibosSeleccionadosData = Array.from(this.recibosSeleccionados).map(id => {
            return this.recibosDisponibles.find(r => r.idRecibo.toString() === id);
        }).filter(Boolean);
        const totalAPagar = recibosSeleccionadosData.reduce((sum, recibo) => sum + recibo.monto, 0);

        if (totalAPagar > this.saldoDisponible) {
            this.mostrarMensaje('error', 'Saldo Insuficiente', 'El monto total de los recibos seleccionados excede tu saldo disponible.');
            return;
        }

        this.mostrarModalConfirmacion();
    }

    /**
     * Muestra el modal de confirmación final
     */
    mostrarModalConfirmacion() {
        const recibosSeleccionadosData = Array.from(this.recibosSeleccionados).map(id => {
            return this.recibosDisponibles.find(r => r.idRecibo.toString() === id);
        }).filter(Boolean);

        const total = recibosSeleccionadosData.reduce((sum, recibo) => sum + recibo.monto, 0);
        const metodoPago = this.elementos.metodoPago.value;
        const saldoRestante = this.saldoDisponible - total;

        this.elementos.modalContent.innerHTML = `
            <p><strong>¿Estás seguro de procesar este pago?</strong></p>
            <div class="mt-md">
                <p><strong>Cantidad de recibos:</strong> ${recibosSeleccionadosData.length}</p>
                <p><strong>Total a pagar:</strong> Q${total.toFixed(2)}</p>
                <p><strong>Método de pago:</strong> ${metodoPago}</p>
                <p><strong>Saldo restante:</strong> <span class="${saldoRestante < 0 ? 'text-error' : 'text-success'}">Q${saldoRestante.toFixed(2)}</span></p>
            </div>
            <div class="alert alert-warning mt-md mb-0">
                <strong>⚠️ Importante:</strong> Esta acción no se puede deshacer.
            </div>
        `;

        // Asegúrate de que el modal tiene una clase 'hidden' o 'd-none' por defecto en tu CSS
        // y que quitarla lo hace visible (ej. 'd-flex' para un overlay).
        // Si usas Bootstrap, esto sería `modal.show()`. Aquí usamos un enfoque manual.
        this.elementos.modalConfirmacion.classList.remove('hidden'); 
        // Si el modal es un overlay, podrías necesitar esto:
        // this.elementos.modalConfirmacion.style.display = 'flex';
    }

    /**
     * Cierra el modal de confirmación
     */
    cerrarModal() {
        this.elementos.modalConfirmacion.classList.add('hidden');
        // Si usas display flex/none:
        // this.elementos.modalConfirmacion.style.display = 'none';
    }

    /**
     * Confirma y procesa el pago final
     */
    async confirmarPagoFinal() {
        this.cerrarModal();
        
        try {
            this.mostrarLoading(true, 'Procesando pago...');
            
            const metodoPago = this.elementos.metodoPago.value;
            const resultados = [];
            
            // Procesar cada recibo seleccionado
            for (const reciboId of this.recibosSeleccionados) {
                try {
                    console.log(`💳 Procesando pago para recibo: ${reciboId}`);
                    
                    // Asumiendo que wsClient está definido globalmente como indicaste
                    const response = await wsClient.procesarPago(
                        parseInt(reciboId), 
                        this.cuentaActual, 
                        metodoPago
                    );
                    
                    if (response.success) {
                        resultados.push({
                            reciboId: reciboId,
                            success: true,
                            data: response.data
                        });
                    } else {
                        throw new Error(response.message || 'Error procesando pago');
                    }
                    
                } catch (error) {
                    resultados.push({
                        reciboId: reciboId,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            // Mostrar resultados
            this.mostrarResultadosPago(resultados);
            
            // Ocultar tarjetas anteriores
            this.elementos.seleccionCard.classList.add('hidden');
            this.elementos.confirmacionCard.classList.add('hidden');
            this.elementos.saldoCard.classList.add('hidden'); // Ocultar también la tarjeta de saldo
            
            // Actualizar el saldo disponible localmente después de los pagos exitosos
            // Esto es una simplificación, lo ideal sería recargar los datos de la cuenta
            // desde el servidor si wsClient.consultarRecibo tiene un endpoint para eso.
            const totalPagadoExitosamente = resultados.filter(r => r.success)
                                                      .reduce((sum, r) => sum + r.data.montoPagado, 0);
            this.saldoDisponible -= totalPagadoExitosamente;

        } catch (error) {
            console.error('❌ Error general al procesar pago:', error);
            this.mostrarMensaje('error', 'Error en el Pago General', error.message);
            
        } finally {
            this.mostrarLoading(false);
            // No deshabilitamos el formulario aquí, porque después de un pago,
            // el usuario podría querer hacer otro o ver el resultado.
        }
    }

    /**
     * Muestra los resultados del pago
     */
    mostrarResultadosPago(resultados) {
        const exitosos = resultados.filter(r => r.success);
        const fallidos = resultados.filter(r => !r.success);
        
        let html = '';
        
        if (exitosos.length > 0) {
            html += `
                <div class="alert alert-success">
                    <h3>✅ Pagos Procesados Exitosamente</h3>
                    <p>${exitosos.length} recibo(s) pagado(s) correctamente</p>
                </div>
                
                <div class="mt-lg">
                    <h4>📋 Detalles de los Pagos</h4>
                    ${exitosos.map(resultado => {
                        const data = resultado.data;
                        const fechaPago = data.fechaPago ? new Date(data.fechaPago).toLocaleString('es-GT') : 'N/A';
                        return `
                            <div class="recibo-item">
                                <div class="recibo-header">
                                    <div>
                                        <span class="recibo-id">Recibo #${data.idRecibo}</span>
                                        <span class="estado-pagado">PAGADO</span>
                                    </div>
                                    <div class="recibo-monto text-success">Q${data.montoPagado ? data.montoPagado.toFixed(2) : '0.00'}</div>
                                </div>
                                
                                <div class="recibo-details">
                                    <div class="detail-item">
                                        <span class="detail-label">Número de Transacción</span>
                                        <span class="detail-value font-bold">${data.numeroTransaccion || 'N/A'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Fecha de Pago</span>
                                        <span class="detail-value">${fechaPago}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Método de Pago</span>
                                        <span class="detail-value">${data.metodoPago || 'N/A'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Estado</span>
                                        <span class="detail-value">
                                            <span class="estado-pagado">${data.confirmacion ? data.confirmacion.estado : 'N/A'}</span>
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="mt-md text-center">
                                    <a href="/recibo.html?recibo=${data.idRecibo}&cuenta=${data.numeroCuenta}" 
                                       class="btn btn-primary">
                                        🧾 Ver Recibo Completo
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        if (fallidos.length > 0) {
            html += `
                <div class="alert alert-error mt-lg">
                    <h3>❌ Pagos No Procesados</h3>
                    <p>${fallidos.length} recibo(s) no se pudieron procesar</p>
                    <ul class="mt-sm">
                        ${fallidos.map(resultado => `
                            <li>Recibo #${resultado.reciboId}: ${resultado.error || 'Error desconocido'}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
        
        // Resumen final (si hay al menos un pago exitoso)
        if (exitosos.length > 0) {
            const totalPagado = exitosos.reduce((sum, r) => sum + (r.data.montoPagado || 0), 0);
            // El nuevo saldo debería venir del último pago exitoso o recalculado
            const nuevoSaldo = exitosos.length > 0 ? exitosos[exitosos.length - 1].data.nuevoSaldo : this.saldoDisponible;
            
            html += `
                <div class="alert alert-info mt-lg">
                    <h4>💰 Resumen Final</h4>
                    <div class="recibo-details mt-md">
                        <div class="detail-item">
                            <span class="detail-label">Total Pagado</span>
                            <span class="detail-value font-bold text-success">Q${totalPagado.toFixed(2)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Nuevo Saldo</span>
                            <span class="detail-value font-bold">Q${nuevoSaldo.toFixed(2)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Recibos Pagados</span>
                            <span class="detail-value font-bold">${exitosos.length}</span>
                        </div>
                    </div>
                </div>
            `;
        } else if (fallidos.length > 0) {
             // Si solo hubo fallos, mostramos un resumen de saldo actual
             html += `
                <div class="alert alert-info mt-lg">
                    <h4>💰 Resumen de Saldo</h4>
                    <div class="recibo-details mt-md">
                        <div class="detail-item">
                            <span class="detail-label">Saldo Actual</span>
                            <span class="detail-value font-bold">Q${this.saldoDisponible.toFixed(2)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Recibos No Pagados</span>
                            <span class="detail-value font-bold">${fallidos.length}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Botones de acción
        html += `
            <div class="text-center mt-xl">
                <button class="btn btn-secondary" onclick="pagoManager.nuevoPago()">
                    🔄 Realizar Otro Pago
                </button>
                <a href="/consulta.html?cuenta=${this.cuentaActual || ''}" class="btn btn-primary">
                    📄 Ver Recibos Restantes
                </a>
            </div>
        `;
        
        this.elementos.resultadoContent.innerHTML = html;
        this.elementos.resultadoCard.classList.remove('hidden');
        
        // Scroll a resultados
        this.elementos.resultadoCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        // Mostrar notificación
        if (exitosos.length > 0) {
            this.mostrarMensaje('success', 'Pago Exitoso', 
                `${exitosos.length} recibo(s) pagado(s) correctamente`);
        } else if (fallidos.length > 0) {
             this.mostrarMensaje('error', 'Pago Fallido', 'Ningún recibo pudo ser procesado exitosamente.');
        }
    }

    /**
     * Cancela el proceso de pago
     */
    cancelarPago() {
        if (confirm('¿Estás seguro de que quieres cancelar el proceso de pago actual y deseleccionar todos los recibos?')) {
            this.deseleccionarTodos(); // Asegura que se deseleccionen los checkboxes visualmente
            this.ocultarConfirmacion();
            this.elementos.confirmarPago.checked = false; // Desmarcar el checkbox de confirmación
            this.toggleBotonProcesar(); // Actualizar el estado del botón
            this.limpiarMensajes(); // Limpiar cualquier mensaje de error/advertencia
        }
    }

    /**
     * Inicia un nuevo proceso de pago
     */
    nuevoPago() {
        this.elementos.numeroCuentaPago.value = '';
        this.elementos.numeroCuentaPago.focus();
        this.ocultarTarjetas();
        this.limpiarMensajes();
        this.recibosSeleccionados.clear();
        this.cuentaActual = null;
        this.recibosDisponibles = [];
        this.saldoDisponible = 0;
        this.elementos.confirmarPago.checked = false; // Restablecer checkbox de confirmación
        this.toggleBotonProcesar(); // Asegurar que el botón esté deshabilitado
    }

    /**
     * Oculta todas las tarjetas
     */
    ocultarTarjetas() {
        this.elementos.saldoCard.classList.add('hidden');
        this.elementos.seleccionCard.classList.add('hidden');
        this.elementos.confirmacionCard.classList.add('hidden');
        this.elementos.resultadoCard.classList.add('hidden');
    }

    /**
     * Muestra/oculta el loading
     */
    mostrarLoading(mostrar, texto = 'Procesando...') {
        if (mostrar) {
            this.elementos.loadingText.textContent = texto;
            this.elementos.loadingOverlay.classList.remove('hidden');
            // Asumiendo que estos elementos existen en tu HTML para el spinner
            if (this.elementos.procesarPagoBtn) {
                const btnText = this.elementos.procesarPagoBtn.querySelector('.btn-text');
                const spinner = this.elementos.procesarPagoBtn.querySelector('.spinner');
                if (btnText) btnText.classList.add('hidden');
                if (spinner) spinner.classList.remove('hidden');
            }
        } else {
            this.elementos.loadingOverlay.classList.add('hidden');
            if (this.elementos.procesarPagoBtn) {
                const btnText = this.elementos.procesarPagoBtn.querySelector('.btn-text');
                const spinner = this.elementos.procesarPagoBtn.querySelector('.spinner');
                if (btnText) btnText.classList.remove('hidden');
                if (spinner) spinner.classList.add('hidden');
            }
        }
    }

    /**
     * Habilita/deshabilita el formulario
     */
    deshabilitarFormulario(deshabilitar) {
        this.elementos.numeroCuentaPago.disabled = deshabilitar;
        this.elementos.buscarBtn.disabled = deshabilitar;
    }

    /**
     * Muestra un mensaje al usuario
     */
    mostrarMensaje(tipo, titulo, mensaje) {
        // Limpiar mensajes anteriores si no es un tipo que deba persistir (ej. múltiples errores)
        // Puedes ajustar esta lógica si quieres que ciertos mensajes se acumulen.
        this.limpiarMensajes(); 

        const alertDiv = document.createElement('div');
        // Usa `alert-dismissible` y `fade show` si usas Bootstrap para el botón de cierre y la animación
        alertDiv.className = `alert alert-${tipo} alert-dismissible fade show animate-fade-in`; 
        alertDiv.setAttribute('role', 'alert');

        alertDiv.innerHTML = `
            <strong>${titulo}</strong>
            ${mensaje ? `<br><span style="font-size: 0.9em;">${mensaje}</span>` : ''}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        this.elementos.mensajesContainer.appendChild(alertDiv);

        // Ocultar mensajes de éxito/info automáticamente después de unos segundos
        if (tipo === 'success' || tipo === 'info') {
            setTimeout(() => {
                // Comprueba si el elemento aún está en el DOM antes de intentar cerrarlo
                if (alertDiv.parentElement) {
                    // Si usas Bootstrap, esto cerraría la alerta con su animación
                    const bsAlert = bootstrap && bootstrap.Alert ? new bootstrap.Alert(alertDiv) : null;
                    if (bsAlert) {
                        bsAlert.close();
                    } else {
                        alertDiv.remove(); // Fallback si Bootstrap.Alert no está disponible
                    }
                }
            }, 5000); // 5 segundos
        }
    }

    /**
     * Limpia todos los mensajes
     */
    limpiarMensajes() {
        this.elementos.mensajesContainer.innerHTML = '';
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    const pagoManager = new PagoManager();
    
    // Hacer disponible globalmente
    window.pagoManager = pagoManager;
});

// Teclas de acceso rápido
document.addEventListener('keydown', (e) => {
    // Evitar envío de formulario con Enter si el loading overlay está activo
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const activeForm = document.querySelector('form:not(.hidden)');
        // Verificar si el loadingOverlay está visible
        const isLoading = window.pagoManager.elementos.loadingOverlay.classList.contains('hidden') === false ||
                         window.pagoManager.elementos.loadingOverlay.style.display !== 'none';

        if (activeForm && !isLoading) {
            e.preventDefault();
            // Disparar el submit solo en el formulario visible actual
            if (activeForm === pagoManager.elementos.busquedaForm) {
                pagoManager.handleBusqueda(e);
            } else if (activeForm === pagoManager.elementos.confirmacionForm) {
                // Solo si el botón de procesar no está deshabilitado
                if (!pagoManager.elementos.procesarPagoBtn.disabled) {
                    pagoManager.handleConfirmacion(e);
                }
            }
        }
    }
    
    if (e.key === 'Escape') {
        // Cierra el modal de confirmación si está visible
        if (window.pagoManager && window.pagoManager.elementos.modalConfirmacion && 
            !window.pagoManager.elementos.modalConfirmacion.classList.contains('hidden')) {
            window.pagoManager.cerrarModal();
        }
    }
});