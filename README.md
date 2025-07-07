# sistemaReciboElectrico

# Sistema de Gestión de Recibos Eléctricos en Tiempo Real

Sistema web desarrollado en Node.js que permite la gestión completa de recibos eléctricos con comunicación en tiempo real mediante WebSocket y persistencia en SQL Server.

## Características

- ✅ Consulta de recibos eléctricos pendientes
- ✅ Procesamiento de pagos con validación de saldo
- ✅ Actualización en tiempo real sin recarga de página
- ✅ Visualización de recibos pagados
- ✅ Interfaz web intuitiva y responsive
- ✅ Transacciones seguras con SQL Server

## Tecnologías Utilizadas

- **Backend**: Node.js, Express.js
- **WebSocket**: ws (para comunicación en tiempo real)
- **Base de datos**: SQL Server (MSSQL)
- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Otras librerías**: cors, dotenv

## Requisitos Previos

- Node.js (v16 o superior)
- SQL Server (Express, Developer, o Standard)
- Visual Studio Code (recomendado)
- Git

## 🔧 Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/alessandrosec/sistema-recibos-electricos.git
cd sistema-recibos-electricos
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
# Copiar el archivo de ejemplo
copy .env.example .env

# Editar .env
```

### 4. Configurar la base de datos
```bash
# Ejecutar los scripts SQL en SQL Server Management Studio
# 1. Ejecutar database/create_database.sql
# 2. Ejecutar database/populate_data.sql
```

### 5. Iniciar la aplicación
```bash
# Modo desarrollo (con nodemon)
npm run dev

# Modo producción
npm start
```

## 🌐 Uso

1. Abrir el navegador en `http://localhost:3000`
2. Navegar entre las diferentes funcionalidades:
   - **Consulta**: Ver recibos pendientes
   - **Pago**: Procesar pagos de recibos
   - **Recibo**: Visualizar recibos pagados

## 📁 Estructura del Proyecto

```
sistema-recibos-electricos/
├── config/          # Configuraciones
├── controllers/     # Lógica de negocio
├── models/         # Modelos de datos
├── public/         # Archivos estáticos
├── views/          # Páginas HTML
├── services/       # Servicios del sistema
├── database/       # Scripts SQL
├── docs/          # Documentación
└── server.js      # Servidor principal
```

## 🔌 API WebSocket

### Eventos disponibles:
- `consultar_recibo`: Consultar recibos pendientes
- `procesar_pago`: Procesar pago de recibo
- `obtener_recibo`: Obtener recibo pagado

### Ejemplo de uso:
```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.send(JSON.stringify({
    action: 'consultar_recibo',
    numeroCuenta: '12345'
}));
```

## Base de Datos

### Tablas principales:
- **Cuentas**: Gestión de cuentas de usuario
- **Recibos**: Gestión de recibos eléctricos

### Esquema:
```sql
-- Tabla Cuentas
CREATE TABLE Cuentas (
    numeroCuenta NVARCHAR(20) PRIMARY KEY,
    saldo DECIMAL(10,2) NOT NULL
);

-- Tabla Recibos
CREATE TABLE Recibos (
    idRecibo INT IDENTITY(1,1) PRIMARY KEY,
    numeroCuenta NVARCHAR(20) FOREIGN KEY REFERENCES Cuentas(numeroCuenta),
    monto DECIMAL(10,2) NOT NULL,
    fecha DATETIME DEFAULT GETDATE(),
    estado NVARCHAR(20) DEFAULT 'pendiente'
);
```

##  Pruebas

Para probar el sistema:

1. Usar las cuentas de prueba creadas en `populate_data.sql`
2. Verificar la comunicación WebSocket en las herramientas de desarrollador
3. Comprobar las transacciones en SQL Server Management Studio

##  Autor

**Tu Nombre**
- GitHub: [@alessandrosec](https://github.com/alessandrosec)
- Email: se.com

⚡ **Desarrollado con Node.js y mucho ☕**
