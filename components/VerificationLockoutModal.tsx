
import React from 'react';
import { Button } from './NotionUI';
import { IconShield, IconLock } from '../constants';

interface VerificationLockoutModalProps {
    onVerify: () => void;
}

const VerificationLockoutModal: React.FC<VerificationLockoutModalProps> = ({ onVerify }) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center border border-gray-200 dark:border-zinc-800 relative">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <div className="transform scale-125"><IconLock /></div>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Verification Required</h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
                You have exceeded the 72-hour grace period for new accounts. To ensure the safety of our community, please verify your profile to continue using Shaadi24.
            </p>
            
            <Button 
                onClick={onVerify} 
                className="w-full justify-center h-12 text-base font-semibold shadow-md bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black dark:hover:bg-gray-200 border-none"
            >
                <span className="mr-2"><IconShield /></span> Verify Now
            </Button>
            
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                    Secure • Confidential • Fast
                </p>
            </div>
        </div>
    </div>
);

export default VerificationLockoutModal;
