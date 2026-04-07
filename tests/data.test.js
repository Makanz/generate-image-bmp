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

    describe('race condition prevention', () => {
        test('concurrent fetchAllData calls share single pending fetch', async () => {
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

            let callCount = 0;
            const mockFn = jest.fn(async () => {
                callCount++;
                await new Promise(r => setTimeout(r, 50));
                return { data: [mockWeatherData] };
            });
            setupMocks(mockFn);

            const { fetchAllData } = require('../src/services/data');

            const [result1, result2] = await Promise.all([
                fetchAllData(),
                fetchAllData()
            ]);

            expect(callCount).toBe(1);
            expect(result1).toEqual(result2);
        });

        test('fetchAllDataFresh does not cause duplicate fetches with concurrent requests', async () => {
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

            let callCount = 0;
            const mockFn = jest.fn(async () => {
                callCount++;
                await new Promise(r => setTimeout(r, 50));
                return { data: [mockWeatherData] };
            });
            setupMocks(mockFn);

            const { fetchAllData, fetchAllDataFresh } = require('../src/services/data');

            await fetchAllData();

            const [, result2] = await Promise.all([
                fetchAllDataFresh(),
                fetchAllData()
            ]);

            expect(callCount).toBe(2);
            expect(result2.weather).not.toBeNull();
        });
    });

    describe('error handling preserves stale cache', () => {
        test('returns stale cached data when API fails after a successful fetch', async () => {
            process.env.N8N_WEBHOOK_WEATHER = 'http://test.local/weather';
            process.env.WEATHER_REFRESH_MINUTES = '0'; // expire immediately
            const mockWeatherData = {
                current: { temperature_2m: 22, weather_code: 1, wind_speed_10m: 5, relative_humidity_2m: 60 },
                daily: {
                    temperature_2m_max: [22, 24, 25, 26],
                    temperature_2m_min: [12, 13, 14, 15],
                    precipitation_probability_max: [0, 10, 20, 30],
                    weather_code: [1, 0, 2, 3]
                }
            };
            let callCount = 0;
            const mockFn = jest.fn(async () => {
                callCount++;
                if (callCount === 1) return { data: [mockWeatherData] };
                throw new Error('API unavailable');
            });
            setupMocks(mockFn);
            const { fetchAllData, fetchAllDataFresh } = require('../src/services/data');

            // First fetch succeeds and populates cache
            const first = await fetchAllData();
            expect(first.weather).not.toBeNull();
            expect(first.weather.outdoor.current).toBe(22);

            // Force cache expiry and fetch again — API now fails
            const second = await fetchAllDataFresh();

            // Should still return the previously cached data, not null
            expect(second.weather).not.toBeNull();
            expect(second.weather.outdoor.current).toBe(22);
            expect(callCount).toBe(2);
        });
    });


        function setupMocksAndFs(axiosGetImpl, fsOps) {
            jest.doMock('axios', () => ({
                get: jest.fn(axiosGetImpl)
            }));
            jest.doMock('../src/services/homey', () => ({
                fetchIndoorTemperatures: jest.fn().mockResolvedValue(null)
            }));
            const mockFs = {
                mkdir: jest.fn().mockResolvedValue(undefined),
                writeFile: jest.fn().mockResolvedValue(undefined),
                readFile: jest.fn().mockResolvedValue(JSON.stringify(fsOps))
            };
            if (fsOps === 'missing') {
                mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
            } else if (fsOps === 'corrupt') {
                mockFs.readFile.mockResolvedValue('not valid json{{{');
            }
            jest.doMock('fs/promises', () => mockFs);
            return mockFs;
        }

        test('persistCache writes cache.json after successful fetch', async () => {
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
            const mockFs = setupMocksAndFs(() => Promise.resolve({ data: [mockWeatherData] }), {});
            const { fetchAllData, persistCache } = require('../src/services/data');

            await fetchAllData();
            await persistCache();

            expect(mockFs.writeFile).toHaveBeenCalled();
            const writtenPath = mockFs.writeFile.mock.calls[0][0];
            expect(writtenPath).toMatch(/cache\.json$/);
            const writtenContent = JSON.parse(mockFs.writeFile.mock.calls[0][1]);
            expect(writtenContent.weather.data).not.toBeNull();
            expect(writtenContent.weather.data.outdoor.current).toBe(20);
        });

        test('restoreCache loads valid entries from disk', async () => {
            const freshTimestamp = Date.now() - 60000;
            const cacheData = {
                weather: {
                    data: { outdoor: { current: 25, forecast: [] }, current_weather_code: 0, wind_speed: 5, humidity: 50 },
                    timestamp: freshTimestamp
                },
                calendar: { data: null, timestamp: 0 },
                lunch: { data: null, timestamp: 0 },
                indoor: { data: null, timestamp: 0 }
            };
            setupMocksAndFs(() => Promise.reject(new Error('should not be called')), cacheData);
            const { restoreCache, fetchAllData } = require('../src/services/data');

            await restoreCache();
            const result = await fetchAllData();

            expect(result.weather).not.toBeNull();
            expect(result.weather.outdoor.current).toBe(25);
        });

        test('restoreCache skips expired entries', async () => {
            const staleTimestamp = Date.now() - 24 * 60 * 60 * 1000;
            const cacheData = {
                weather: {
                    data: { outdoor: { current: 99, forecast: [] }, current_weather_code: 0, wind_speed: 0, humidity: 0 },
                    timestamp: staleTimestamp
                },
                calendar: { data: null, timestamp: 0 },
                lunch: { data: null, timestamp: 0 },
                indoor: { data: null, timestamp: 0 }
            };
            setupMocksAndFs(() => Promise.reject(new Error('should not be called')), cacheData);
            const { restoreCache, fetchAllData } = require('../src/services/data');

            await restoreCache();
            const result = await fetchAllData();

            expect(result.weather).toBeNull();
        });

        test('restoreCache handles missing file gracefully', async () => {
            setupMocksAndFs(() => Promise.reject(new Error('should not be called')), 'missing');
            const { restoreCache, fetchAllData } = require('../src/services/data');

            await expect(restoreCache()).resolves.not.toThrow();
            const result = await fetchAllData();
            expect(result.weather).toBeNull();
        });

        test('restoreCache handles corrupt JSON gracefully', async () => {
            setupMocksAndFs(() => Promise.reject(new Error('should not be called')), 'corrupt');
            const { restoreCache, fetchAllData } = require('../src/services/data');

            await expect(restoreCache()).resolves.not.toThrow();
            const result = await fetchAllData();
            expect(result.weather).toBeNull();
        });

        test('persistCache handles write errors gracefully', async () => {
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
            const mockFs = setupMocksAndFs(() => Promise.resolve({ data: [mockWeatherData] }), {});
            mockFs.writeFile.mockRejectedValue(new Error('EACCES'));
            const { fetchAllData, persistCache } = require('../src/services/data');

            await fetchAllData();
            await expect(persistCache()).resolves.not.toThrow();
        });

        test('restored cache prevents re-fetch within TTL', async () => {
            const freshTimestamp = Date.now() - 60000;
            const cacheData = {
                weather: {
                    data: { outdoor: { current: 30, forecast: [] }, current_weather_code: 1, wind_speed: 10, humidity: 60 },
                    timestamp: freshTimestamp
                },
                calendar: { data: null, timestamp: 0 },
                lunch: { data: null, timestamp: 0 },
                indoor: { data: null, timestamp: 0 }
            };
            const mockWeatherPayload = {
                current: { temperature_2m: 99 },
                daily: {
                    temperature_2m_max: [99],
                    temperature_2m_min: [99],
                    precipitation_probability_max: [0],
                    weather_code: [0]
                }
            };
            const mockFn = jest.fn(() => Promise.resolve({ data: [mockWeatherPayload] }));
            setupMocksAndFs(mockFn, cacheData);
            const { restoreCache, fetchAllData } = require('../src/services/data');

            await restoreCache();
            await fetchAllData();

            expect(mockFn).toHaveBeenCalledTimes(0);
        });
    });
});
