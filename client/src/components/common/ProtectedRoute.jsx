import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3 animate-in">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--cyan)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
};

export default ProtectedRoute;
