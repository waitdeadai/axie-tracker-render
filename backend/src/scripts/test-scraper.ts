import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

async function testScraping() {
  console.log('🔍 Iniciando prueba de scraping...\n');

  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Monitorear requests específicamente por imágenes de axies
    page.on('request', request => {
      const url = request.url();
      if (url.includes('static.axie.top/axie/?g=')) {
        console.log(`📡 Axie Image Request: ${url}`);
      }
    });

    // 1. Probar perfil específico
    const testUserId = '1ec9eb73-82dc-6970-a60c-a7455f95d64c'; // UFC | KARHU
    console.log(`\n1️⃣ Probando perfil de usuario ${testUserId}...`);
    
    try {
      await page.goto(`https://axie.top/profile/${testUserId}`, {
        timeout: 30000,
        waitUntil: 'networkidle'
      });

      // Esperar y buscar imágenes específicamente
      await page.waitForTimeout(5000);

      const axieImages = await page.evaluate(() => {
        // Buscar todas las imágenes que coincidan con el patrón
        const images = Array.from(document.querySelectorAll('img'))
          .map(img => img.src)
          .filter(src => src.includes('static.axie.top/axie/?g='));

        // Buscar también en elementos de fondo
        const backgroundImages = Array.from(document.querySelectorAll('*'))
          .map(el => window.getComputedStyle(el).backgroundImage)
          .filter(bg => bg.includes('static.axie.top/axie/?g='))
          .map(bg => bg.match(/url\(['"]?(.*?)['"]?\)/)?.[1] || '');

        return [...new Set([...images, ...backgroundImages])];
      });

      console.log('\nImágenes de Axies encontradas:');
      axieImages.forEach(url => console.log(url));

      // Guardar las URLs encontradas
      await fs.writeFile(
        path.join(__dirname, '../../screenshots/axie-images.json'),
        JSON.stringify(axieImages, null, 2)
      );

      // Tomar screenshot
      await page.screenshot({ 
        path: path.join(__dirname, '../../screenshots/profile.png'),
        fullPage: true 
      });

      // 2. Probar extracción directa de las URLs conocidas
      console.log('\n2️⃣ Probando URLs conocidas...');
      
      const knownUrls = [
        'https://static.axie.top/axie/?g=0x8000000000001000240e091030c00000003001020210208000300100881420a000300103080400c0003001020810408000300102881440a000100101080840a&s=3341859878',
        'https://static.axie.top/axie/?g=0x1000080607100080000000300102080440a00020314080084080001001030810004000300102000840c0003001028618002000300000800430a&m=true&s=3955361137',
        'https://static.axie.top/axie/?g=0x200000000000010002400000820c0000000300102000440a0003001028810002000100103081830a00030010208102060003001028808406000206101020850a&m=true&s=3151894128'
      ];

      // Intentar cargar cada URL
      for (const url of knownUrls) {
        try {
          const response = await page.goto(url, { timeout: 10000 });
          console.log(`URL ${url.slice(0, 50)}...`);
          console.log(`Status: ${response?.status()}`);
          console.log(`Content-Type: ${response?.headers()['content-type']}\n`);
        } catch (error) {
          console.log(`Error cargando ${url.slice(0, 50)}...`);
          console.log(error, '\n');
        }
      }

      // 3. Analizar estructura de las URLs
      console.log('\n3️⃣ Analizando estructura de URLs...');
      knownUrls.forEach((url, index) => {
        const params = new URL(url).searchParams;
        console.log(`\nAxie ${index + 1}:`);
        console.log('g:', params.get('g'));
        console.log('m:', params.get('m'));
        console.log('s:', params.get('s'));
      });

    } catch (error) {
      console.log('   ❌ Error en las pruebas:', error);
    }

    console.log('\n📁 Resultados guardados en carpeta screenshots/');

    // Mantener el navegador abierto para inspección manual
    console.log('\n⏸️  Presiona cualquier tecla para cerrar el navegador...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => browser.close());

  } catch (error) {
    console.error('🔥 Error general:', error);
    await browser.close();
  }
}

// Ejecutar prueba
testScraping().catch(console.error);