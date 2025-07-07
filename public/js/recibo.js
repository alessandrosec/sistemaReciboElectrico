/**
 * JavaScript para la página de visualización de recibos
 */

class ReciboManager {
    constructor() {
        this.elementos = {
            busquedaForm: document.getElementById('busquedaForm'),
            numeroReciboVer: document.getElementById('numeroReciboVer'),
            numeroCuentaVer: document.getElementById('numeroCuentaVer'),
            buscarReciboBtn: document.getElementById('buscarReciboBtn'),
            busquedaCard: document.getElementById('busquedaCard'),
            reciboCard: document.getElementById('reciboCard'),
            reciboContent: document.getElementById('reciboContent'),
            mensajesContainer: document.getElementById('mensajesContainer'),
            loadingOverlay: document.getElementById('loadingOverlay')
        };

        this.reciboActual = null;
        
        this.inicializar();
    }

    /**
     * Inicializa los event listeners
     */
    inicializar() {
        // Event listeners del formulario
        this.elementos.busquedaForm.addEventListener('submit', (e) => this.handleBusqueda(e));
        this.elementos.numeroCuentaVer.addEventListener('input', (e) => this.handleInputChange(e));

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
        this.elementos.numeroReciboVer.focus();
    }

    /**
     * Procesa los parámetros de la URL
     */
    procesarParametrosURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const recibo = urlParams.get('recibo');
        const cuenta = urlParams.get('cuenta');

