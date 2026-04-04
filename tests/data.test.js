describe('data.js', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        delete process.env.N8N_WEBHOOK_WEATHER;
        delete process.env.N8N_WEBHOOK_CALENDAR;
        delete process.env.N8N_WEBHOOK_LUNCH;
        delete process.env.N8N_WEBHOOK_INDOOR;
        delete process.env.HOMEY_IP;
        delete process.env.HOMEY_TOKEN;
        delete process.env.WEATHER_REFRESH_MINUTES;
        delete process.env.CALENDAR_REFRESH_MINUTES;
        delete process.env.LUNCH_REFRESH_HOURS;
        delete process.env.INDOOR_REFRESH_MINUTES;
        delete process.env.ERROR_RETRY_MINUTES;
    });

    function setupMocks(axiosGetImpl) {
        jest.doMock('axios', () => ({
            get: jest.fn(axiosGetImpl)
        }));
        jest.doMock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
    }

    describe('normalizeWeather via fetchAllData', () => {
        test('returns null for null input', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            setupMocks(() => Promise.resolve({ data: null }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.weather).toBeNull();
        });

        test('handles single weather object', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            const mockWeatherData = {
                current: { temperature_2m: 15, weather_code: 2, wind_speed_10m: 10, relative_humidity_2m: 65 },
                daily: {
                    temperature_2m_max: [15, 18, 17, 16],
                    temperature_2m_min: [8, 9, 10, 11],
                    precipitation_probability_max: [0, 20, 30, 10],
                    weather_code: [2, 1, 3, 0]
                }
            };
            setupMocks(() => Promise.resolve({ data: mockWeatherData }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.weather).not.toBeNull();
            expect(result.weather.outdoor.current).toBe(15);
            expect(result.weather.current_weather_code).toBe(2);
            expect(result.weather.wind_speed).toBe(10);
            expect(result.weather.humidity).toBe(65);
            expect(result.weather.outdoor.forecast).toHaveLength(3);
            expect(result.weather.outdoor.forecast[0].max).toBe(18);
            expect(result.weather.outdoor.forecast[0].min).toBe(9);
        });

        test('handles array input', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            const mockWeatherData = {
                current: { temperature_2m: 20 },
                daily: {
                    temperature_2m_max: [20, 22, 23, 24],
                    temperature_2m_min: [10, 11, 12, 13],
                    precipitation_probability_max: [0, 10, 20, 30],
                    weather_code: [0, 1, 2, 3]
                }
            };
            setupMocks(() => Promise.resolve({ data: [mockWeatherData] }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.weather).not.toBeNull();
            expect(result.weather.outdoor.current).toBe(20);
            expect(result.weather.outdoor.forecast).toHaveLength(3);
        });

        test('forecast skips index 0 (today)', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            const mockWeatherData = {
                current: { temperature_2m: 25 },
                daily: {
                    temperature_2m_max: [25, 26, 27, 28],
                    temperature_2m_min: [15, 16, 17, 18],
                    precipitation_probability_max: [0, 10, 20, 30],
                    weather_code: [0, 1, 2, 3]
                }
            };
            setupMocks(() => Promise.resolve({ data: mockWeatherData }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.weather.outdoor.forecast[0].max).toBe(26);
            expect(result.weather.outdoor.forecast[1].max).toBe(27);
            expect(result.weather.outdoor.forecast[2].max).toBe(28);
        });
    });

    describe('normalizeIndoor via fetchAllData', () => {
        test('returns null when HOMEY not configured', async () => {
            setupMocks(() => Promise.reject(new Error('not configured')));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.indoor).toBeNull();
        });

        test('returns indoor data when webhook configured', async () => {
            process.env.N8N_WEBHOOK_INDOOR = 'http://test.local/indoor';
            const mockIndoorData = {
                current: 21.0,
                rooms: [
                    { name: 'Kitchen', temp: 22.0 },
                    { name: 'Living Room', temp: 20.0 }
                ]
            };
            setupMocks(() => Promise.resolve({ data: mockIndoorData }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.indoor).not.toBeNull();
            expect(result.indoor.current).toBe(21.0);
            expect(result.indoor.rooms).toHaveLength(2);
        });

        test('filters out rooms with null temp', async () => {
            process.env.N8N_WEBHOOK_INDOOR = 'http://test.local/indoor';
            const mockIndoorData = {
                current: 20.0,
                rooms: [
                    { name: 'Kitchen', temp: 22.0 },
                    { name: 'Bedroom', temp: null },
                    { name: 'Living Room', temp: 20.0 }
                ]
            };
            setupMocks(() => Promise.resolve({ data: mockIndoorData }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result.indoor.rooms).toHaveLength(2);
        });
    });

    describe('isCacheValid', () => {
        test('returns cached data on subsequent calls within TTL', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            process.env.WEATHER_REFRESH_MINUTES = '60';
            const mockWeatherData = {
                current: { temperature_2m: 20 },
                daily: {
                    temperature_2m_max: [20, 22, 23, 24],
                    temperature_2m_min: [10, 11, 12, 13],
                    precipitation_probability_max: [0, 10, 20, 30],
                    weather_code: [0, 1, 2, 3]
                }
            };
            const mockFn = jest.fn(() => Promise.resolve({ data: [mockWeatherData] }));
            setupMocks(mockFn);
            const { fetchAllData } = require('../src/services/data');
            await fetchAllData();
            await fetchAllData();
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchAllData', () => {
        test('returns all data sources with timestamp', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            const mockWeatherData = {
                current: { temperature_2m: 20 },
                daily: {
                    temperature_2m_max: [20, 22, 23, 24],
                    temperature_2m_min: [10, 11, 12, 13],
                    precipitation_probability_max: [0, 10, 20, 30],
                    weather_code: [0, 1, 2, 3]
                }
            };
            setupMocks(() => Promise.resolve({ data: [mockWeatherData] }));
            const { fetchAllData } = require('../src/services/data');
            const result = await fetchAllData();
            expect(result).toHaveProperty('weather');
            expect(result).toHaveProperty('calendar');
            expect(result).toHaveProperty('lunch');
            expect(result).toHaveProperty('indoor');
            expect(result).toHaveProperty('timestamp');
        });
    });

    describe('fetchAllDataFresh bypasses cache', () => {
        test('makes new API calls after fresh call', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            process.env.WEATHER_REFRESH_MINUTES = '60';
            const mockWeatherData = {
                current: { temperature_2m: 20, weather_code: 1 },
                daily: {
                    temperature_2m_max: [25],
                    temperature_2m_min: [15],
                    precipitation_probability_max: [10],
                    weather_code: [0]
                }
            };
            const mockFn = jest.fn(() => Promise.resolve({ data: [mockWeatherData] }));
            setupMocks(mockFn);
            const { fetchAllData, fetchAllDataFresh } = require('../src/services/data');
            await fetchAllData();
            await fetchAllDataFresh();
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });

    describe('fetchWeatherFresh invalidates weather cache', () => {
        test('makes new API calls after fresh call', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            process.env.WEATHER_REFRESH_MINUTES = '60';
            const mockWeatherData = {
                current: { temperature_2m: 20, weather_code: 1 },
                daily: {
                    temperature_2m_max: [25],
                    temperature_2m_min: [15],
                    precipitation_probability_max: [10],
                    weather_code: [0]
                }
            };
            const mockFn = jest.fn(() => Promise.resolve({ data: [mockWeatherData] }));
            setupMocks(mockFn);
            const { fetchAllData, fetchWeatherFresh } = require('../src/services/data');
            await fetchAllData();
            await fetchWeatherFresh();
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
    });
});
