import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { getDeviceFingerprint } from '../utils/fingerprint';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riskAssessment, setRiskAssessment] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      await getDeviceFingerprint();
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          setUser(data.data.user);
          // Use average risk from server (across all sessions), fall back to cached session risk
          if (data.data.user.avgRiskScore !== undefined) {
            const avgRisk = {
              score: data.data.user.avgRiskScore,
              level: data.data.user.avgRiskLevel,
              recommendation: data.data.user.avgRiskLevel === 'low' ? 'allow' : 'step_up',
            };
            setRiskAssessment(avgRisk);
            localStorage.setItem('riskAssessment', JSON.stringify(avgRisk));
          } else {
            const cachedRisk = localStorage.getItem('riskAssessment');
            if (cachedRisk) setRiskAssessment(JSON.parse(cachedRisk));
          }
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('riskAssessment');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = useCallback(async (email, password, simulation = null) => {
    // Ensure fingerprint is ready before login request
    await getDeviceFingerprint();
    const payload = { email, password };
    if (simulation) payload.simulation = simulation;
    const { data } = await api.post('/auth/login', payload);

    if (data.stepUpRequired) {
      // Step-up required: store pending token (only valid for step-up routes)
      localStorage.setItem('accessToken', data.data.pendingToken);
      // Do NOT set user or navigate — login is not complete yet
      if (data.data.riskAssessment) {
        setRiskAssessment(data.data.riskAssessment);
        localStorage.setItem('riskAssessment', JSON.stringify(data.data.riskAssessment));
      }
      return data;
    }

    // Clean login — full tokens issued
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    setUser(data.data.user);
    if (data.data.riskAssessment) {
      setRiskAssessment(data.data.riskAssessment);
      localStorage.setItem('riskAssessment', JSON.stringify(data.data.riskAssessment));
    }
    return data;
  }, []);

  const register = useCallback(async (formData) => {
    await getDeviceFingerprint();
    const { data } = await api.post('/auth/register', formData);
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    setUser(data.data.user);
    setRiskAssessment({ score: 0, level: 'low', recommendation: 'allow', factors: [] });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('riskAssessment');
    setUser(null);
    setRiskAssessment(null);
  }, []);

  // Called after step-up verification completes — stores real tokens and sets user
  const completeStepUp = useCallback(async (accessToken, refreshToken, userData) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    if (userData) setUser(userData);
    // Mark session as low risk so step-up modal doesn't re-trigger
    const sessionRisk = { score: 0, level: 'low', recommendation: 'allow' };
    setRiskAssessment(sessionRisk);
    localStorage.setItem('riskAssessment', JSON.stringify(sessionRisk));
    // Re-fetch user to get real avgRiskScore from server
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data.user);
    } catch { /* user data from step-up response is sufficient */ }
  }, []);

  const updateUser = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, updateUser, completeStepUp,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      riskAssessment,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
