function updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('timestamp').textContent = formatted;
    document.getElementById('last-update').textContent = formatted;
}

function updateGauge(elementId, value, max, unit) {
    const percentage = (value / max) * 100;
    const gauge = document.getElementById(elementId);
    if (gauge) {
        gauge.querySelector('.gauge-value').textContent = value.toFixed(1) + unit;
        gauge.querySelector('.gauge-fill').style.width = percentage + '%';
    }
}

function updateProgress(labelId, barId, percentage) {
    const label = document.getElementById(labelId);
    const bar = document.getElementById(barId);
    if (label) label.textContent = percentage + '%';
    if (bar) bar.style.width = percentage + '%';
}

function updateStat(labelId, value) {
    const element = document.getElementById(labelId);
    if (element) element.textContent = value;
}

function updateInfo(labelId, value) {
    const element = document.getElementById(labelId);
    if (element) element.textContent = value;
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
}

async function fetchSystemData() {
    try {
        const response = await fetch('/api/system');
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

function updateDashboard(data) {
    if (!data) {
        generateMockData();
        return;
    }

    updateGauge('temp-gauge', data.temperature || 0, 50, '°C');
    updateProgress('cpu-value', 'cpu-bar', data.cpu || 0);
    updateProgress('mem-value', 'mem-bar', data.memory || 0);
    updateProgress('disk-root-value', 'disk-root-bar', data.diskRoot || 0);
    updateProgress('disk-data-value', 'disk-data-bar', data.diskData || 0);
    updateStat('network-up', '↑ ' + (data.networkUp || 0) + ' KB/s');
    updateStat('network-down', '↓ ' + (data.networkDown || 0) + ' KB/s');
    updateInfo('hostname', data.hostname || 'unknown');
    updateInfo('uptime', formatUptime(data.uptime || 0));
    updateInfo('ip', data.ip || '0.0.0.0');
}

function generateMockData() {
    const data = {
        temperature: 20 + Math.random() * 15,
        cpu: Math.floor(Math.random() * 80 + 10),
        memory: Math.floor(Math.random() * 60 + 20),
        diskRoot: Math.floor(Math.random() * 40 + 50),
        diskData: Math.floor(Math.random() * 50 + 10),
        networkUp: (Math.random() * 5).toFixed(1),
        networkDown: (Math.random() * 10).toFixed(1),
        hostname: 'raspberrypi',
        uptime: Math.floor(Math.random() * 604800 + 86400),
        ip: '192.168.1.' + Math.floor(Math.random() * 254 + 1)
    };

    updateGauge('temp-gauge', data.temperature, 50, '°C');
    updateProgress('cpu-value', 'cpu-bar', data.cpu);
    updateProgress('mem-value', 'mem-bar', data.memory);
    updateProgress('disk-root-value', 'disk-root-bar', data.diskRoot);
    updateProgress('disk-data-value', 'disk-data-bar', data.diskData);
    updateStat('network-up', '↑ ' + data.networkUp + ' KB/s');
    updateStat('network-down', '↓ ' + data.networkDown + ' KB/s');
    updateInfo('hostname', data.hostname);
    updateInfo('uptime', formatUptime(data.uptime));
    updateInfo('ip', data.ip);
}

updateTimestamp();
generateMockData();
setInterval(() => {
    updateTimestamp();
    generateMockData();
}, 30000);
