describe('data.js caching', () => {
    beforeEach(() => {
        jest.resetModules();
        delete process.env.N8N_WEBHOOK_WEATHER;
        delete process.env.N8N_WEBHOOK_CALENDAR;
        delete process.env.N8N_WEBHOOK_LUNCH;
        delete process.env.N8N_WEBHOOK_INDOOR;
        delete process.env.HOMEY_IP;
        delete process.env.HOMEY_TOKEN;
    });

    test('fetchWeather returns null when URL not configured', async () => {
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        axios.get = jest.fn();
        const { fetchAllData } = require('../src/services/data');
        const result = await fetchAllData();
        expect(result.weather).toBeNull();
    });

    test('fetchWeather returns data on successful API call', async () => {
        process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
        jest.resetModules();
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        const mockWeatherData = {
            current: { temperature_2m: 20, weather_code: 1 },
            daily: {
                temperature_2m_max: [25, 22, 23, 24],
                temperature_2m_min: [15, 12, 13, 14],
                precipitation_probability_max: [10, 20, 30, 40],
                weather_code: [0, 1, 2, 3]
            }
        };
        axios.get = jest.fn().mockResolvedValueOnce({ data: [mockWeatherData] });
        const { fetchAllData } = require('../src/services/data');

        const result = await fetchAllData();

        expect(result.weather).not.toBeNull();
        expect(result.weather.outdoor.current).toBe(20);
        expect(result.weather.outdoor.forecast).toHaveLength(3);
    });

    test('cache returns cached data on subsequent calls', async () => {
        process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
        process.env.WEATHER_REFRESH_MINUTES = '60';
        jest.resetModules();
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        const mockWeatherData = {
            current: { temperature_2m: 20, weather_code: 1 },
            daily: {
                temperature_2m_max: [25],
                temperature_2m_min: [15],
                precipitation_probability_max: [10],
                weather_code: [0]
            }
        };
        axios.get = jest.fn().mockResolvedValue({ data: [mockWeatherData] });
        const { fetchAllData } = require('../src/services/data');

        const result1 = await fetchAllData();
        const result2 = await fetchAllData();

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(result1.weather).toEqual(result2.weather);
    });

    test('fetchAllDataFresh bypasses cache', async () => {
        process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
        process.env.WEATHER_REFRESH_MINUTES = '60';
        jest.resetModules();
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        const mockWeatherData = {
            current: { temperature_2m: 20, weather_code: 1 },
            daily: {
                temperature_2m_max: [25],
                temperature_2m_min: [15],
                precipitation_probability_max: [10],
                weather_code: [0]
            }
        };
        axios.get = jest.fn()
            .mockResolvedValueOnce({ data: [mockWeatherData] })
            .mockResolvedValueOnce({ data: [mockWeatherData] });
        const { fetchAllData, fetchAllDataFresh } = require('../src/services/data');

        await fetchAllData();
        await fetchAllDataFresh();

        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('fetchWeatherFresh invalidates weather cache', async () => {
        process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
        process.env.WEATHER_REFRESH_MINUTES = '60';
        jest.resetModules();
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        const mockWeatherData = {
            current: { temperature_2m: 20, weather_code: 1 },
            daily: {
                temperature_2m_max: [25],
                temperature_2m_min: [15],
                precipitation_probability_max: [10],
                weather_code: [0]
            }
        };
        axios.get = jest.fn()
            .mockResolvedValueOnce({ data: [mockWeatherData] })
            .mockResolvedValueOnce({ data: [mockWeatherData] });
        const { fetchAllData, fetchWeatherFresh } = require('../src/services/data');

        await fetchAllData();
        await fetchWeatherFresh();

        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('normalizeWeather skips today and uses next 3 days', async () => {
        process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
        jest.resetModules();
        jest.mock('axios');
        jest.mock('../src/services/homey', () => ({
            fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
        }));
        const axios = require('axios');
        const mockWeatherData = {
            current: { temperature_2m: 20, weather_code: 1 },
            daily: {
                temperature_2m_max: [25, 26, 27, 28],
                temperature_2m_min: [15, 16, 17, 18],
                precipitation_probability_max: [10, 20, 30, 40],
                weather_code: [0, 1, 2, 3]
            }
        };
        axios.get = jest.fn().mockResolvedValueOnce({ data: [mockWeatherData] });
        const { fetchAllData } = require('../src/services/data');

        const result = await fetchAllData();

        expect(result.weather.outdoor.forecast).toHaveLength(3);
        expect(result.weather.outdoor.forecast[0].max).toBe(26);
    });
});
