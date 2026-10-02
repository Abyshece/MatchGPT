
import React, { useState, useEffect, useRef } from 'react';
import { MatchCandidate, SubscriptionTier } from '../types';
import { Button } from './NotionUI';
import { 
    IconUser, IconX, IconChevronLeft, IconChevronRight, 
    IconVerify, IconZapFilled, IconPlus, IconMapPin, 
    IconSparkles, IconBriefcase, IconGraduationCap, 
    IconWine, IconCigarette, IconBaby, IconChevronDown, 
    IconLinkedin, IconInstagram, IconShare, IconStar, IconHeart, IconHeartFilled, IconLock, IconRocket 
} from '../constants';
import { PROFILE_ATTRIBUTE_GROUPS, DEFAULT_HIDDEN_FIELDS } from '../constants';
import { getVerdict } from '../services/matchingService';

interface MatchProfileModalProps {
    match: MatchCandidate;
    onClose: () => void;
    onLike: (id: string) => void;
    onSuperLike: (id: string) => void;
    onReject?: (id: string) => void; // Optional reject
    isSuperLikeEligible: () => boolean; // Function to check if user can super like
    onShowShareModal: () => void;
    standouts: MatchCandidate[]; // Needed to check if it's a standout for Super Like logic
    userTier?: SubscriptionTier;
    isStandout?: boolean; // New prop to identify if we are in standout context
}

