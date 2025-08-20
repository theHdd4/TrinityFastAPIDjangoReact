import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔍 ErrorBoundary caught an error:', error);
    console.error('🔍 Error info:', errorInfo);
    console.error('🔍 Component stack:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-4">
          <h2 className="text-lg font-semibold text-red-800 mb-4">
            Something went wrong in ExploreSettings
          </h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-red-700 mb-2">Error:</h3>
              <pre className="bg-red-100 p-3 rounded text-sm text-red-800 overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </div>
            
            <div>
              <h3 className="font-medium text-red-700 mb-2">Component Stack:</h3>
              <pre className="bg-red-100 p-3 rounded text-sm text-red-800 overflow-auto">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
            
            <button
              onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
