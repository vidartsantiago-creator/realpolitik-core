import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ajv = new Ajv({ allErrors: true });
const contractsDir = path.join(rootDir, 'docs', 'contracts');

console.log('🔍 Validando esquemas JSON en docs/contracts/...\n');

try {
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.schema.json'));
  
  if (files.length === 0) {
    console.error('❌ No se encontraron archivos .schema.json en docs/contracts/');
    process.exit(1);
  }

  let validCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(contractsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const schema = JSON.parse(content);

    try {
      // Intentar compilar el esquema para verificar su sintaxis
      ajv.compile(schema);
      console.log(`✅ ${file}: Válido`);
      validCount++;
    } catch (err) {
      console.error(`❌ ${file}: Error de compilación - ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n-----------------------------------');
  console.log(`Resumen: ${validCount} válidos, ${errorCount} inválidos.`);

  if (errorCount > 0) {
    console.error('❌ Validación de esquemas fallida.');
    process.exit(1);
  } else {
    console.log('✅ Todos los esquemas son válidos y están listos para uso en runtime.');
  }

} catch (err) {
  console.error('❌ Error fatal al leer directorio:', err.message);
  process.exit(1);
}