describe('homey.js', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        delete process.env.HOMEY_IP;
        delete process.env.HOMEY_TOKEN;
        delete process.env.HOMEY_USERNAME;
        delete process.env.HOMEY_PASSWORD;
    });

    function setupMocks(axiosCreateImpl) {
        jest.doMock('axios', () => {
            const actual = jest.requireActual('axios');
            return {
                ...actual,
                create: jest.fn(axiosCreateImpl)
            };
        });
    }

    describe('fetchIndoorTemperatures', () => {
        test('returns null when no Homey credentials configured', async () => {
            setupMocks(() => ({ get: jest.fn() }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result).toBeNull();
        });

        test('returns null when no temperature devices found', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockResolvedValue({ data: {} })
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result).toBeNull();
        });

        test('returns null when no temperature readings available', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockResolvedValue({
                    data: {
                        'device-1': {
                            name: 'Sensor',
                            zoneName: 'Living Room',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: null }
                            }
                        }
                    }
                })
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result).toBeNull();
        });

        test('returns formatted room data with temperature devices', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockResolvedValue({
                    data: {
                        'device-1': {
                            name: 'Kitchen Sensor',
                            zoneName: 'Kitchen',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: 21.5 }
                            }
                        },
                        'device-2': {
                            name: 'Living Room Sensor',
                            zoneName: 'Living Room',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: 22.3 }
                            }
                        },
                        'device-3': {
                            name: 'Other Sensor',
                            zoneName: 'Bedroom',
                            capabilities: [],
                            capabilitiesObj: {}
                        }
                    }
                })
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result).not.toBeNull();
            expect(result.current).toBe(21.9);
            expect(result.rooms).toHaveLength(2);
            expect(result.rooms[0].name).toBe('Kitchen');
            expect(result.rooms[0].temp).toBe(21.5);
            expect(result.rooms[1].name).toBe('Living Room');
            expect(result.rooms[1].temp).toBe(22.3);
        });

        test('rooms are sorted by name in Swedish locale', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockResolvedValue({
                    data: {
                        'device-1': {
                            name: 'Vardagsrum',
                            zoneName: 'Vardagsrum',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: 20.0 }
                            }
                        },
                        'device-2': {
                            name: 'Kok',
                            zoneName: 'Kok',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: 22.0 }
                            }
                        }
                    }
                })
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result.rooms[0].name).toBe('Kok');
            expect(result.rooms[1].name).toBe('Vardagsrum');
        });

        test('returns null when API call fails', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockRejectedValue(new Error('Network error'))
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result).toBeNull();
        });

        test('uses zoneName as fallback when name is missing', async () => {
            process.env.HOMEY_IP = '192.168.1.100';
            process.env.HOMEY_TOKEN = 'test-token';
            setupMocks(() => ({
                get: jest.fn().mockResolvedValue({
                    data: {
                        'device-1': {
                            zoneName: 'Bedroom',
                            capabilities: ['measure_temperature'],
                            capabilitiesObj: {
                                measure_temperature: { value: 19.5 }
                            }
                        }
                    }
                })
            }));
            const { fetchIndoorTemperatures } = require('../src/services/homey.ts');
            const result = await fetchIndoorTemperatures();
            expect(result.rooms[0].name).toBe('Bedroom');
        });
    });
});
