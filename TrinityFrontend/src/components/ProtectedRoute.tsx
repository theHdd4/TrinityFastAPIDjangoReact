
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user is authenticated but trying to access main routes without going through projects
  // redirect them to projects first (except if they're already on projects page)
  if (location.pathname !== '/projects' && 
      (location.pathname === '/' || 
       location.pathname === '/workflow' || 
       location.pathname === '/laboratory' || 
       location.pathname === '/exhibition')) {
    const hasSelectedProject = localStorage.getItem('current-project');
    if (!hasSelectedProject) {
      return <Navigate to="/projects" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
