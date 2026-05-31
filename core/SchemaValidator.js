import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta base hacia docs/contracts
const CONTRACTS_DIR = join(__dirname, '../docs/contracts');

class SchemaValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.schemas = {};
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    try {
      // Cargar esquemas desde archivos JSON
      const intentSchemaRaw = readFileSync(join(CONTRACTS_DIR, 'Intent.schema.json'), 'utf8');
      const deltaSchemaRaw = readFileSync(join(CONTRACTS_DIR, 'StateDelta.schema.json'), 'utf8');

      const intentSchema = JSON.parse(intentSchemaRaw);
      const deltaSchema = JSON.parse(deltaSchemaRaw);

      // Compilar esquemas en AJV
      this.schemas.intent = this.ajv.compile(intentSchema);
      this.schemas.delta = this.ajv.compile(deltaSchema);

      this.initialized = true;
      console.log('[SchemaValidator] Esquemas cargados y compilados correctamente.');
    } catch (error) {
      console.error('[SchemaValidator] Error crítico al cargar esquemas:', error.message);
      console.error('[SchemaValidator] La validación en runtime estará DESACTIVADA por seguridad.');
      this.initialized = false;
    }
  }

  validateIntent(data) {
    if (!this.initialized) {
      // Fail-open: Si no hay esquemas, permitimos pasar para no romper el servidor en dev
      return { valid: true, errors: [] };
    }

    const valid = this.schemas.intent(data);
    
    if (valid) {
      return { valid: true, errors: [] };
    } else {
      return { 
        valid: false, 
        errors: this.schemas.intent.errors.map(err => ({
          field: err.instancePath || 'root',
          message: err.message
        }))
      };
    }
  }

  validateDelta(data) {
    if (!this.initialized) {
      return { valid: true, errors: [] };
    }

    const valid = this.schemas.delta(data);
    
    if (valid) {
      return { valid: true, errors: [] };
    } else {
      return { 
        valid: false, 
        errors: this.schemas.delta.errors.map(err => ({
          field: err.instancePath || 'root',
          message: err.message
        }))
      };
    }
  }
}

// Singleton exportado - instancia única
export const validator = new SchemaValidator();