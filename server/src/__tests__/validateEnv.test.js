describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set all required vars
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'test-secret-123';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-123';
    process.env.UEBA_SERVICE_URL = 'http://localhost:8000';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass when all required vars are set', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const validateEnv = require('../config/validateEnv');
    validateEnv();
    expect(mockExit).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('should exit if MONGODB_URI is missing', () => {
    delete process.env.MONGODB_URI;
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const validateEnv = require('../config/validateEnv');
    validateEnv();
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('should exit if JWT_SECRET is default placeholder', () => {
    process.env.JWT_SECRET = 'your-super-secret-jwt-key-change-this';
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const validateEnv = require('../config/validateEnv');
    validateEnv();
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
