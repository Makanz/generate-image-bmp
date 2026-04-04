const prevTemps = { ute: null, inne: null };
const FORECAST_COUNT = 3;

function updateTempDisplay(elementId, value, trendKey) {
    const rounded = Math.round(value);
    const trend = getTrend(rounded, prevTemps[trendKey]);
    prevTemps[trendKey] = rounded;
    document.getElementById(`${elementId}-temp-val`).textContent = rounded;
    document.getElementById(`${elementId}-trend`).textContent = trend;
}

function updateTemperature(weather, indoor) {
    if (weather) {
        const current = weather.outdoor?.current ?? weather.temperature;
        if (current !== undefined) {
            updateTempDisplay('ute', current, 'ute');
        }
        const forecast = weather.outdoor?.forecast || [];
        for (let i = 0; i < FORECAST_COUNT; i++) {
            const el = document.getElementById(`forecast-${i}`);
            if (el) {
                el.textContent = forecast[i] !== undefined
                    ? Math.round(forecast[i].temp ?? forecast[i]) + '°'
                    : '--°';
            }
        }
    }

    if (indoor) {
        const current = indoor.current;
        if (current !== undefined) {
            updateTempDisplay('inne', current, 'inne');
        }
        renderRoomChart(indoor.rooms || []);
    }
}

function renderRoomChart(rooms) {
    const container = document.getElementById('room-chart');
    if (!rooms || rooms.length === 0) {
        container.innerHTML = '';
        return;
    }

    const rows = rooms.map(room => {
        const val = Math.round(room.temp);
        const label = room.name.toUpperCase();
        return `<div class="room-row"><span class="room-name">${escapeHtml(label)}</span><span class="room-temp">${val}°</span></div>`;
    });

    container.innerHTML = rows.join('');
}
