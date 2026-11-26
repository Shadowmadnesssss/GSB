import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Stats from './pages/Stats';
import Users from './pages/Users';
import Settings from './pages/Settings';
import PrivateRoute from './PrivateRoute';
import Sidebar from './components/Sidebar';
import { isAuthenticated } from './auth';

// Monitoring du backend (SDK Bus TCL), chargé seulement quand on ouvre /monitor.
const MonitorPage = lazy(() => import('./monitor/MonitorPage.jsx'));

function AppLayout({ children }) {
  const user = JSON.parse(localStorage.getItem('user'));
  const isAdmin = user?.role === 'admin';
  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex-1 ml-64 bg-gradient-to-br from-[#101828] via-[#16213e] to-[#223047] min-h-screen">
        {children}
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated() ? 
              <Navigate to="/dashboard" replace /> : 
              <Login />
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            <PrivateRoute>
              <AppLayout>
              <Dashboard />
              </AppLayout>
            </PrivateRoute>
          }
        />
        <Route 
          path="/stats"
          element={
            <PrivateRoute>
              <AppLayout>
                <Stats />
              </AppLayout>
            </PrivateRoute>
          }
        />
        <Route 
          path="/users"
          element={
            <PrivateRoute>
              <AppLayout>
                <Users />
              </AppLayout>
            </PrivateRoute>
          }
        />
        <Route 
          path="/settings"
          element={
            <PrivateRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </PrivateRoute>
          } 
        />
        <Route
          path="/monitor"
          element={
            <Suspense fallback={null}>
              <MonitorPage />
            </Suspense>
          }
        />
        <Route path="/" element={<Navigate to={isAuthenticated() ? "/dashboard" : "/login"} />} />
      </Routes>
    </Router>
  );
}

export default App;
