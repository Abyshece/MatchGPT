
import React from 'react';
import { MatchCandidate, FilterOptions, SubscriptionTier } from '../types';
import MatchCard from './MatchCard';
import { Button } from './NotionUI';
import { IconZapFilled, IconChevronDown, IconHistory, IconChevronLeft, IconChevronRight, IconStar, IconRocket } from '../constants';

interface MatchGridProps {
    loadingMatches: boolean;
    visibleMatches: MatchCandidate[];
    matches: MatchCandidate[];
    filters: FilterOptions;
    onViewProfile: (m: MatchCandidate) => void;
    onToggleLike: (id: string) => void;
    onReject?: (id: string) => void;
    onLikeIntercept?: () => boolean;
    hideActiveStatus?: boolean;
    lastSearchResultCount?: number;
    userTier?: SubscriptionTier;
    onShowSubscription?: () => void;
    
    // Pagination Props
    currentPage?: number;
    totalPages?: number;
    onNextPage?: () => void;
    onPrevPage?: () => void;
    
    // Rewind Prop
    onRewind?: () => void;
    hasRewindHistory?: boolean;
    rewindCount?: number;
    isProRewindExpired?: boolean;

    // Boost Prop
    onBoostClick?: () => void;
    isBoostActive?: boolean;
}