const MatchProfileModal: React.FC<MatchProfileModalProps> = ({ 
    match, onClose, onLike, onSuperLike, onReject, isSuperLikeEligible, onShowShareModal, standouts, userTier = 'FREE', isStandout = false
}) => {
    const [lightboxState, setLightboxState] = useState<{ images: string[], currentIndex: number } | null>(null);
    const [showPersonalDetails, setShowPersonalDetails] = useState(false);

    // Lightbox handlers
    const handleLightboxNext = (e?: React.MouseEvent | KeyboardEvent) => { e?.stopPropagation(); setLightboxState(prev => { if (!prev) return null; return { ...prev, currentIndex: (prev.currentIndex + 1) % prev.images.length }; }); };
    const handleLightboxPrev = (e?: React.MouseEvent | KeyboardEvent) => { e?.stopPropagation(); setLightboxState(prev => { if (!prev) return null; return { ...prev, currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length }; }); };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (!lightboxState) return; if (e.key === 'ArrowRight') handleLightboxNext(e); if (e.key === 'ArrowLeft') handleLightboxPrev(e); if (e.key === 'Escape') setLightboxState(null); };
        window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxState]);

    const touchStartX = useRef(0);
    const touchEndX = useRef(0);
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
    const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
    const handleTouchEnd = () => { const difference = touchStartX.current - touchEndX.current; if (Math.abs(difference) > 50) { if (difference > 0) { handleLightboxNext(); } else { handleLightboxPrev(); } } };

    // PRO users always see analysis. Standouts also always show analysis (even for Free).
    const showAnalysis = userTier === 'PRO' || isStandout;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
             <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                 <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 z-20 flex-none">
                     <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white"><IconUser /> Profile Details</h2>
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-500 dark:text-gray-300"><IconX /></button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                             <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 relative cursor-pointer group" onClick={() => setLightboxState({ images: match.imageUrls, currentIndex: 0 })}>
                                 <img src={match.imageUrls[0]} alt={match.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"><span className="opacity-0 group-hover:opacity-100 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">View Photos</span></div>
                             </div>
                             <div className="grid grid-cols-4 gap-2">
                                 {match.imageUrls.slice(1, 5).map((url, idx) => ( <div key={idx} className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setLightboxState({ images: match.imageUrls, currentIndex: idx + 1 })}><img src={url} alt="Gallery" className="w-full h-full object-cover" loading="lazy" decoding="async" /></div> ))}
                             </div>
                        </div>

                        <div className="flex flex-col">
                             <div className="mb-6">
                                 <div className="flex flex-wrap gap-2 mb-3">
                                     {match.isBoosted && (
                                        <div className="inline-flex items-center gap-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-purple-200 dark:border-purple-800 shadow-sm animate-pulse">
                                            <IconRocket className="w-3.5 h-3.5" /> Boosted Profile
                                        </div>
                                     )}
                                     {match.isVerified && (
                                        <div className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-green-200 dark:border-green-800 shadow-sm">
                                            <IconVerify className="w-3.5 h-3.5" /> Verified
                                        </div>
                                     )}
                                     {(match.subscriptionTier === 'PRO' || (!match.subscriptionTier && match.isPremium)) && (
                                        <div className="inline-flex items-center gap-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-yellow-200 dark:border-yellow-800 shadow-sm">
                                            <IconZapFilled className="w-3.5 h-3.5" /> PRO Member
                                        </div>
                                     )}
                                     {match.subscriptionTier === 'PLUS' && (
                                        <div className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-blue-200 dark:border-blue-800 shadow-sm">
                                            <IconPlus className="w-3.5 h-3.5" /> PLUS Member
                                        </div>
                                     )}
                                 </div>

                                 <div className="flex justify-between items-start">
                                     <div>
                                         <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                {match.name}, {match.age}
                                            </h3>
                                         </div>
                                         <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1"><IconMapPin /> {match.location}</p>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-xl font-bold text-green-600 dark:text-green-500">{match.compatibilityScore}%</div>
                                         <div className="text-xs text-gray-400 uppercase tracking-wide">Match</div>
                                     </div>
                                 </div>

                                 {/* Compatibility Analysis - Locked for Non-Pro unless Standout */}
                                 <div className="mt-6 mb-6">
                                    <div className="p-5 rounded-lg bg-white dark:bg-zinc-800/40 border border-gray-200 dark:border-zinc-700/50 shadow-sm relative overflow-hidden">
                                        <div className="flex items-center gap-2 mb-4 relative z-10">
                                            <div className="text-yellow-500 animate-pulse"><IconSparkles /></div>
                                            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Compatibility Analysis</h4>
                                            {!showAnalysis && <div className="ml-auto text-xs font-bold text-gray-400 flex items-center gap-1"><IconLock /> PRO</div>}
                                        </div>
                                        
                                        {showAnalysis ? (
                                            <>
                                                <div className="space-y-3 relative z-10">
                                                    {match.compatibilityReport?.map((item, i) => (
                                                        <div key={i} className="flex items-start gap-3 text-sm">
                                                            <span className="flex-shrink-0 text-lg leading-none">{item.icon}</span>
                                                            <span className={`leading-relaxed font-medium ${item.color || 'text-gray-700 dark:text-gray-300'}`}>
                                                                {item.text}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {!match.compatibilityReport?.length && (
                                                        <div className="text-sm text-gray-500 italic pl-1">No specific data points available for analysis.</div>
                                                    )}
                                                </div>
                                                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-zinc-700/50 relative z-10">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-lg">🤖</span>
                                                        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">AI Verdict</span>
                                                    </div>
                                                    <p className="text-sm text-gray-800 dark:text-gray-200 font-medium italic leading-relaxed">
                                                        "{getVerdict(match.compatibilityScore, match.name)}"
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="relative z-10 blur-sm select-none">
                                                <div className="space-y-3">
                                                    <div className="flex items-start gap-3 text-sm"><span className="text-lg">✅</span><span className="text-gray-700 dark:text-gray-300">Located in same region</span></div>
                                                    <div className="flex items-start gap-3 text-sm"><span className="text-lg">✅</span><span className="text-gray-700 dark:text-gray-300">Shared values and interests</span></div>
                                                    <div className="flex items-start gap-3 text-sm"><span className="text-lg">⚠️</span><span className="text-gray-700 dark:text-gray-300">Minor lifestyle differences</span></div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute -top-4 -right-4 w-20 h-20 bg-yellow-50 dark:bg-yellow-900/10 rounded-full blur-xl pointer-events-none"></div>
                                    </div>
                                 </div>
                             </div>
                             
                             <div className="space-y-6">
                                 <div>
                                     <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">About</h4>
                                     <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{match.bio}</p>
                                 </div>

                                 <div>
                                     <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Interests</h4>
                                     <div className="flex flex-wrap gap-2">
                                         {match.tags.map(tag => ( <span key={tag} className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-xs rounded-full font-medium">{tag}</span> ))}
                                     </div>
                                 </div>

                                 <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-3">
                                         <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><IconBriefcase /><span className="truncate">{match.jobTitle || 'N/A'}</span></div>
                                         <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><IconGraduationCap /><span className="truncate">{match.university || 'N/A'}</span></div>
                                         <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><span className="text-lg">📏</span><span>{match.height || 'N/A'}</span></div>
                                     </div>
                                     <div className="space-y-3">
                                         <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><IconWine /><span>{match.drinking || 'No'}</span></div>
                                         <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><IconCigarette /><span>{match.smoking || 'No'}</span></div>
                                         {match.children && ( <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400"><IconBaby /><span>{match.children}</span></div> )}
                                     </div>
                                 </div>

                                 {/* Full Personal Attributes View */}
                                 <div className="mt-6 rounded-xl border border-gray-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-900/50 overflow-hidden shadow-sm">
                                    <button 
                                        onClick={() => setShowPersonalDetails(!showPersonalDetails)}
                                        className="w-full flex items-center justify-between p-4 bg-gray-50/50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📋</span>
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Personal Details</span>
                                        </div>
                                        <div className={`text-gray-400 transition-transform duration-300 ${showPersonalDetails ? 'rotate-180' : ''}`}>
                                            <IconChevronDown />
                                        </div>
                                    </button>
                                    
                                    <div className={`transition-all duration-300 ease-in-out ${showPersonalDetails ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                        <div className="p-5 border-t border-gray-100 dark:border-zinc-800 space-y-6 bg-white dark:bg-transparent">
                                            {PROFILE_ATTRIBUTE_GROUPS.map((bucket, idx) => {
                                                const visibleFields = bucket.fields.filter(f => {
                                                    const val = match[f.key];
                                                    if (val === undefined || val === null || val === '' || val === 'Not specified') return false;
                                                    const hiddenList = match.hiddenFields || DEFAULT_HIDDEN_FIELDS;
                                                    if (hiddenList.includes(f.key)) return false;
                                                    return true;
                                                });

                                                if (visibleFields.length === 0) return null;

                                                return (
                                                    <div key={idx}>
                                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1">
                                                            {bucket.title}
                                                        </h4>
                                                        <div className="grid grid-cols-1 gap-y-2">
                                                            {visibleFields.map((field, fIdx) => (
                                                                <div key={fIdx} className="flex justify-between text-sm py-0.5">
                                                                    <span className="text-gray-500 dark:text-gray-400 font-medium">{field.label}</span>
                                                                    <span className="font-semibold text-gray-800 dark:text-gray-200 text-right max-w-[60%] truncate">
                                                                        {String(match[field.key])}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                 </div>

                 <div className="flex-none bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 p-4 z-10 flex items-center justify-between gap-4">
                    <div className="flex gap-1 items-center">
                         {match.linkedin ? ( 
                             <a href={`https://linkedin.com/in/${match.linkedin}`} target="_blank" rel="noopener noreferrer" 
                                className="text-gray-400 hover:text-[#0077b5] transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center" 
                                title="LinkedIn">
                                 <IconLinkedin />
                             </a> 
                         ) : ( 
                             <div className="text-gray-200 dark:text-zinc-800 p-2 rounded-md flex items-center justify-center cursor-not-allowed" title="LinkedIn Not Available">
                                 <IconLinkedin />
                             </div> 
                         )}
                         
                         {match.instagram ? ( 
                             <a href={`https://instagram.com/${match.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer" 
                                className="text-gray-400 hover:text-[#E1306C] transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center" 
                                title="Instagram">
                                 <IconInstagram />
                             </a> 
                         ) : ( 
                             <div className="text-gray-200 dark:text-zinc-800 p-2 rounded-md flex items-center justify-center cursor-not-allowed" title="Instagram Not Available">
                                 <IconInstagram />
                             </div> 
                         )}
                         
                         <button onClick={onShowShareModal} 
                                 className="text-gray-400 hover:text-black dark:hover:text-white transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center" 
                                 title="Share Profile">
                             <IconShare />
                         </button>
                    </div>
                    <Button 
                        className={`h-12 px-8 text-base shadow-md transition-colors rounded-full ${
                            match.isLiked 
                                ? 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white' 
                                : standouts.some(s => s.id === match.id) 
                                    ? 'bg-gradient-to-r from-yellow-500 to-orange-600 text-white hover:opacity-90 border-none'
                                    : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
                        }`} 
                        onClick={() => {
                            if (standouts.some(s => s.id === match.id)) {
                                if (isSuperLikeEligible()) {
                                    onSuperLike(match.id);
                                }
                            } else {
                                onLike(match.id);
                            }
                        }}
                    >
                        {match.isLiked 
                            ? (standouts.some(s => s.id === match.id) 
                                ? <><IconStar /> Super Liked</> 
                                : <><IconHeartFilled className="text-white" /> Liked</>) 
                            : (standouts.some(s => s.id === match.id)
                                ? <><IconStar /> Super Like</>
                                : <><IconHeart /> Like {match.name}</>)
                        }
                    </Button>
                 </div>
             </div>

             {/* Lightbox internal to Modal */}
             {lightboxState && (
                <div className="fixed inset-0 z-[300] bg-black flex items-center justify-center animate-fade-in" onClick={(e) => { e.stopPropagation(); setLightboxState(null); }}>
                   <button onClick={() => setLightboxState(null)} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 z-20"><IconX /></button>
                   {lightboxState.images.length > 1 && ( <> <button onClick={handleLightboxPrev} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-4 z-20 hidden md:block rounded-full hover:bg-white/10"><IconChevronLeft /></button> <button onClick={handleLightboxNext} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-4 z-20 hidden md:block rounded-full hover:bg-white/10"><IconChevronRight /></button> </> )}
                   <img src={lightboxState.images[lightboxState.currentIndex]} alt="Full screen" className="max-w-full max-h-full object-contain p-4 select-none touch-pan-y" onClick={(e) => e.stopPropagation()} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} loading="lazy" decoding="async" />
                   {lightboxState.images.length > 1 && ( <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20"> {lightboxState.images.map((_, idx) => ( <div key={idx} className={`w-2 h-2 rounded-full transition-colors ${idx === lightboxState.currentIndex ? 'bg-white scale-125' : 'bg-white/30'}`} /> ))} </div> )}
                </div>
             )}
         </div>
    );
};

export default MatchProfileModal;
