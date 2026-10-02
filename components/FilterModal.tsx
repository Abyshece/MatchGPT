
import React, { useState } from 'react';
import { FilterOptions, SubscriptionTier } from '../types';
import { Button } from './NotionUI';
import { IconX, IconMapPin, IconFilter, IconLock } from '../constants';

interface FilterModalProps {
    filters: FilterOptions;
    onApply: (filters: FilterOptions) => void;
    onClose: () => void;
    userTier?: SubscriptionTier;
}

// Moved outside to prevent re-mounting on state change
const FilterPill = ({ label, active, onClick, locked, lockColor }: { label: string, active: boolean, onClick: () => void, locked: boolean, lockColor: string }) => {
    return (
        <button 
            onClick={onClick}
            disabled={locked}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-200 flex items-center gap-1 ${
                locked 
                ? 'bg-gray-50 dark:bg-zinc-800/50 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-zinc-800 cursor-not-allowed'
                : active 
                    ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-sm' 
                    : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-700'
            }`}
        >
            {locked ? <div className={`text-[9px] ${lockColor}`}><IconLock className="w-3 h-3" /></div> : (active && <span>✓</span>)}
            {label}
        </button>
    );
};

// Moved outside to prevent re-mounting on state change
const FilterSelect = ({ label, value, options, onChange, locked, lockColor }: { label: string, value: string | undefined, options: string[], onChange: (val: string) => void, locked: boolean, lockColor: string }) => {
    return (
        <div className={`flex flex-col gap-1 ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-1">
                {label} {locked && <span className={lockColor}><IconLock className="w-3 h-3" /></span>}
            </label>
            <select 
                value={value || ''} 
                onChange={(e) => onChange(e.target.value)}
                disabled={locked}
                className="w-full p-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-all appearance-none cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:cursor-not-allowed"
            >
                <option value="">Any</option>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
    );
};

