const sql = require('mssql');
require('dotenv').config();

// Configuración de la conexión a SQL Server
const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'ElectricidadDB',
    user: process.env.DB_USER || 'app_recibos_user',
    password: process.env.DB_PASSWORD || 'AppRecibos2025!',
    options: {
        encrypt: false, // Para SQL Server local
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Establece la conexión con la base de datos
     */
    async connect() {
        try {
            if (!this.pool) {
                this.pool = new sql.ConnectionPool(dbConfig);
                
                // Eventos de la conexión
                this.pool.on('connect', () => {
                    console.log('✅ Conectado a SQL Server exitosamente');
                    this.isConnected = true;
                });

                this.pool.on('error', (err) => {
                    console.error('❌ Error en la conexión SQL Server:', err);
                    this.isConnected = false;
                });

                await this.pool.connect();
            }
            return this.pool;
        } catch (error) {
            console.error('❌ Error al conectar con la base de datos:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Obtiene la instancia del pool de conexiones
     */
    async getPool() {
        if (!this.pool || !this.isConnected) {
            await this.connect();
        }
        return this.pool;
    }

    /**
     * Ejecuta una consulta SQL
     */
    async query(queryString, params = {}) {
        try {
            const pool = await this.getPool();
            const request = pool.request();

            // Agregar parámetros si existen
            Object.keys(params).forEach(key => {
                request.input(key, params[key]);
            });

            const result = await request.query(queryString);
            return result;
        } catch (error) {
            console.error('❌ Error ejecutando query:', error);
            throw error;
        }
    }

    /**
     * Ejecuta un procedimiento almacenado
     */
    async executeStoredProcedure(procedureName, params = {}) {
        try {
            const pool = await this.getPool();
            const request = pool.request();

            // Agregar parámetros si existen
            Object.keys(params).forEach(key => {
                request.input(key, params[key]);
            });

            const result = await request.execute(procedureName);
            return result;
        } catch (error) {
            console.error(`❌ Error ejecutando procedimiento ${procedureName}:`, error);
            throw error;
        }
    }

    /**
     * Inicia una transacción
     */
    async beginTransaction() {
        try {
            const pool = await this.getPool();
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            return transaction;
        } catch (error) {
            console.error('❌ Error iniciando transacción:', error);
            throw error;
        }
    }

    /**
     * Verifica la conexión a la base de datos
     */
    async testConnection() {
        try {
            const result = await this.query('SELECT GETDATE() as currentTime, @@VERSION as version');
            console.log('🔍 Prueba de conexión exitosa:', {
                timestamp: result.recordset[0].currentTime,
                serverInfo: result.recordset[0].version.split('\n')[0]
            });
            return true;
        } catch (error) {
            console.error('❌ Fallo en la prueba de conexión:', error);
            return false;
        }
    }

    /**
     * Cierra la conexión
     */
    async close() {
        try {
            if (this.pool) {
                await this.pool.close();
                this.pool = null;
                this.isConnected = false;
                console.log('🔌 Conexión a base de datos cerrada');
            }
        } catch (error) {
            console.error('❌ Error cerrando la conexión:', error);
            throw error;
        }
    }

    /**
     * Obtiene estadísticas de la conexión
     */
    getConnectionStats() {
        if (this.pool) {
            return {
                isConnected: this.isConnected,
                totalConnections: this.pool.totalConnectionCount,
                idleConnections: this.pool.idleConnectionCount,
                busyConnections: this.pool.busyConnectionCount
            };
        }
        return {
            isConnected: false,
            totalConnections: 0,
            idleConnections: 0,
            busyConnections: 0
        };
    }
}

// Crear instancia singleton
const dbConnection = new DatabaseConnection();

// Manejar el cierre graceful de la aplicación
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando aplicación...');
    await dbConnection.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Terminando aplicación...');
    await dbConnection.close();
    process.exit(0);
});

module.exports = {
    dbConnection,
    sql // Exportar sql para tipos de datos
};