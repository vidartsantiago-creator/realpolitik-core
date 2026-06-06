import fs from 'fs';
import path from 'path';

// CONFIGURACIÓN
const INPUT_FILE = './public/assets/maps/world-map.svg';
const OUTPUT_FILE = './public/assets/maps/world-map-fixed.svg';

console.log('🗺️  Iniciando normalización del mapa SVG...');

if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: No se encontró el archivo en ${INPUT_FILE}`);
    process.exit(1);
}

const svgContent = fs.readFileSync(INPUT_FILE, 'utf8');

// 1. EXTRAER TODAS LAS COORDENADAS DE LOS PATHS
// Esta regex busca pares de números (flotantes o enteros) separados por coma o espacio
// Ignoramos comandos de letra y nos enfocamos en los valores numéricos
const coordRegex = /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/g;

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;

let match;
// Ejecutamos la regex sobre todo el contenido para encontrar los límites reales
while ((match = coordRegex.exec(svgContent)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
}

if (minX === Infinity) {
    console.error('❌ No se encontraron coordenadas válidas en el SVG.');
    process.exit(1);
}

console.log(`📊 Límites originales detectados:`);
console.log(`   X: [${minX.toFixed(2)}, ${maxX.toFixed(2)}]`);
console.log(`   Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}]`);

// 2. CALCULAR OFFSETS PARA MOVER EL ORIGEN A (0,0)
// Queremos que el punto más a la izquierda y arriba sea (0,0)
const offsetX = -minX;
const offsetY = -minY;

console.log(`🔧 Aplicando traslación:`);
console.log(`   Offset X: +${offsetX.toFixed(4)}`);
console.log(`   Offset Y: +${offsetY.toFixed(4)}`);

// 3. PROCESAR Y TRANSFORMAR LOS PATHS
// Buscamos específicamente los atributos d="..." para transformarlos
const fixedContent = svgContent.replace(/d="([^"]+)"/g, (match, pathData) => {
    const transformedPath = pathData.replace(coordRegex, (coordMatch, xStr, yStr) => {
        const x = parseFloat(xStr);
        const y = parseFloat(yStr);
        
        const newX = x + offsetX;
        const newY = y + offsetY;
        
        // Mantenemos 4 decimales para precisión sin exceso de peso
        return `${newX.toFixed(4)},${newY.toFixed(4)}`;
    });
    
    return match.replace(pathData, transformedPath);
});

// 4. ACTUALIZAR EL VIEWBOX
// El nuevo viewBox debe empezar en 0 0 y tener el tamaño del bounding box
const width = maxX - minX;
const height = maxY - minY;

const newViewBox = `viewBox="0 0 ${width.toFixed(4)} ${height.toFixed(4)}"`;

// Reemplazamos cualquier viewBox existente o lo añadimos si no existe
let finalContent = fixedContent.replace(/viewBox="[^"]*"/, newViewBox);
if (!finalContent.includes('viewBox=')) {
    // Si no tenía viewBox, lo insertamos después de <svg
    finalContent = finalContent.replace(/<svg/, `<svg ${newViewBox}`);
}

// Eliminar atributos geoViewBox antiguos si existen para limpiar
finalContent = finalContent.replace(/geoViewBox="[^"]*"\s*/g, '');

// 5. GUARDAR ARCHIVO
fs.writeFileSync(OUTPUT_FILE, finalContent);

console.log(`✅ ¡Proceso completado con éxito!`);
console.log(`📁 Nuevo archivo generado: ${OUTPUT_FILE}`);
console.log(`📏 Nuevas dimensiones del mapa: ${width.toFixed(2)} x ${height.toFixed(2)}`);
console.log(`💡 Nota: Recuerda actualizar tu JS para usar este nuevo archivo y eliminar compensaciones manuales.`);
