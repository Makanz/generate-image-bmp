const UI_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function updateDate() {
    const now = new Date();
    document.getElementById('date-year').textContent = now.getFullYear();
    document.getElementById('date-day').textContent = now.getDate();
    document.getElementById('date-month').textContent = MONTHS_SV[now.getMonth()];
}

function generateMockData() {
    updateTemperature(
        {
            outdoor: {
                current: 9,
                forecast: [{ temp: 12 }, { temp: 8 }, { temp: 6 }]
            }
        },
        {
            current: 20,
            rooms: [
                { name: 'KÖK', temp: 21 },
                { name: 'V-RUM', temp: 22 },
                { name: 'S-RUM', temp: 20 }
            ]
        }
    );

    updateSchoolLunch([
        {
            datum: 'Måndag 23 Mars',
            meny: ['Klimatsmartvecka: Chilipanna med ris', 'Falafelbiff med ris', 'Salladsbuffe']
        },
        {
            datum: 'Tisdag 24 Mars',
            meny: ['Västkustfisk med potatismos', 'Blomkålssoppa', 'Salladsbuffe']
        }
    ]);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    updateCalendar({
        events: [
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).toISOString(), summary: 'Soptömning' },
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0).toISOString(), summary: 'Falukorv & mos' },
            { datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 30).toISOString(), summary: 'Makerspace' },
            { datetime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 7, 0).toISOString(), summary: 'Lämna bilen' },
            { datetime: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 17, 0).toISOString(), summary: 'Kvällsmat' }
        ]
    });
}

function markDataLoaded() {
    document.body.dataset.loaded = 'true';
}

function allDataEmpty(data) {
    return !data.weather && !data.indoor && !data.lunch && !data.calendar;
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            console.warn('[ui] API request failed, using mock data');
            generateMockData();
            markDataLoaded();
            return;
        }
        const data = await response.json();

        if (allDataEmpty(data)) {
            generateMockData();
            markDataLoaded();
            return;
        }

        updateTemperature(data.weather, data.indoor);
        updateSchoolLunch(data.lunch);
        updateCalendar(data.calendar);
        markDataLoaded();
    } catch {
        console.warn('[ui] Failed to fetch data, using mock data');
        generateMockData();
        markDataLoaded();
    }
}

updateDate();
fetchData();

setInterval(() => {
    updateDate();
    fetchData();
}, UI_REFRESH_INTERVAL_MS);
