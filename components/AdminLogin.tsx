
import React, { useState } from 'react';
import { Button } from './NotionUI';
import { IconLock, IconShield, IconChevronLeft } from '../constants';

interface AdminLoginProps {
    onLoginSuccess: () => void;
    onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Simulated Auth Delay
        setTimeout(() => {
            if (email.toLowerCase() === 'admin@shaadi24.app' && password === 'admin') {
                onLoginSuccess();
            } else {
                setError('Invalid credentials');
                setIsLoading(false);
            }
        }, 1000);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#111] p-4 font-sans">
            <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-2xl p-8 relative">
                
                <button 
                    onClick={onBack}
                    className="absolute top-4 left-4 text-gray-400 hover:text-black dark:hover:text-white transition-colors p-1"
                >
                    <IconChevronLeft />
                </button>

                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-black dark:bg-white text-white dark:text-black rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <IconShield className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Founder Access</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Manage users, verification, and metrics.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Admin Email</label>
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-300 dark:border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-800 text-gray-900 dark:text-white transition-all"
                            placeholder="admin@shaadi24.app"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Password</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-gray-300 dark:border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-800 text-gray-900 dark:text-white transition-all"
                            placeholder="•••••"
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 text-xs font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded text-center border border-red-100 dark:border-red-900/30">
                            {error}
                        </div>
                    )}

                    <Button 
                        onClick={() => {}} 
                        className="w-full h-11 justify-center text-sm font-bold mt-4 shadow-md"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                Authenticating...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2"><IconLock className="w-4 h-4" /> Secure Login</span>
                        )}
                    </Button>
                </form>
                
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Authorized Personnel Only</p>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
