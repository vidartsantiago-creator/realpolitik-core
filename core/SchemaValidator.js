const { readFileSync } = require('fs');
const { join } = require('path');
const Ajv = require('ajv');

class SchemaValidator {
    constructor() {
        this.ajv = new Ajv({ allErrors: true, strict: true });
        this.intentSchema = null;
        this.deltaSchema = null;
        this.initialized = false;
    }

    /**
     * Inicializa los esquemas de validación.
     * CRÍTICO: Si los archivos no existen o son inválidos, el proceso MUERE.
     * No aceptamos datos sin contrato definido.
     */
    init() {
        if (this.initialized) return;

        const CONTRACTS_DIR = join(__dirname, '../docs/contracts');

        try {
            // Rutas explícitas a los contratos
            const intentPath = join(CONTRACTS_DIR, 'Intent.schema.json');
            const deltaPath = join(CONTRACTS_DIR, 'StateDelta.schema.json');

            console.log(`[SchemaValidator] Cargando schemas desde: ${CONTRACTS_DIR}`);

            // Lectura síncrona forzada al inicio
            const intentSchemaRaw = readFileSync(intentPath, 'utf8');
            const deltaSchemaRaw = readFileSync(deltaPath, 'utf8');

            this.intentSchema = JSON.parse(intentSchemaRaw);
            this.deltaSchema = JSON.parse(deltaSchemaRaw);

            // Compilación y registro en AJV
            this.ajv.addSchema(this.intentSchema, 'Intent');
            this.ajv.addSchema(this.deltaSchema, 'StateDelta');

            this.initialized = true;
            console.log('✅ [SchemaValidator] Esquemas cargados y validados correctamente.');
        } catch (error) {
            console.error('🔴 [SchemaValidator] ERROR FATAL DE INICIALIZACIÓN:');
            console.error(`   Mensaje: ${error.message}`);
            console.error('   Acción: Abortando el servidor para prevenir corrupción de estado por falta de validación.');
            process.exit(1); // 🔴 FAIL-CLOSED: Mejor caer ahora que corromper datos después
        }
    }

    /**
     * Valida un Intent entrante contra el esquema cargado.
     * @param {Object} data - El objeto intent a validar
     * @returns {{valid: boolean, errors: Array|null}}
     */
    validateIntent(data) {
        if (!this.initialized) {
            // Esto nunca debería ocurrir gracias al process.exit(1) en init(),
            // pero lo dejamos como red de seguridad defensiva.
            throw new Error('[SchemaValidator] Intento de validación antes de inicialización. Configuración crítica fallida.');
        }

        const validate = this.ajv.compile(this.intentSchema);
        const valid = validate(data);

        return {
            valid,
            errors: valid ? [] : validate.errors
        };
    }

    /**
     * Valida un Delta de estado antes de aplicarlo o enviarlo.
     * @param {Object} data - El objeto delta a validar
     * @returns {{valid: boolean, errors: Array|null}}
     */
    validateDelta(data) {
        if (!this.initialized) {
            throw new Error('[SchemaValidator] Intento de validación de Delta antes de inicialización.');
        }

        const validate = this.ajv.compile(this.deltaSchema);
        const valid = validate(data);

        return {
            valid,
            errors: valid ? [] : validate.errors
        };
    }
}

// Exportar instancia singleton
module.exports = new SchemaValidator();