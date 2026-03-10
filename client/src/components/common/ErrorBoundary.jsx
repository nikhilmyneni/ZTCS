import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
          <div className="card-elevated text-center max-w-md w-full space-y-6 animate-scale">
            <div
              className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.15)' }}
            >
              <AlertTriangle size={28} style={{ color: 'var(--red)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
                Something went wrong
              </h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                An unexpected error occurred. Please try again or refresh the page.
              </p>
            </div>
            {this.state.error && (
              <div
                className="text-left p-3 rounded-lg text-xs overflow-auto max-h-32"
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleRetry} className="btn-primary flex items-center gap-2">
                <RefreshCw size={14} />
                Try Again
              </button>
              <button onClick={() => window.location.reload()} className="btn-secondary">
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
