import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT = path.join(__dirname, 'public/assets/maps/world-map.svg');
const OUTPUT = path.join(__dirname, 'public/assets/maps/world-map-FIXED.svg');

console.log('🔧 Reparando estructura de paths...');

let content = fs.readFileSync(INPUT, 'utf-8');

// Regex para encontrar cada etiqueta path completa
// Captura: [0] todo, [1] atributos antes de d, [2] contenido de d, [3] atributos después de d
const pathRegex = /(<[^>]*?)\s+d="([^"]+)"([^>]*>)/g;

let fixedCount = 0;

const fixedContent = content.replace(pathRegex, (match, pre, dData, post) => {
    // 1. Extraer TODOS los números del string d actual
    // El formato actual es "M x,y M x,y M x,y..."
    const numbers = dData.match(/-?\d+\.?\d*/g);
    
    if (!numbers || numbers.length < 2) {
        return match; // Si no hay números, dejarlo igual
    }

    // 2. Reconstruir el path correctamente
    // El primer par es el Move To (M)
    // El resto son Line To (L)
    
    let newPathData = `M ${numbers[0]},${numbers[1]}`;
    
    for (let i = 2; i < numbers.length; i += 2) {
        const x = numbers[i];
        const y = numbers[i+1];
        if (y !== undefined) {
            newPathData += ` L ${x},${y}`;
        }
    }
    
    // Cerrar el path
    newPathData += ' Z';

    fixedCount++;
    
    // Reconstruir la etiqueta path
    // Limpiamos posibles atributos duplicados que pudiera haber (id="", title="") si el regex original los capturó mal
    // Pero asumimos que pre y post son seguros por ahora.
    return `${pre} d="${newPathData}"${post}`;
});

if (fixedCount === 0) {
    console.error('❌ No se encontraron paths para reparar. Verifica el formato de entrada.');
} else {
    fs.writeFileSync(OUTPUT, fixedContent);
    console.log(`✅ ¡Reparación completada! ${fixedCount} paths corregidos.`);
    console.log(`📁 Archivo guardado en: ${OUTPUT}`);
    console.log('👉 PASOS SIGUIENTES:');
    console.log('   1. Copia este archivo sobre el original:');
    console.log(`      cp ${OUTPUT} ${INPUT}`);
    console.log('   2. Limpia caché del navegador (Ctrl+Shift+R).');
    console.log('   3. Recarga la página.');
}