
import React, { useState } from 'react';
import { Button } from './NotionUI';
import { IconLinkedin, IconInstagram, IconFacebook, IconTwitter, IconCheck, IconX, IconShield, IconLock } from '../constants';

interface SocialVerificationModalProps {
    onClose: () => void;
    onSuccess: (links: { linkedin?: string, instagram?: string, facebook?: string, twitter?: string }) => void;
}

const SocialVerificationModal: React.FC<SocialVerificationModalProps> = ({ onClose, onSuccess }) => {
    const [links, setLinks] = useState({
        linkedin: '',
        instagram: '',
        facebook: '',
        twitter: ''
    });
    
    const [verifying, setVerifying] = useState<string | null>(null);
    const [verified, setVerified] = useState<string[]>([]);

    const handleVerify = (platform: string) => {
        const url = links[platform as keyof typeof links];
        if (!url || url.length < 5) return;

        setVerifying(platform);
        
        // Simulate API verification delay
        setTimeout(() => {
            setVerifying(null);
            setVerified(prev => [...prev, platform]);
        }, 1000);
    };

    const handleFinish = () => {
        onSuccess({
            linkedin: links.linkedin,
            instagram: links.instagram,
            facebook: links.facebook,
            twitter: links.twitter
        });
        onClose();
    };

    const SocialRow = ({ 
        platform, icon, label, placeholder, colorClass, required = false 
    }: { 
        platform: string, icon: React.ReactNode, label: string, placeholder: string, colorClass: string, required?: boolean 
    }) => {
        const isVerified = verified.includes(platform);
        const isVerifying = verifying === platform;
        const value = links[platform as keyof typeof links];

        return (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-all group">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm transition-colors ${isVerified ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500'}`}>
                    {isVerified ? <IconCheck /> : icon}
                </div>
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-1">
                            {label} {required && <span className="text-red-500">*</span>}
                        </span>
                        {isVerified && <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 rounded font-bold">LINKED</span>}
                    </div>
                    {isVerified ? (
                        <div className="text-sm text-gray-900 dark:text-gray-100 font-medium truncate flex items-center gap-1">
                            <IconLock className="w-3 h-3 text-gray-400" /> {value}
                        </div>
                    ) : (
                        <input 
                            type="text" 
                            value={value}
                            onChange={(e) => setLinks(prev => ({ ...prev, [platform]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full bg-transparent border-none p-0 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-0 focus:outline-none"
                        />
                    )}
                </div>

                {!isVerified && (
                    <button
                        onClick={() => handleVerify(platform)}
                        disabled={isVerifying || !value}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                            value 
                                ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-80 shadow-sm' 
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isVerifying ? 'Checking...' : 'Link'}
                    </button>
                )}
            </div>
        );
    };

    // Check if mandatory fields are verified
    const isLinkedInVerified = verified.includes('linkedin');
    const isInstagramVerified = verified.includes('instagram');
    const isFacebookVerified = verified.includes('facebook');
    
    const canSubmit = isLinkedInVerified && isInstagramVerified && isFacebookVerified;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in font-sans">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-zinc-800 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-start bg-white dark:bg-zinc-900 relative z-10">
                    <div className="flex gap-4">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center shadow-sm">
                            <IconShield />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Verify Identity</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-tight max-w-xs">
                                To ensure authenticity, you must link your <strong>LinkedIn, Instagram, and Facebook</strong> accounts.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-black dark:hover:text-white transition-colors p-1"><IconX /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                    <SocialRow 
                        platform="linkedin" 
                        label="LinkedIn" 
                        icon={<IconLinkedin />} 
                        placeholder="https://linkedin.com/in/username"
                        colorClass="text-[#0077b5]"
                        required
                    />
                    <SocialRow 
                        platform="instagram" 
                        label="Instagram" 
                        icon={<IconInstagram />} 
                        placeholder="https://instagram.com/username"
                        colorClass="text-[#E1306C]"
                        required
                    />
                    <SocialRow 
                        platform="facebook" 
                        label="Facebook" 
                        icon={<IconFacebook />} 
                        placeholder="https://facebook.com/username"
                        colorClass="text-[#1877F2]"
                        required
                    />
                    <SocialRow 
                        platform="twitter" 
                        label="X (Twitter)" 
                        icon={<IconTwitter />} 
                        placeholder="https://x.com/username"
                        colorClass="text-black dark:text-white"
                    />
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex flex-col gap-3">
                    <div className="flex justify-between items-center gap-4">
                        <p className="text-[10px] text-gray-400 font-medium leading-tight">
                            Verification takes 24-72 hours. Your links are secure and only used for identity checks.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button 
                                onClick={handleFinish} 
                                disabled={!canSubmit}
                                className={`px-6 border-none shadow-md ${canSubmit ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed'}`}
                            >
                                Submit for Verification
                            </Button>
                        </div>
                    </div>
                    {!canSubmit && (
                        <p className="text-[10px] text-red-500 text-right font-bold animate-pulse">
                            * Please link all 3 required accounts to proceed.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SocialVerificationModal;