const FilterModal: React.FC<FilterModalProps> = ({ filters, onApply, onClose, userTier = 'FREE' }) => {
    const [localFilters, setLocalFilters] = useState<FilterOptions>(filters);

    const getRequiredTier = (key: string): SubscriptionTier => {
        const proOnly = ['isOnline', 'hasLinkedin', 'hasInstagram', 'recentlyActive', 'isPremium', 'notAlreadyLiked'];
        if (proOnly.includes(key)) return 'PRO';
        
        const freeAllowed = ['maxDistance', 'ageRange', 'ethnicity', 'religion', 'relationshipType'];
        if (freeAllowed.includes(key)) return 'FREE';
        
        return 'PLUS';
    };

    const isLocked = (key: string) => {
        const required = getRequiredTier(key);
        if (userTier === 'PRO') return false; 
        if (userTier === 'PLUS') return required === 'PRO';
        // Free users are locked out of anything not FREE
        return required !== 'FREE';
    };

    const getLockColorClass = (key: string) => {
        const required = getRequiredTier(key);
        if (required === 'PRO') return 'text-yellow-500 dark:text-yellow-400';
        if (required === 'PLUS') return 'text-blue-600 dark:text-blue-500';
        return 'text-gray-400';
    };

    const updateFilter = (key: keyof FilterOptions, value: any) => {
        if (isLocked(key)) return;
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        onApply(localFilters);
    };

    const handleReset = () => {
        setLocalFilters({
            isOnline: false,
            recentlyActive: false,
            isVerified: false,
            isPremium: false,
            hasLinkedin: false,
            hasInstagram: false,
            notAlreadyLiked: false,
            maxDistance: 50,
            ageRange: [18, 50],
            neighborhood: ''
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
            {/* Widened max-w-3xl for better layout */}
            <div className="bg-white dark:bg-[#191919] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-zinc-800">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-[#191919] z-10">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 dark:bg-zinc-800 rounded-lg text-gray-600 dark:text-gray-300">
                            <IconFilter />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-none">Filter Database</h2>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Refine your search parameters</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                        <IconX />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-[#191919]">
                    <div className="space-y-8">
                        
                        {/* Section 1: Visibility & Status */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1">Visibility & Status</h3>
                            <div className="flex flex-wrap gap-2">
                                <FilterPill label="Online Now" active={localFilters.isOnline} onClick={() => updateFilter('isOnline', !localFilters.isOnline)} locked={isLocked('isOnline')} lockColor={getLockColorClass('isOnline')} />
                                <FilterPill label="Recently Active" active={localFilters.recentlyActive || false} onClick={() => updateFilter('recentlyActive', !localFilters.recentlyActive)} locked={isLocked('recentlyActive')} lockColor={getLockColorClass('recentlyActive')} />
                                <FilterPill label="Verified" active={localFilters.isVerified} onClick={() => updateFilter('isVerified', !localFilters.isVerified)} locked={isLocked('isVerified')} lockColor={getLockColorClass('isVerified')} />
                                <FilterPill label="Premium" active={localFilters.isPremium} onClick={() => updateFilter('isPremium', !localFilters.isPremium)} locked={isLocked('isPremium')} lockColor={getLockColorClass('isPremium')} />
                                <FilterPill label="Hide Liked" active={localFilters.notAlreadyLiked || false} onClick={() => updateFilter('notAlreadyLiked', !localFilters.notAlreadyLiked)} locked={isLocked('notAlreadyLiked')} lockColor={getLockColorClass('notAlreadyLiked')} />
                                <FilterPill label="LinkedIn" active={localFilters.hasLinkedin || false} onClick={() => updateFilter('hasLinkedin', !localFilters.hasLinkedin)} locked={isLocked('hasLinkedin')} lockColor={getLockColorClass('hasLinkedin')} />
                                <FilterPill label="Instagram" active={localFilters.hasInstagram || false} onClick={() => updateFilter('hasInstagram', !localFilters.hasInstagram)} locked={isLocked('hasInstagram')} lockColor={getLockColorClass('hasInstagram')} />
                            </div>
                        </div>

                        {/* Section 2: Location & Age */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-1">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Maximum Distance</label>
                                        <span className="text-xs font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{localFilters.maxDistance || 50} miles</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" max="100" 
                                        value={localFilters.maxDistance || 50} 
                                        onChange={(e) => updateFilter('maxDistance', parseInt(e.target.value))}
                                        className="w-full accent-black dark:accent-white h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                        Neighborhood / City 
                                        {isLocked('neighborhood') && <span className={getLockColorClass('neighborhood')}><IconLock className="w-3 h-3" /></span>}
                                    </label>
                                    <div className={`relative group ${isLocked('neighborhood') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white">
                                            <IconMapPin />
                                        </div>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Brooklyn"
                                            value={localFilters.neighborhood || ''}
                                            onChange={(e) => updateFilter('neighborhood', e.target.value)}
                                            disabled={isLocked('neighborhood')}
                                            className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all disabled:cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 block">Age Range</label>
                                <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700">
                                    <input 
                                        type="number" 
                                        min="18" max="99" 
                                        value={localFilters.ageRange ? localFilters.ageRange[0] : 18} 
                                        onChange={(e) => updateFilter('ageRange', [parseInt(e.target.value), localFilters.ageRange ? localFilters.ageRange[1] : 50])}
                                        className="w-16 p-1.5 text-center text-sm font-bold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-black dark:focus:border-white"
                                    />
                                    <span className="text-gray-400 font-medium text-xs">to</span>
                                    <input 
                                        type="number" 
                                        min="18" max="99" 
                                        value={localFilters.ageRange ? localFilters.ageRange[1] : 50} 
                                        onChange={(e) => updateFilter('ageRange', [localFilters.ageRange ? localFilters.ageRange[0] : 18, parseInt(e.target.value)])}
                                        className="w-16 p-1.5 text-center text-sm font-bold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-black dark:focus:border-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Appearance & Identity */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1">Appearance & Identity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <FilterSelect locked={isLocked('height')} lockColor={getLockColorClass('height')} label="Height" value={localFilters.height} options={['Short', 'Average', 'Tall', 'Very Tall']} onChange={(v) => updateFilter('height', v)} />
                                <FilterSelect locked={isLocked('ethnicity')} lockColor={getLockColorClass('ethnicity')} label="Ethnicity" value={localFilters.ethnicity} options={['Asian', 'Black', 'Caucasian', 'Hispanic', 'Indian', 'Middle Eastern', 'Mixed', 'Other']} onChange={(v) => updateFilter('ethnicity', v)} />
                                <FilterSelect locked={isLocked('religion')} lockColor={getLockColorClass('religion')} label="Religion" value={localFilters.religion} options={['Agnostic', 'Atheist', 'Buddhist', 'Christian', 'Hindu', 'Jewish', 'Muslim', 'Spiritual', 'Other']} onChange={(v) => updateFilter('religion', v)} />
                                <FilterSelect locked={isLocked('politics')} lockColor={getLockColorClass('politics')} label="Politics" value={localFilters.politics} options={['Liberal', 'Moderate', 'Conservative', 'Apolitical', 'Other']} onChange={(v) => updateFilter('politics', v)} />
                                <FilterSelect locked={isLocked('educationLevel')} lockColor={getLockColorClass('educationLevel')} label="Education" value={localFilters.educationLevel} options={['High School', 'Undergraduate', 'Postgraduate', 'PhD', 'Trade School']} onChange={(v) => updateFilter('educationLevel', v)} />
                            </div>
                        </div>

                        {/* Section 4: Lifestyle & Habits */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1">Lifestyle & Habits</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <FilterSelect locked={isLocked('drinking')} lockColor={getLockColorClass('drinking')} label="Drinking" value={localFilters.drinking} options={['No', 'Socially', 'Regularly']} onChange={(v) => updateFilter('drinking', v)} />
                                <FilterSelect locked={isLocked('smoking')} lockColor={getLockColorClass('smoking')} label="Smoking" value={localFilters.smoking} options={['No', 'Socially', 'Regularly']} onChange={(v) => updateFilter('smoking', v)} />
                                <FilterSelect locked={isLocked('marijuana')} lockColor={getLockColorClass('marijuana')} label="Marijuana" value={localFilters.marijuana} options={['No', 'Socially', 'Regularly']} onChange={(v) => updateFilter('marijuana', v)} />
                                <FilterSelect locked={isLocked('drugs')} lockColor={getLockColorClass('drugs')} label="Drugs" value={localFilters.drugs} options={['No', 'Sometimes', 'Often']} onChange={(v) => updateFilter('drugs', v)} />
                            </div>
                        </div>

                        {/* Section 5: Relationship Goals */}
                        <div>
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1">Relationship Goals</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <FilterSelect locked={isLocked('relationshipType')} lockColor={getLockColorClass('relationshipType')} label="Type" value={localFilters.relationshipType} options={['Monogamous', 'Polyamorous', 'Open', 'Casual']} onChange={(v) => updateFilter('relationshipType', v)} />
                                <FilterSelect locked={isLocked('datingIntention')} lockColor={getLockColorClass('datingIntention')} label="Intention" value={localFilters.datingIntention} options={['Long-term', 'Short-term', 'Marriage', 'Casual', 'Friendship']} onChange={(v) => updateFilter('datingIntention', v)} />
                                <FilterSelect locked={isLocked('children')} lockColor={getLockColorClass('children')} label="Children" value={localFilters.children} options={['Has children', 'No children']} onChange={(v) => updateFilter('children', v)} />
                                <FilterSelect locked={isLocked('familyPlans')} lockColor={getLockColorClass('familyPlans')} label="Family Plans" value={localFilters.familyPlans} options={['Wants children', 'Open to children', 'Does not want children']} onChange={(v) => updateFilter('familyPlans', v)} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-[#191919] flex justify-between gap-3 z-10">
                    <Button variant="ghost" onClick={handleReset} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-4 text-xs">
                        Reset All
                    </Button>
                    <Button onClick={handleApply} className="flex-1 justify-center h-10 text-sm font-bold shadow-sm bg-black dark:bg-white text-white dark:text-black hover:scale-[1.01] transition-transform">
                        Show Matches
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default FilterModal;
