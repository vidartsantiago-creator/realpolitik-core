/**
 * fix_map.mjs
 * Script de normalización robusto para SVGs de mapas geopolíticos.
 * 
 * OBJETIVOS:
 * 1. Extraer coordenadas SOLO de los atributos 'd' (paths).
 * 2. Ignorar atributos de contenedor (width, height, geoViewBox) para el cálculo de bounds.
 * 3. Normalizar el mapa al origen (0,0).
 * 4. Insertar un viewBox estándar respetando los namespaces XML.
 * 5. Preservar la información antigua de geoViewBox en un backup JSON.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'public/assets/maps/world-map_OLD.svg');
const OUTPUT_FILE = path.join(__dirname, 'public/assets/maps/world-map-fixed.svg');
const BACKUP_FILE = path.join(__dirname, 'public/assets/maps/geoviewbox-backup.json');

// Expresiones Regulares
// 1. Captura el contenido dentro de d="..." (manejando comillas simples o dobles si fuera necesario, aquí asumimos dobles estándar)
const PATH_DATA_REGEX = /d="([^"]+)"/g;
// 2. Captura pares de números (coordenadas) dentro del string del path
// Soporta notación científica y decimales. Separa por coma o espacio.
const COORD_REGEX = /(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[,\s]+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

// Namespace SVG común en editores vectoriales
const SVG_NS = 'http://www.w3.org/2000/svg';

async function normalizeMap() {
    console.log('🚀 Iniciando normalización del mapa...');
    console.log(`📂 Input: ${INPUT_FILE}`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error('❌ Error: El archivo de entrada no existe.');
        return;
    }

    let svgContent = fs.readFileSync(INPUT_FILE, 'utf-8');

    // ---------------------------------------------------------
    // PASO 1: Extracción de límites REALES solo desde paths
    // ---------------------------------------------------------
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let pathCount = 0;
    let coordCount = 0;

    // Backup del geoViewBox antiguo si existe
    let oldGeoViewBox = null;
    const geoViewBoxMatch = svgContent.match(/geoViewBox="([^"]+)"/);
    if (geoViewBoxMatch) {
        oldGeoViewBox = geoViewBoxMatch[1];
        console.log('💾 geoViewBox original detectado:', oldGeoViewBox);
    }

    console.log('🔍 Escaneando coordenadas en atributos "d"...');

    // Iteramos sobre cada atributo d="..."
    let match;
    while ((match = PATH_DATA_REGEX.exec(svgContent)) !== null) {
        pathCount++;
        const pathData = match[1];
        
        // Reset regex para el nuevo path
        COORD_REGEX.lastIndex = 0;
        let coordMatch;

        while ((coordMatch = COORD_REGEX.exec(pathData)) !== null) {
            const x = parseFloat(coordMatch[1]);
            const y = parseFloat(coordMatch[2]);

            if (!isNaN(x) && !isNaN(y)) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                coordCount++;
            }
        }
    }

    if (pathCount === 0 || coordCount === 0) {
        console.error('❌ Error crítico: No se encontraron paths o coordenadas válidas.');
        return;
    }

    console.log(`✅ Escaneo completo: ${pathCount} paths, ${coordCount} coordenadas analizadas.`);
    console.log(`📏 Bounds originales encontrados: [${minX.toFixed(2)}, ${minY.toFixed(2)}] a [${maxX.toFixed(2)}, ${maxY.toFixed(2)}]`);

    // ---------------------------------------------------------
    // PASO 2: Cálculo de Offset y Dimensiones
    // ---------------------------------------------------------
    const offsetX = -minX;
    const offsetY = -minY;
    const newWidth = maxX - minX;
    const newHeight = maxY - minY;

    console.log(`🔄 Offset calculado: X=${offsetX.toFixed(4)}, Y=${offsetY.toFixed(4)}`);
    console.log(`📐 Nuevas dimensiones: ${newWidth.toFixed(4)} x ${newHeight.toFixed(4)}`);

    // ---------------------------------------------------------
    // PASO 3: Transformación de los Paths
    // ---------------------------------------------------------
    console.log('✏️  Reescribiendo coordenadas...');
    
    let fixedContent = svgContent.replace(PATH_DATA_REGEX, (match, pathData) => {
        // Transformamos las coordenadas dentro de este string específico
        return match.replace(COORD_REGEX, (m, xStr, yStr) => {
            const x = parseFloat(xStr);
            const y = parseFloat(yStr);
            
            const newX = x + offsetX;
            const newY = y + offsetY;

            // Mantenemos la precisión original pero aseguramos formato limpio
            // Si el número original tenía muchos decimales, los mantenemos, si no, limpiamos
            const precision = Math.max(xStr.split('.')[1]?.length || 0, yStr.split('.')[1]?.length || 0);
            const finalPrecision = Math.min(precision, 6); // Máximo 6 decimales para no inflar el archivo

            return `${newX.toFixed(finalPrecision)},${newY.toFixed(finalPrecision)}`;
        });
    });

    // ---------------------------------------------------------
    // PASO 4: Inserción de viewBox estándar respetando namespaces
    // ---------------------------------------------------------
    const newViewBoxString = `viewBox="0 0 ${newWidth.toFixed(4)} ${newHeight.toFixed(4)}"`;
    
    // Regex para encontrar la etiqueta de apertura <svg ...> o <ns0:svg ...>
    // Grupo 1: nombre de la etiqueta (svg, ns0:svg, etc.)
    // Grupo 2: el resto de atributos hasta el cierre >
    const svgTagRegex = /<([a-zA-Z0-9_:]+svg)([^>]*)>/i;

    if (!svgTagRegex.test(fixedContent)) {
        console.error('❌ Error: No se encontró la etiqueta de apertura <svg>.');
        return;
    }

    fixedContent = fixedContent.replace(svgTagRegex, (fullMatch, tagName, attributes) => {
        // Eliminar viewBox o geoViewBox existentes si los hubiera en los atributos
        let cleanAttrs = attributes
            .replace(/\s*viewBox="[^"]*"/gi, '')
            .replace(/\s*geoViewBox="[^"]*"/gi, '');
        
        // Insertar el nuevo viewBox al principio de los atributos
        return `<${tagName} ${newViewBoxString}${cleanAttrs}>`;
    });

    // Eliminar cualquier atributo geoViewBox residual que pudiera estar fuera de la etiqueta svg (poco probable pero seguro)
    fixedContent = fixedContent.replace(/\s+geoViewBox="[^"]*"/gi, '');

    // ---------------------------------------------------------
    // PASO 5: Validación Final
    // ---------------------------------------------------------
    console.log('🛡️  Validando resultado...');
    
    // Verificar que el nuevo contenido tenga viewBox
    if (!fixedContent.includes('viewBox="0 0')) {
        console.error('❌ Error crítico: Fallo al insertar el viewBox.');
        return;
    }

    // Verificación rápida de que las nuevas coordenadas mínimas son ~0
    // (Re-escaneo rápido del primer path para sanity check)
    const firstPathMatch = fixedContent.match(PATH_DATA_REGEX);
    if (firstPathMatch) {
        const firstPathData = firstPathMatch[0].match(/d="([^"]+)"/)[1];
        const firstCoordMatch = firstPathData.match(COORD_REGEX);
        if (firstCoordMatch) {
            const checkX = parseFloat(firstCoordMatch[1]);
            const checkY = parseFloat(firstCoordMatch[2]);
            
            // Permitimos una pequeña tolerancia por redondeo float
            if (Math.abs(checkX) > 0.01 || Math.abs(checkY) > 0.01) {
                console.warn(`⚠️  ADVERTENCIA: La primera coordenada no es (0,0). Es (${checkX}, ${checkY}).`);
                console.warn('   Esto podría indicar que el primer path no es el que define el límite izquierdo superior.');
            } else {
                console.log('✅ Validación exitosa: Las coordenadas comienzan cerca de (0,0).');
            }
        }
    }

    // ---------------------------------------------------------
    // PASO 6: Guardado de Archivos
    // ---------------------------------------------------------
    
    // 6a. Guardar Backup de geoViewBox
    const backupData = {
        originalFile: 'world-map_OLD.svg',
        processedDate: new Date().toISOString(),
        originalGeoViewBox: oldGeoViewBox,
        calculatedBounds: {
            minX: minX, minY: minY, maxX: maxX, maxY: maxY
        },
        appliedOffset: { x: offsetX, y: offsetY },
        newDimensions: { width: newWidth, height: newHeight }
    };
    
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup guardado en: ${BACKUP_FILE}`);

    // 6b. Guardar SVG Normalizado
    fs.writeFileSync(OUTPUT_FILE, fixedContent);
    console.log(`✅ Mapa normalizado guardado en: ${OUTPUT_FILE}`);
    
    console.log('\n🎉 Proceso finalizado con éxito.');
    console.log('👉 Siguiente paso: Copiar world-map-fixed.svg sobre world-map.svg si el resultado es correcto.');
}

// Ejecutar
normalizeMap().catch(err => {
    console.error('💥 Error inesperado:', err);
    process.exit(1);
});