        if (recibo && cuenta) {
            this.elementos.numeroReciboVer.value = recibo;
            this.elementos.numeroCuentaVer.value = cuenta.toUpperCase();
            
            // Auto-buscar después de un delay
            setTimeout(() => {
                this.buscarRecibo(parseInt(recibo), cuenta.toUpperCase());
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
     * Maneja la búsqueda del recibo
     */
    async handleBusqueda(e) {
        e.preventDefault();
        
        const numeroRecibo = parseInt(this.elementos.numeroReciboVer.value.trim());
        const numeroCuenta = this.elementos.numeroCuentaVer.value.trim();
        
        if (!numeroRecibo || !numeroCuenta) {
            this.mostrarMensaje('error', 'Error', 'Por favor completa todos los campos');
            return;
        }

        await this.buscarRecibo(numeroRecibo, numeroCuenta);
    }

    /**
     * Busca y muestra el recibo
     */
    async buscarRecibo(idRecibo, numeroCuenta) {
        try {
            this.mostrarLoading(true);
            this.deshabilitarFormulario(true);
            this.ocultarRecibo(); // Oculta el recibo anterior al iniciar una nueva búsqueda
            this.mostrarMensaje('info', 'Buscando...', 'Iniciando búsqueda del recibo...'); // Mensaje informativo
            
            console.log(`🔍 Buscando recibo: ${idRecibo} para cuenta: ${numeroCuenta}`);
            
            // Aquí se asume que wsClient ya está definido y disponible globalmente
            if (typeof wsClient === 'undefined' || !wsClient.isConnected) {
                throw new Error('No hay conexión con el servidor. Por favor espera un momento.');
            }

            // Buscar el recibo
            const response = await wsClient.obtenerRecibo(idRecibo, numeroCuenta);
            
            if (response.success) {
                this.reciboActual = response.data;
                this.mostrarRecibo(response.data);
                this.mostrarMensaje('success', 'Recibo Encontrado', 'Recibo cargado exitosamente');
            } else {
                throw new Error(response.message || 'Recibo no encontrado');
            }
            
        } catch (error) {
            console.error('❌ Error buscando recibo:', error);
            this.mostrarMensaje('error', 'Error en la Búsqueda', error.message);
            this.ocultarRecibo(); // Asegura que el recibo esté oculto si hay un error
            
        } finally {
            this.mostrarLoading(false);
            this.deshabilitarFormulario(false);
        }
    }

    /**
     * Muestra el recibo completo en la interfaz.
     */
    mostrarRecibo(recibo) {
        const fechaEmision = new Date(recibo.fecha).toLocaleDateString('es-GT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Se asume que recibo.fechaVencimiento y recibo.fechaPago pueden ser nulos o indefinidos
        const fechaVencimiento = recibo.fechaVencimiento ? new Date(recibo.fechaVencimiento).toLocaleDateString('es-GT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'N/A';
        
        const fechaPago = recibo.fechaPago ? new Date(recibo.fechaPago).toLocaleDateString('es-GT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'No Pagado';

        // Construcción del HTML para mostrar los detalles del recibo
        // Asegúrate de que los IDs/clases en tu HTML coincidan con esto si ya los tienes
        this.elementos.reciboContent.innerHTML = `
            <div class="card-body">
                <h5 class="card-title text-center mb-4">Detalle del Recibo #${recibo.idRecibo}</h5>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Número de Recibo:</strong></div>
                    <div class="col-md-6">${recibo.idRecibo}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Número de Cuenta:</strong></div>
                    <div class="col-md-6">${recibo.numeroCuenta}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Nombre del Cliente:</strong></div>
                    <div class="col-md-6">${recibo.nombreCliente || 'N/A'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Fecha de Emisión:</strong></div>
                    <div class="col-md-6">${fechaEmision}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Fecha de Vencimiento:</strong></div>
                    <div class="col-md-6">${fechaVencimiento}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Fecha de Pago:</strong></div>
                    <div class="col-md-6">${fechaPago}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Monto Total:</strong></div>
                    <div class="col-md-6">Q ${recibo.montoTotal ? recibo.montoTotal.toFixed(2) : '0.00'}</div>
                </div>
                <div class="row mb-2">
                    <div class="col-md-6"><strong>Estado:</strong></div>
                    <div class="col-md-6">
                        <span class="badge ${recibo.estado === 'Pagado' ? 'bg-success' : 'bg-warning'}">
                            ${recibo.estado || 'Desconocido'}
                        </span>
                    </div>
                </div>
                ${recibo.descripcion ? `<div class="row mb-2">
                    <div class="col-md-6"><strong>Descripción:</strong></div>
                    <div class="col-md-6">${recibo.descripcion}</div>
                </div>` : ''}
            </div>
        `;
        this.elementos.reciboCard.style.display = 'block'; // Muestra la tarjeta del recibo
    }

    /**
     * Oculta la tarjeta del recibo y limpia su contenido.
     */
    ocultarRecibo() {
        this.elementos.reciboCard.style.display = 'none';
        this.elementos.reciboContent.innerHTML = ''; // Limpia el contenido
        this.reciboActual = null; // Reinicia el recibo actual
    }

    /**
     * Muestra un mensaje de alerta al usuario.
     * @param {string} type - Tipo de mensaje (success, error, warning, info).
     * @param {string} title - Título del mensaje.
     * @param {string} message - Contenido del mensaje.
     */
    mostrarMensaje(type, title, message) {
        // Limpia cualquier mensaje anterior
        this.elementos.mensajesContainer.innerHTML = '';

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.setAttribute('role', 'alert');

        alertDiv.innerHTML = `
            <strong>${title}</strong>: ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        this.elementos.mensajesContainer.appendChild(alertDiv);

        // Opcional: auto-ocultar mensajes de éxito/info después de unos segundos
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                const bsAlert = new bootstrap.Alert(alertDiv); // Asume Bootstrap para el 'fade show' y 'btn-close'
                bsAlert.close();
            }, 5000); // 5 segundos
        }
    }

    /**
     * Muestra u oculta la capa de carga.
     * @param {boolean} mostrar - true para mostrar, false para ocultar.
     */
    mostrarLoading(mostrar) {
        if (mostrar) {
            this.elementos.loadingOverlay.style.display = 'flex'; // Usar 'flex' para centrar el contenido (spinner)
        } else {
            this.elementos.loadingOverlay.style.display = 'none';
        }
    }

    /**
     * Habilita o deshabilita los campos del formulario y el botón de búsqueda.
     * @param {boolean} deshabilitar - true para deshabilitar, false para habilitar.
     */
    deshabilitarFormulario(deshabilitar) {
        this.elementos.numeroReciboVer.disabled = deshabilitar;
        this.elementos.numeroCuentaVer.disabled = deshabilitar;
        this.elementos.buscarReciboBtn.disabled = deshabilitar;
    }
}
