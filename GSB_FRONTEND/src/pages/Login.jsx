import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../auth';
import { api, isBusError } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (!isBusError(err) || ['network', 'timeout'].includes(err.kind)) {
        setError('Server connection error.');
      } else if (err.code === 'LOGIN_FAILED') {
        setError('Invalid email or password');
      } else if (err.code === 'LOGIN_LOCKED') {
        const minutes = Math.max(1, Math.ceil((err.retryAfterMs ?? 0) / 60000));
        setError(`Too many attempts. Try again in ${minutes} min.`);
      } else {
        setError(err.message || 'Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    if (registerPassword !== registerConfirm) {
      setRegisterError('Passwords do not match.');
      return;
    }
    try {
      await api.post('/auth/register', { name: registerName, email: registerEmail, password: registerPassword }, { auth: false });
      setRegisterSuccess('Account created successfully! Please log in.');
      setIsRegister(false);
      setRegisterName(''); setRegisterEmail(''); setRegisterPassword(''); setRegisterConfirm('');
    } catch (err) {
      if (!isBusError(err) || ['network', 'timeout'].includes(err.kind)) {
        setRegisterError('Server connection error.');
      } else {
        setRegisterError(err.message || 'Error creating account.');
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-blue-50 to-blue-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Link
        to="/monitor"
        title="Monitoring du backend (administrateurs)"
        className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-white hover:border-blue-300"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 14l5-6 4 3 7-8" />
        </svg>
        Monitoring
      </Link>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
          GSB Bill Manager
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isRegister ? 'Create a user account' : 'Sign in to your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {registerSuccess && (
            <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4 text-green-700">
              <p>{registerSuccess}</p>
            </div>
          )}
          {isRegister ? (
            <form className="space-y-6" onSubmit={handleRegister}>
              <div>
                <label htmlFor="register-name" className="block text-sm font-medium text-gray-700">Name</label>
                <div className="mt-1">
                  <input id="register-name" name="register-name" type="text" required value={registerName} onChange={e => setRegisterName(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-gray-700">Email address</label>
                <div className="mt-1">
                  <input id="register-email" name="register-email" type="email" required value={registerEmail} onChange={e => setRegisterEmail(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="register-password" className="block text-sm font-medium text-gray-700">Password</label>
                <div className="mt-1">
                  <input id="register-password" name="register-password" type="password" required value={registerPassword} onChange={e => setRegisterPassword(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="register-confirm" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                <div className="mt-1">
                  <input id="register-confirm" name="register-confirm" type="password" required value={registerConfirm} onChange={e => setRegisterConfirm(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
                </div>
              </div>
              {registerError && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
                  <p>{registerError}</p>
                </div>
              )}
              <div>
                <button type="submit" className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Create account</button>
              </div>
              <div className="text-sm text-center mt-2">
                <button type="button" className="text-blue-600 hover:text-blue-500 underline" onClick={() => setIsRegister(false)}>Already have an account? Sign in</button>
              </div>
            </form>
          ) : (
            <>
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 text-red-700">
              <p>{error}</p>
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="mt-1">
                    <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
              </div>
            </div>
            <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1">
                    <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                    <input id="remember-me" name="remember-me" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">Remember me</label>
              </div>
              <div className="text-sm">
                    <a href="#" className="font-medium text-blue-600 hover:text-blue-500">Forgot your password?</a>
              </div>
            </div>
            <div>
                  <button type="submit" disabled={isLoading} className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">{isLoading ? 'Signing in...' : 'Sign in'}</button>
            </div>
          </form>
              <div className="text-sm text-center mt-4">
                <button type="button" className="text-blue-600 hover:text-blue-500 underline" onClick={() => setIsRegister(true)}>Create an account</button>
              </div>
            </>
          )}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">Or continue with</span>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M6.29 18.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0020 3.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.073 4.073 0 01.8 7.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 010 16.407a11.616 11.616 0 006.29 1.84" /></svg>
                Twitter
              </button>
              <button type="button" className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" /></svg>
                GitHub
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 