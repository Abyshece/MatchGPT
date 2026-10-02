
import React, { useState } from 'react';
import { Button } from './NotionUI';
import { IconCalendar, IconMapPin, IconX } from '../constants';

// Mock Location Data for Simulation (moved from ChatSystem)
const MOCK_LOCATIONS = [
    "Starbucks, Main St", "Blue Bottle Coffee", "Central Park", "Brooklyn Bridge Park",
    "Joe's Pizza", "The High Line", "Metropolitan Museum of Art", "Chelsea Market",
    "Domino Park", "Prospect Park", "Time Out Market", "Devocion Coffee"
];

interface DateProposalModalProps {
    onClose: () => void;
    onSend: (message: string) => void;
    cityContext: string;
}

const DateProposalModal: React.FC<DateProposalModalProps> = ({ onClose, onSend, cityContext }) => {
    const [dateProposal, setDateProposal] = useState({
        date: '',
        time: '',
        location: '',
        activity: ''
    });
    const [locationResults, setLocationResults] = useState<string[]>([]);
    const [isSearchingLocation, setIsSearchingLocation] = useState(false);

    const handleLocationSearch = (val: string) => {
        setDateProposal({ ...dateProposal, location: val });
        if (val.length > 2) {
            setIsSearchingLocation(true);
            setTimeout(() => {
                const results = MOCK_LOCATIONS.map(l => `${l}, ${cityContext}`);
                const filtered = results.filter(l => l.toLowerCase().includes(val.toLowerCase()));
                setLocationResults(filtered.length > 0 ? filtered : [`${val}, ${cityContext}`]);
                setIsSearchingLocation(false);
            }, 600);
        } else {
            setLocationResults([]);
        }
    };

    const sendDateProposal = () => {
        if (!dateProposal.date || !dateProposal.time || !dateProposal.location) {
            alert("Please fill in Date, Time, and Location.");
            return;
        }
        
        const proposalMessage = `📅 **Date Proposal**\n\nLet's meet for **${dateProposal.activity || 'a date'}**!\n\n📍 **Where:** ${dateProposal.location}\n⏰ **When:** ${dateProposal.date} at ${dateProposal.time}`;
        
        onSend(proposalMessage);
        onClose();
    };

    return (
        <div className="absolute inset-0 z-[100] popup-backdrop flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in border border-gray-200 dark:border-zinc-700">
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <IconCalendar /> Plan a Date
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded">
                        <IconX />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    {/* Activity */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Activity</label>
                        <input 
                            type="text" 
                            placeholder="e.g. Coffee, Dinner, Hiking" 
                            value={dateProposal.activity}
                            onChange={(e) => setDateProposal({ ...dateProposal, activity: e.target.value })}
                            className="w-full border border-gray-200 dark:border-zinc-700 rounded p-2 text-sm bg-gray-50 dark:bg-zinc-800 outline-none text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* When */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Date</label>
                            <div className="relative">
                                <input 
                                    type="date" 
                                    value={dateProposal.date}
                                    onChange={(e) => setDateProposal({ ...dateProposal, date: e.target.value })}
                                    className="w-full border border-gray-200 dark:border-zinc-700 rounded p-2 text-sm bg-gray-50 dark:bg-zinc-800 outline-none text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Time</label>
                            <div className="relative">
                                <input 
                                    type="time" 
                                    value={dateProposal.time}
                                    onChange={(e) => setDateProposal({ ...dateProposal, time: e.target.value })}
                                    className="w-full border border-gray-200 dark:border-zinc-700 rounded p-2 text-sm bg-gray-50 dark:bg-zinc-800 outline-none text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Where */}
                    <div className="relative">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Location</label>
                        <div className="relative">
                            <div className="absolute left-2.5 top-2.5 text-gray-400"><IconMapPin /></div>
                            <input 
                                type="text" 
                                placeholder="Search places..." 
                                value={dateProposal.location}
                                onChange={(e) => handleLocationSearch(e.target.value)}
                                className="w-full border border-gray-200 dark:border-zinc-700 rounded p-2 pl-9 text-sm bg-gray-50 dark:bg-zinc-800 outline-none text-gray-900 dark:text-white"
                            />
                            {isSearchingLocation && (
                                <div className="absolute right-3 top-2.5">
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-black dark:border-zinc-600 dark:border-t-white rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                        
                        {/* Location Results Dropdown */}
                        {locationResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                                {locationResults.map((loc, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => {
                                            setDateProposal({ ...dateProposal, location: loc });
                                            setLocationResults([]);
                                        }}
                                        className="px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer flex items-center gap-2"
                                    >
                                        <span className="text-gray-400"><IconMapPin /></span>
                                        <span className="truncate text-gray-800 dark:text-gray-200">{loc}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <Button onClick={sendDateProposal} className="w-full h-10 justify-center mt-2">
                        Send Proposal
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DateProposalModal;
