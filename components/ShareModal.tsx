
import React, { useState } from 'react';
import { MatchCandidate } from '../types';
import { IconX, IconShare, IconWhatsApp, IconTwitter, IconFacebook, IconSend, IconCheck, IconCopy } from '../constants';

interface ShareModalProps {
    onClose: () => void;
    match: MatchCandidate;
}

const ShareModal: React.FC<ShareModalProps> = ({ onClose, match }) => {
    const shareLink = `https://matchgpt.app/match/${match.id}`;
    const [copied, setCopied] = useState(false);
    const handleCopy = () => { navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };
    const shareText = `Check out ${match.name}'s profile on MatchGPT!`;
    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden relative">
                 <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><IconX /></button>
                 <div className="p-6">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><IconShare /> Share Profile</h3>
                     <div className="flex items-center gap-3 mb-6 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700">
                         <img src={match.imageUrls[0]} alt={match.name} className="w-12 h-12 rounded-full object-cover" loading="lazy" decoding="async" />
                         <div><p className="font-bold text-sm text-gray-800 dark:text-gray-100">{match.name}, {match.age}</p><p className="text-xs text-gray-500 dark:text-gray-400">{match.location}</p></div>
                     </div>
                     <div className="space-y-4">
                         <div className="flex gap-2">
                             <input type="text" readOnly value={shareLink} className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded px-3 py-2 text-sm text-gray-600 dark:text-gray-300 outline-none" />
                             <button onClick={handleCopy} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'}`}>{copied ? <IconCheck /> : <IconCopy />}</button>
                         </div>
                         <div className="grid grid-cols-4 gap-2">
                             <a href={`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareLink)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"><div className="w-10 h-10 rounded-full bg-[#25D366]/10 text-[#25D366] flex items-center justify-center"><IconWhatsApp /></div><span className="text-[10px] text-gray-500 dark:text-gray-400">WhatsApp</span></a>
                             <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"><div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 text-black dark:text-white flex items-center justify-center"><IconTwitter /></div><span className="text-[10px] text-gray-500 dark:text-gray-400">X</span></a>
                             <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"><div className="w-10 h-10 rounded-full bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center"><IconFacebook /></div><span className="text-[10px] text-gray-500 dark:text-gray-400">Facebook</span></a>
                             <a href={`mailto:?subject=${encodeURIComponent("Check out this profile")}&body=${encodeURIComponent(shareText + ' ' + shareLink)}`} className="flex flex-col items-center gap-1 p-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-200 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-200 flex items-center justify-center"><IconSend /></div><span className="text-[10px] text-gray-500 dark:text-gray-400">Email</span></a>
                         </div>
                     </div>
                 </div>
            </div>
        </div>
    );
};

export default ShareModal;
