const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const WIDTH = 800;
const HEIGHT = 480;
const OUTPUT_DIR = path.join(__dirname, 'output');

async function generateDashboardImage(options = {}) {
    const {
        outputPath = path.join(OUTPUT_DIR, 'dashboard.png')
    } = options;

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const svg = generateSvg();
    
    await sharp(Buffer.from(svg))
        .resize(WIDTH, HEIGHT)
        .png()
        .toFile(outputPath);

    return outputPath;
}

function generateSvg() {
    const temp = (20 + Math.random() * 15).toFixed(1);
    const cpu = Math.floor(Math.random() * 80 + 10);
    const mem = Math.floor(Math.random() * 60 + 20);
    const netUp = (Math.random() * 5).toFixed(1);
    const netDown = (Math.random() * 10).toFixed(1);
    const diskRoot = Math.floor(Math.random() * 40 + 50);
    const diskData = Math.floor(Math.random() * 50 + 10);
    const timestamp = new Date().toLocaleString('sv-SE');

    return `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f5f5f5"/>
    
    <rect x="12" y="12" width="776" height="40" fill="white" stroke="black" stroke-width="2"/>
    <text x="22" y="38" font-family="Arial" font-size="18" font-weight="bold">System Dashboard</text>
    <text x="600" y="38" font-family="Arial" font-size="12" fill="#666">${timestamp}</text>
    
    <rect x="22" y="62" width="376" height="125" fill="white" stroke="black" stroke-width="2"/>
    <text x="32" y="82" font-family="Arial" font-size="14" font-weight="bold">Temperatur</text>
    <text x="200" y="115" font-family="Arial" font-size="24" font-weight="bold">${temp}°C</text>
    <rect x="32" y="130" width="300" height="10" fill="#e0e0e0" stroke="black" stroke-width="1"/>
    <rect x="32" y="130" width="${300 * (temp / 50)}" height="10" fill="black"/>
    
    <rect x="408" y="62" width="376" height="125" fill="white" stroke="black" stroke-width="2"/>
    <text x="418" y="82" font-family="Arial" font-size="14" font-weight="bold">CPU</text>
    <text x="418" y="105" font-family="Arial" font-size="11">Användning</text>
    <text x="750" y="105" font-family="Arial" font-size="11" text-anchor="end">${cpu}%</text>
    <rect x="418" y="110" width="350" height="10" fill="#e0e0e0" stroke="black" stroke-width="1"/>
    <rect x="418" y="110" width="${350 * (cpu / 100)}" height="10" fill="black"/>
    
    <text x="418" y="140" font-family="Arial" font-size="11">Minne</text>
    <text x="750" y="140" font-family="Arial" font-size="11" text-anchor="end">${mem}%</text>
    <rect x="418" y="145" width="350" height="10" fill="#e0e0e0" stroke="black" stroke-width="1"/>
    <rect x="418" y="145" width="${350 * (mem / 100)}" height="10" fill="black"/>
    
    <rect x="22" y="197" width="376" height="125" fill="white" stroke="black" stroke-width="2"/>
    <text x="32" y="217" font-family="Arial" font-size="14" font-weight="bold">Nätverk</text>
    <text x="32" y="245" font-family="Arial" font-size="13">Uppe</text>
    <text x="360" y="245" font-family="monospace" font-size="13" text-anchor="end">↑ ${netUp} MB/s</text>
    <text x="32" y="275" font-family="Arial" font-size="13">Nere</text>
    <text x="360" y="275" font-family="monospace" font-size="13" text-anchor="end">↓ ${netDown} MB/s</text>
    
    <rect x="408" y="197" width="376" height="125" fill="white" stroke="black" stroke-width="2"/>
    <text x="418" y="217" font-family="Arial" font-size="14" font-weight="bold">Disk</text>
    <text x="418" y="245" font-family="Arial" font-size="11">Root</text>
    <text x="750" y="245" font-family="Arial" font-size="11" text-anchor="end">${diskRoot}%</text>
    <rect x="418" y="250" width="350" height="10" fill="#e0e0e0" stroke="black" stroke-width="1"/>
    <rect x="418" y="250" width="${350 * (diskRoot / 100)}" height="10" fill="black"/>
    
    <text x="418" y="280" font-family="Arial" font-size="11">Data</text>
    <text x="750" y="280" font-family="Arial" font-size="11" text-anchor="end">${diskData}%</text>
    <rect x="418" y="285" width="350" height="10" fill="#e0e0e0" stroke="black" stroke-width="1"/>
    <rect x="418" y="285" width="${350 * (diskData / 100)}" height="10" fill="black"/>
    
    <rect x="22" y="332" width="776" height="120" fill="white" stroke="black" stroke-width="2"/>
    <text x="32" y="352" font-family="Arial" font-size="14" font-weight="bold">System Info</text>
    
    <text x="42" y="385" font-family="Arial" font-size="10" fill="#666">HOSTNAME</text>
    <text x="42" y="400" font-family="monospace" font-size="14">raspberrypi</text>
    
    <text x="42" y="425" font-family="Arial" font-size="10" fill="#666">UPTIME</text>
    <text x="42" y="440" font-family="monospace" font-size="14">7d 12h 23m</text>
    
    <text x="230" y="385" font-family="Arial" font-size="10" fill="#666">IP</text>
    <text x="230" y="400" font-family="monospace" font-size="14">192.168.1.100</text>
    
    <text x="230" y="425" font-family="Arial" font-size="10" fill="#666">LAST UPDATE</text>
    <text x="230" y="440" font-family="monospace" font-size="14">${timestamp}</text>
</svg>`;
}

async function main() {
    console.log('Generating dashboard...');
    await generateDashboardImage();
    console.log('Done: output/dashboard.png');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { generateDashboardImage };
