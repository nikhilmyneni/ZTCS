describe('UEBA Circuit Breaker', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should export getCircuitBreakerState', () => {
    const { getCircuitBreakerState } = require('../services/uebaService');
    const state = getCircuitBreakerState();
    expect(state).toHaveProperty('state');
    expect(state).toHaveProperty('failures');
    expect(state.state).toBe('closed');
    expect(state.failures).toBe(0);
  });
});
