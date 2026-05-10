import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

class SchemaValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.schemas = {};
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const contractsDir = path.join(rootDir, 'docs', 'contracts');
    const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.schema.json'));

    for (const file of files) {
      const filePath = path.join(contractsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const schema = JSON.parse(content);
      
      this.ajv.addSchema(schema, schema.$id || file);
      this.schemas[file] = schema;
    }

    this.initialized = true;
    console.log(`[SchemaValidator] Cargados ${files.length} esquemas.`);
  }

  validate(type, data) {
    if (!this.initialized) {
      throw new Error('SchemaValidator no inicializado. Llama a init() primero.');
    }

    const schemaKey = `${type}.schema.json`;
    const validator = this.ajv.getSchema(schemaKey);

    if (!validator) {
      // Si no hay esquema para este tipo, permitimos el paso (modo flexible) o lanzamos error según preferencia
      // Aquí optamos por permitir si no hay esquema explícito, pero logueamos advertencia.
      console.warn(`[SchemaValidator] No hay esquema registrado para: ${type}`);
      return { valid: true, errors: [] };
    }

    const valid = validator(data);
    
    if (!valid) {
      return {
        valid: false,
        errors: validator.errors.map(e => ({
          field: e.instancePath || 'root',
          message: e.message
        }))
      };
    }

    return { valid: true, errors: [] };
  }
}

// Singleton exportado
export const validator = new SchemaValidator();
export default validator;