const MatchGrid: React.FC<MatchGridProps> = React.memo(({ 
    loadingMatches, visibleMatches, matches, filters, onViewProfile, onToggleLike, onReject, onLikeIntercept, hideActiveStatus,
    lastSearchResultCount, userTier, onShowSubscription, 
    currentPage, totalPages, onNextPage, onPrevPage,
    onRewind, hasRewindHistory, rewindCount, isProRewindExpired, onBoostClick, isBoostActive
}) => {
    
    // Determine Rewind Button State
    const isPlusLimitReached = userTier === 'PLUS' && (rewindCount || 0) >= 1;
    const isProExpired = userTier === 'PRO' && isProRewindExpired;
    
    const isDisabled = isPlusLimitReached || isProExpired;

    // Show button if Paid user AND (has history OR disabled state reached)
    const showRewind = userTier !== 'FREE' && onRewind && (hasRewindHistory || isDisabled);

    return (
        <div className="w-full animate-fade-in pb-12 pt-0 max-w-4xl mx-auto px-6 relative">
            {/* Sticky Header with Results Count and Rewind Button - Enhanced Blur & Smaller Size */}
            <div className="sticky top-0 z-30 bg-white/80 dark:bg-[#191919]/80 backdrop-blur-xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)] border-b border-gray-100/50 dark:border-zinc-800/50 py-2 mb-6 flex items-center justify-between transition-all duration-200 -mx-6 px-6">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2 text-sm">
                    <span className="text-lg">✨</span> Results for you
                    {!loadingMatches && visibleMatches.length > 0 && (
                        <span className="ml-2 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-200 dark:border-zinc-700">
                            {visibleMatches.length}
                        </span>
                    )}
                </h3>
            
                {/* Rewind Button for Paid Users - Enhanced for Visibility & Mobile */}
                {showRewind && (
                    <button 
                        onClick={onRewind}
                        className={`group flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all shadow-sm active:scale-95 border
                            ${isDisabled 
                                ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-zinc-700 cursor-not-allowed'
                                : 'text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800/30'
                            }
                        `}
                        title={isPlusLimitReached ? "Daily limit reached. Upgrade to Pro for unlimited." : isProExpired ? "Rewind window expired (1 min limit)." : "Undo last swipe"}
                    >
                        <div className={`rounded-full p-0.5 transition-transform duration-300 ${!isDisabled && 'group-hover:rotate-[-45deg] bg-yellow-200 dark:bg-yellow-700'} ${isDisabled && 'bg-gray-200 dark:bg-zinc-700'}`}>
                            <IconHistory />
                        </div>
                        <span className="hidden sm:inline">
                            {isPlusLimitReached ? 'Limit Reached' : isProExpired ? 'Expired' : 'Rewind'}
                        </span>
                    </button>
                )}
            </div>

        {loadingMatches ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col h-full">
                        <div className="aspect-[3/4] w-full bg-gray-100 dark:bg-zinc-800 relative animate-pulse" style={{ animationDuration: '0.6s' }}>
                            <div className="absolute top-3 left-3 w-16 h-5 bg-gray-200 dark:bg-zinc-700 rounded-full"></div>
                            <div className="absolute top-2 right-2 w-12 h-6 bg-gray-200 dark:bg-zinc-700 rounded"></div>
                        </div>
                        <div className="p-4 space-y-4">
                             <div className="space-y-2 animate-pulse" style={{ animationDuration: '0.6s' }}>
                                <div className="h-6 bg-gray-100 dark:bg-zinc-800 rounded w-3/4"></div>
                                <div className="h-4 bg-gray-50 dark:bg-zinc-800/50 rounded w-1/2"></div>
                             </div>
                             <div className="pt-2 flex gap-2 animate-pulse" style={{ animationDuration: '0.6s' }}>
                                <div className="h-9 flex-1 bg-gray-100 dark:bg-zinc-800 rounded-lg"></div>
                                <div className="h-9 flex-1 bg-gray-100 dark:bg-zinc-800 rounded-lg"></div>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        ) : visibleMatches.length > 0 ? (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                    {visibleMatches.map(match => (
                        <MatchCard 
                            key={match.id} 
                            match={match} 
                            onViewProfile={onViewProfile} 
                            onToggleLike={onToggleLike} 
                            onReject={onReject}
                            onLikeIntercept={onLikeIntercept}
                            hideActiveStatus={hideActiveStatus}
                        />
                    ))}
                </div>
                
                {/* Pagination Controls for Paid Users */}
                {userTier !== 'FREE' && totalPages && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 pb-8">
                        <button 
                            onClick={onPrevPage}
                            disabled={currentPage === 1}
                            className="p-2 rounded-full border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                        >
                            <IconChevronLeft />
                        </button>
                        
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                            Page {currentPage} of {totalPages}
                        </span>
                        
                        <button 
                            onClick={onNextPage}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-full border border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                        >
                            <IconChevronRight />
                        </button>
                    </div>
                )}

                {/* Shaadi24+ Upsell to Pro */}
                {userTier === 'PLUS' && (
                    <div className="mt-4 mb-12 relative overflow-hidden rounded-2xl bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 dark:from-yellow-950/30 dark:via-amber-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-700/50 p-6 md:p-8 text-center md:text-left flex flex-col md:flex-row items-center gap-6 shadow-lg shadow-orange-500/5">
                        
                        {/* Icon/Visual */}
                        <div className="flex-shrink-0">
                            <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white shadow-md animate-pulse">
                                <IconZapFilled className="w-7 h-7" />
                            </div>
                        </div>

                        {/* Text Content */}
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Ready for the big leagues?
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                                Upgrade to <span className="font-bold text-yellow-600 dark:text-yellow-500">Shaadi24 Pro</span> to unlock Incognito Mode, Read Receipts, see everyone who likes you, and filter by Online status.
                            </p>
                            <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                {['Incognito Mode', 'Read Receipts', 'See All Likes', 'Advanced Filters'].map(feat => (
                                    <span key={feat} className="text-[10px] uppercase font-bold px-2 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded border border-yellow-200 dark:border-yellow-800/50">
                                        {feat}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Action Button */}
                        <div className="flex-shrink-0">
                            <Button 
                                onClick={onShowSubscription}
                                className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white border-none shadow-md px-6 py-3 h-auto text-sm font-bold whitespace-nowrap transform transition-transform hover:scale-105"
                            >
                                Upgrade to Pro
                            </Button>
                        </div>
                    </div>
                )}

                {/* PRO User Boost Recommendation - HIDDEN IF BOOST ACTIVE */}
                {userTier === 'PRO' && !isBoostActive && (
                    <div className="mt-4 mb-12 relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-50 via-fuchsia-50 to-pink-50 dark:from-purple-950/30 dark:via-fuchsia-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700/50 p-6 md:p-8 text-center md:text-left flex flex-col md:flex-row items-center gap-6 shadow-lg shadow-purple-500/5">
                        
                        {/* Icon/Visual */}
                        <div className="flex-shrink-0">
                            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white shadow-md animate-pulse">
                                <IconRocket className="w-7 h-7" />
                            </div>
                        </div>

                        {/* Text Content */}
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Want partners faster?
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                                You're a Pro! Use <span className="font-bold text-purple-600 dark:text-purple-400">Boost</span> to skip the line and get up to 10x more visibility instantly.
                            </p>
                        </div>

                        {/* Action Button */}
                        <div className="flex-shrink-0">
                            <Button 
                                onClick={onBoostClick}
                                className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white border-none shadow-md px-6 py-3 h-auto text-sm font-bold whitespace-nowrap transform transition-transform hover:scale-105"
                            >
                                Boost Now
                            </Button>
                        </div>
                    </div>
                )}
                
                {/* Free Tier End of List Upsell */}
                {userTier === 'FREE' && visibleMatches.length > 0 && (
                    <div className="mt-12 mb-12 relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-xl max-w-3xl mx-auto text-center p-8 md:p-10">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-yellow-500"></div>
                        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-yellow-500/5 dark:bg-yellow-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-zinc-800 rounded-2xl rotate-3 mx-auto mb-6 flex items-center justify-center shadow-sm border border-gray-100 dark:border-zinc-700">
                                <span className="text-3xl">🚀</span>
                            </div>
                            
                            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
                                Don't let the perfect match wait.
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-lg mx-auto text-sm md:text-base leading-relaxed">
                                You've reached your daily limit. Unlock unlimited profiles, advanced filters, and see who likes you instantly.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md mx-auto">
                                <button 
                                    onClick={onShowSubscription}
                                    className="w-full flex-1 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                >
                                    <IconStar /> Get Shaadi24+
                                </button>
                                <button 
                                    onClick={onShowSubscription}
                                    className="w-full flex-1 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 active:scale-95 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                                >
                                    <IconZapFilled /> Get Shaadi24 Pro
                                </button>
                            </div>
                            
                            <p className="mt-6 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                100% Satisfaction Guarantee
                            </p>
                        </div>
                    </div>
                )}
            </>
        ) : (
            <div className="text-center py-20 px-6 text-gray-400 bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-100 dark:border-zinc-700 border-dashed flex flex-col items-center gap-2">
                {(userTier === 'FREE' || !userTier) && (lastSearchResultCount && lastSearchResultCount > 0) ? (
                    <div className="max-w-md mx-auto">
                        <div className="text-4xl mb-4">🎬</div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">That's a wrap for today!</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                            You've viewed your daily matches. Great connections take time. 
                            Check back tomorrow for fresh faces!
                        </p>
                        
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800/30 shadow-sm">
                            <div className="flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                                <IconZapFilled className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">
                                Can't wait? Unlock unlimited matches instantly.
                            </p>
                            <Button 
                                onClick={onShowSubscription}
                                className="bg-blue-600 hover:bg-blue-700 text-white w-full justify-center shadow-lg transform transition-transform hover:scale-[1.02]"
                            >
                                Upgrade to Shaadi24+
                            </Button>
                        </div>
                    </div>
                ) : (
                    matches.length > 0 && filters.notAlreadyLiked 
                        ? "All matches have been liked!" 
                        : (
                            <>
                                <p className="text-lg font-semibold text-gray-500 dark:text-gray-400">No matches found here.</p> 
                                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm leading-relaxed">
                                    ✨ Try starting a <span className="font-bold text-gray-600 dark:text-gray-300">New Chat</span> from the top right with a creative description of your ideal match!
                                </p>
                            </>
                        )
                )}
            </div>
        )}
    </div>
    );
});

export default MatchGrid;
