import React, { useState } from 'react';
import { UserProfile, MatchCandidate } from '../types';
import { Button, PageHeader } from './NotionUI';
import { 
    IconUser, IconShield, IconCheck, IconX, IconSearch, 
    IconFlag, IconTrash, IconLogOut, IconLock, IconEye, 
    IconZap, IconRocket, IconVerify, IconSparkles,
    IconCreditCard, IconMapPin, IconHeart, IconMessageCircle, IconBan,
    IconHelpCircle, IconSend, IconClock, IconFileText, IconImage, IconMegaphone, IconPlus, IconEdit
} from '../constants';

interface AdminDashboardProps {
    userProfile: UserProfile | null;
    onVerifyUser: (isVerified: boolean) => void;
    onLogout: () => void;
}

type AdminTab = 'OVERVIEW' | 'USERS' | 'VERIFICATIONS' | 'REVENUE' | 'SAFETY' | 'ANALYTICS' | 'SETTINGS' | 'INSIGHTS' | 'SUPPORT' | 'CMS';

interface SupportTicket {
    id: string;
    user: string;
    email: string;
    subject: string;
    status: 'Open' | 'Pending' | 'Resolved';
    priority: 'Low' | 'Medium' | 'High';
    lastUpdate: string;
    messages: { sender: 'User' | 'Admin'; text: string; time: string }[];
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ userProfile, onVerifyUser, onLogout }) => {
    const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
    const [cmsTab, setCmsTab] = useState<'ANNOUNCEMENTS' | 'STORIES' | 'FAQ'>('ANNOUNCEMENTS');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [replyText, setReplyText] = useState('');

    // Mock Admin Data
    const stats = {
        totalUsers: 14502,
        activeToday: 892,
        pendingVerifications: userProfile?.verificationStatus === 'pending' ? 4 : 3,
        reports: 12,
        mrr: '₹12.4L',
        growth: '+18%'
    };

    // Mock Users List
    const [mockUsers, setMockUsers] = useState([
        { id: 'u1', name: 'Sarah Jenkins', email: 'sarah.j@example.com', status: 'Active', plan: 'Pro', verified: true, joined: 'Jan 12' },
        { id: 'u2', name: 'Mike Ross', email: 'mike.r@example.com', status: 'Active', plan: 'Free', verified: true, joined: 'Feb 04' },
        { id: 'u3', name: 'Jessica Pearson', email: 'jp@firm.com', status: 'Banned', plan: 'Plus', verified: false, joined: 'Dec 22' },
        { id: 'u4', name: 'Louis Litt', email: 'litt@firm.com', status: 'Active', plan: 'Free', verified: true, joined: 'Mar 15' },
    ]);

    // Mock Search Logs for Insights
    const [searchLogs] = useState([
        { id: 'l1', user: 'Alex Morgan', avatar: 'A', prompt: 'Looking for an ambitious lawyer in NYC who loves dogs', filters: ['Verified', 'Age 25-35'], results: 12, time: '2m ago' },
        { id: 'l2', user: 'Guest User', avatar: 'G', prompt: 'Vegan chef', filters: ['Online'], results: 4, time: '5m ago' },
        { id: 'l3', user: 'Sarah J.', avatar: 'S', prompt: 'Someone who likes anime and hiking', filters: [], results: 8, time: '12m ago' },
        { id: 'l4', user: 'Mike Ross', avatar: 'M', prompt: 'Tall doctor', filters: ['Height > 6ft'], results: 0, time: '15m ago' },
        { id: 'l5', user: 'Jessica P.', avatar: 'J', prompt: 'Corporate lawyer', filters: ['Verified', 'MBA'], results: 2, time: '1h ago' },
        { id: 'l6', user: 'Harvey S.', avatar: 'H', prompt: 'Loyal partner who likes jazz', filters: ['Non-smoker'], results: 15, time: '2h ago' },
    ]);

    // Mock Revenue Data
    const transactions = [
        { id: 'tx1', user: 'Alex Morgan', plan: 'Pro Plan', amount: '₹2,999', date: 'Just now', status: 'Success' },
        { id: 'tx2', user: 'David Kim', plan: 'Shaadi24+', amount: '₹1,999', date: '2 mins ago', status: 'Success' },
        { id: 'tx3', user: 'Guest User', plan: 'Boost (24h)', amount: '₹199', date: '15 mins ago', status: 'Failed' },
        { id: 'tx4', user: 'Sarah Jenkins', plan: 'Pro Plan', amount: '₹2,999', date: '1 hour ago', status: 'Success' },
    ];

    // Mock Safety Data
    const flaggedContent = [
        { id: 'f1', type: 'Photo', reason: 'Nudity detected', confidence: '98%', user: 'User #9921', content: 'Image Hidden' },
        { id: 'f2', type: 'Bio', reason: 'Hate speech', confidence: '85%', user: 'User #1102', content: '"I hate everyone who..."' },
        { id: 'f3', type: 'Message', reason: 'Harassment', confidence: '92%', user: 'User #4401', content: 'Chat Log #8821' },
    ];

    // Mock Support Tickets
    const [mockTickets, setMockTickets] = useState<SupportTicket[]>([
        { 
            id: 't1', user: 'David Kim', email: 'david.k@example.com', subject: 'Billing Issue - Charged Twice', status: 'Open', priority: 'High', lastUpdate: '10m ago',
            messages: [
                { sender: 'User', text: 'Hi, I was charged twice for the Pro subscription yesterday. Can you help?', time: '10:30 AM' }
            ]
        },
        { 
            id: 't2', user: 'Emma Watson', email: 'emma.w@example.com', subject: 'How to change location?', status: 'Pending', priority: 'Low', lastUpdate: '2h ago',
            messages: [
                { sender: 'User', text: 'I moved to a new city but my profile still shows the old one.', time: 'Yesterday' },
                { sender: 'Admin', text: 'Hi Emma, you can update this in your Profile settings under "The Basics".', time: '9:00 AM' },
                { sender: 'User', text: 'Oh I see it now, thanks!', time: '9:15 AM' }
            ]
        },
        { 
            id: 't3', user: 'John Doe', email: 'john.d@example.com', subject: 'Report User #9921', status: 'Resolved', priority: 'Medium', lastUpdate: '1d ago',
            messages: [
                { sender: 'User', text: 'This user is sending spam messages.', time: '2 days ago' },
                { sender: 'Admin', text: 'Thanks for reporting. We have taken action.', time: '1 day ago' }
            ]
        }
    ]);

    // Mock CMS Data
    const [announcements, setAnnouncements] = useState([
        { id: 'a1', title: 'Valentine\'s Day Special', type: 'Promo', status: 'Active', views: 4500, date: 'Feb 10, 2024' },
        { id: 'a2', title: 'Server Maintenance', type: 'System', status: 'Draft', views: 0, date: 'Feb 15, 2024' },
        { id: 'a3', title: 'New Feature: Voice Intros', type: 'Feature', status: 'Archived', views: 12000, date: 'Jan 20, 2024' },
    ]);

    const [stories, setStories] = useState([
        { id: 's1', couple: 'Alex & Sarah', snippet: 'Met via Shaadi24 in NYC...', status: 'Published', img: 'https://picsum.photos/id/1005/200/200' },
        { id: 's2', couple: 'David & Emily', snippet: 'A cross-country love story...', status: 'Pending Review', img: 'https://picsum.photos/id/1011/200/200' },
    ]);

    const [faqs, setFaqs] = useState([
        { id: 'q1', question: 'How do I verify my profile?', category: 'Account', lastUpdated: '2 days ago' },
        { id: 'q2', question: 'Is Shaadi24 free?', category: 'Billing', lastUpdated: '1 week ago' },
        { id: 'q3', question: 'How to delete account?', category: 'Privacy', lastUpdated: '3 weeks ago' },
    ]);

    const insightMetrics = {
        topKeywords: ['Lawyer', 'NYC', 'Hiking', 'Coffee', 'Doctor'],
        zeroResults: 14,
        avgFilters: 1.8
    };

    // Handle User Search
    const filteredUsers = mockUsers.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleVerificationAction = (approved: boolean) => {
        if (confirm(`Are you sure you want to ${approved ? 'approve' : 'reject'} verification for ${userProfile?.name}?`)) {
            onVerifyUser(approved);
            alert(`Verification ${approved ? 'Approved' : 'Rejected'}. The user profile has been updated.`);
        }
    };

    const handleSendReply = () => {
        if (!selectedTicket || !replyText.trim()) return;
        
        const updatedTicket = {
            ...selectedTicket,
            status: 'Pending' as const, // Cast to literal type
            messages: [...selectedTicket.messages, { sender: 'Admin' as const, text: replyText, time: 'Just now' }]
        };

        setMockTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        setSelectedTicket(updatedTicket);
        setReplyText('');
    };

    const handleCloseTicket = () => {
        if (!selectedTicket) return;
        const updatedTicket = { ...selectedTicket, status: 'Resolved' as const };
        setMockTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        setSelectedTicket(updatedTicket);
    };

    const TabButton = ({ id, label, icon, badge }: { id: AdminTab, label: string, icon: React.ReactNode, badge?: number }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === id 
                    ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
            }`}
        >
            <div className="flex items-center gap-3">
                {icon}
                {label}
            </div>
            {badge ? (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === id ? 'bg-white text-black' : 'bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300'}`}>
                    {badge}
                </span>
            ) : null}
        </button>
    );

    const renderOverview = () => (
        <div className="space-y-6 animate-fade-in">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), change: '+124 this week', icon: <IconUser /> },
                    { label: 'Monthly Revenue', value: stats.mrr, change: stats.growth, icon: <IconZap />, highlight: true },
                    { label: 'Pending Verifications', value: stats.pendingVerifications, change: 'Requires attention', icon: <IconShield />, color: 'text-yellow-500' },
                    { label: 'Open Tickets', value: mockTickets.filter(t => t.status === 'Open').length, change: 'Avg response: 1h', icon: <IconHelpCircle />, color: 'text-blue-500' },
                ].map((stat, idx) => (
                    <div key={idx} className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-2 rounded-lg ${stat.color ? 'bg-opacity-10 bg-current' : 'bg-gray-100 dark:bg-zinc-800'} ${stat.color || 'text-gray-500 dark:text-gray-400'}`}>
                                {stat.icon}
                            </div>
                            {stat.highlight && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">Trending</span>}
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{stat.value}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                        <p className="text-[10px] font-medium text-gray-400 mt-2">{stat.change}</p>
                    </div>
                ))}
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <IconRocket /> System Status
                </h3>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/10 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-900/30">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Systems Operational
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 px-3 py-1.5">
                        Version 2.4.0 (Stable)
                    </div>
                </div>
            </div>
        </div>
    );

    const renderCMS = () => (
        <div className="animate-fade-in h-full flex flex-col">
            {/* CMS Sub-nav */}
            <div className="flex gap-4 mb-6 border-b border-gray-100 dark:border-zinc-800 pb-1">
                {(['ANNOUNCEMENTS', 'STORIES', 'FAQ'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setCmsTab(tab)}
                        className={`pb-2 text-sm font-bold transition-colors border-b-2 ${
                            cmsTab === tab 
                                ? 'text-black dark:text-white border-black dark:border-white' 
                                : 'text-gray-400 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                    >
                        {tab === 'ANNOUNCEMENTS' ? 'Announcements' : tab === 'STORIES' ? 'Success Stories' : 'Help Center'}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto">
                {cmsTab === 'ANNOUNCEMENTS' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                            <div>
                                <h3 className="font-bold text-blue-900 dark:text-blue-100">Create Announcement</h3>
                                <p className="text-xs text-blue-700 dark:text-blue-300">Broadcast messages to all users (e.g. maintenance, promos).</p>
                            </div>
                            <Button className="bg-blue-600 text-white border-none shadow-md hover:bg-blue-700">
                                <IconPlus className="w-4 h-4 mr-1" /> New
                            </Button>
                        </div>

                        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                                    <tr>
                                        <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Title</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Type</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Views</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                                        <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                                    {announcements.map(ann => (
                                        <tr key={ann.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{ann.title}</td>
                                            <td className="px-6 py-4"><span className="px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded text-xs text-gray-600 dark:text-gray-300">{ann.type}</span></td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{ann.views.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{ann.date}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${ann.status === 'Active' ? 'bg-green-100 text-green-700' : ann.status === 'Draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {ann.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {cmsTab === 'STORIES' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {stories.map(story => (
                            <div key={story.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex gap-4 shadow-sm">
                                <img src={story.img} alt={story.couple} className="w-24 h-24 rounded-lg object-cover bg-gray-100" />
                                <div className="flex-1 flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="font-bold text-gray-900 dark:text-white">{story.couple}</h3>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${story.status === 'Published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {story.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{story.snippet}</p>
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                        <button className="text-xs font-bold text-blue-600 hover:underline">Edit</button>
                                        <button className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-gray-300 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer h-full min-h-[140px]">
                            <IconPlus />
                            <span className="text-xs font-bold mt-2">Add New Story</span>
                        </div>
                    </div>
                )}

                {cmsTab === 'FAQ' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <Button variant="secondary" className="text-xs h-8">Add Question</Button>
                        </div>
                        <div className="space-y-2">
                            {faqs.map(faq => (
                                <div key={faq.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-1">{faq.question}</h4>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold">{faq.category}</span>
                                            <span>Updated {faq.lastUpdated}</span>
                                        </div>
                                    </div>
                                    <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-400 hover:text-black dark:hover:text-white">
                                        <IconEdit />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderSupport = () => (
        <div className="animate-fade-in h-[calc(100vh-140px)] flex gap-6">
            {/* Ticket List */}
            <div className={`${selectedTicket ? 'hidden md:block w-1/3' : 'w-full'} bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col`}>
                <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900 dark:text-white">Ticket Queue</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{mockTickets.filter(t => t.status === 'Open').length} Open</span>
                </div>
                <div className="overflow-y-auto flex-1">
                    {mockTickets.map(ticket => (
                        <div 
                            key={ticket.id}
                            onClick={() => setSelectedTicket(ticket)}
                            className={`p-4 border-b border-gray-100 dark:border-zinc-800 cursor-pointer transition-colors ${selectedTicket?.id === ticket.id ? 'bg-blue-50 dark:bg-zinc-800' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${ticket.status === 'Open' ? 'bg-green-500' : ticket.status === 'Pending' ? 'bg-yellow-500' : 'bg-gray-300'}`}></span>
                                    <span className="font-bold text-sm text-gray-900 dark:text-white truncate">{ticket.user}</span>
                                </div>
                                <span className="text-[10px] text-gray-400">{ticket.lastUpdate}</span>
                            </div>
                            <div className="text-sm text-gray-800 dark:text-gray-200 font-medium mb-1 truncate">{ticket.subject}</div>
                            <div className="flex gap-2 mt-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${ticket.priority === 'High' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{ticket.priority}</span>
                                <span className="text-[10px] text-gray-400 px-1.5 py-0.5 border border-gray-200 rounded">#{ticket.id}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ticket Detail View */}
            {selectedTicket ? (
                <div className="flex-1 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-start bg-gray-50/50 dark:bg-zinc-800/30">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <button className="md:hidden mr-2 text-gray-500" onClick={() => setSelectedTicket(null)}>←</button>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedTicket.subject}</h2>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${selectedTicket.status === 'Resolved' ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>{selectedTicket.status}</span>
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                                <IconUser className="w-3 h-3" /> {selectedTicket.user} <span className="text-gray-300">•</span> {selectedTicket.email}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {selectedTicket.status !== 'Resolved' && (
                                <Button variant="secondary" onClick={handleCloseTicket} className="h-8 text-xs">Close Ticket</Button>
                            )}
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-zinc-900">
                        {selectedTicket.messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.sender === 'Admin' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${msg.sender === 'Admin' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-200 text-gray-600'}`}>
                                    {msg.sender === 'Admin' ? 'AD' : selectedTicket.user.charAt(0)}
                                </div>
                                <div className={`max-w-[70%]`}>
                                    <div className={`p-3 rounded-lg text-sm ${msg.sender === 'Admin' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100' : 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200'}`}>
                                        {msg.text}
                                    </div>
                                    <div className={`text-[10px] text-gray-400 mt-1 ${msg.sender === 'Admin' ? 'text-right' : ''}`}>{msg.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input Area */}
                    {selectedTicket.status !== 'Resolved' ? (
                        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900">
                            <div className="flex gap-2 mb-2">
                                <button className="text-xs bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-1 rounded-full text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setReplyText("Hi there, thanks for reaching out. Could you provide more details?")}>
                                    ✨ AI Suggestion: "Ask for details"
                                </button>
                                <button className="text-xs bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 px-3 py-1 rounded-full text-gray-600 hover:bg-gray-50 transition-colors" onClick={() => setReplyText("We have processed your refund. It should appear in 3-5 days.")}>
                                    💸 Quick Refund Reply
                                </button>
                            </div>
                            <div className="flex gap-3">
                                <input 
                                    type="text" 
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type a reply..."
                                    className="flex-1 border border-gray-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-black dark:focus:ring-white outline-none bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                                />
                                <Button onClick={handleSendReply} className="px-6"><IconSend /></Button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-gray-50 dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 text-center text-sm text-gray-500 italic">
                            This ticket has been resolved. Re-open to reply.
                        </div>
                    )}
                </div>
            ) : (
                <div className="hidden md:flex flex-1 items-center justify-center text-gray-400 bg-gray-50/50 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 border-dashed">
                    <div className="text-center">
                        <IconHelpCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Select a ticket to view details</p>
                    </div>
                </div>
            )}
        </div>
    );

    const renderRevenue = () => (
        <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-white/20 rounded-lg"><IconCreditCard /></div>
                        <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">+18% vs last month</span>
                    </div>
                    <h3 className="text-3xl font-bold mb-1">₹12.4L</h3>
                    <p className="text-sm opacity-90">Monthly Recurring Revenue</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Churn Rate</h4>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">2.4%</div>
                    <p className="text-xs text-green-500 font-medium">↓ 0.5% improvement</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Active Subscriptions</h4>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">3,420</div>
                    <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden flex">
                        <div className="w-[60%] bg-blue-500 h-full"></div>
                        <div className="w-[30%] bg-yellow-500 h-full"></div>
                        <div className="w-[10%] bg-gray-300 h-full"></div>
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400 mt-1 uppercase font-bold">
                        <span>Plus</span>
                        <span>Pro</span>
                        <span>Free</span>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recent Transactions</h3>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">User</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Plan</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">Amount</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {transactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{tx.user}</td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{tx.plan}</td>
                                    <td className="px-6 py-4 font-mono text-gray-800 dark:text-gray-200">{tx.amount}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${tx.status === 'Success' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderSafety = () => (
        <div className="animate-fade-in space-y-8">
            <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex items-center gap-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full"><IconFlag /></div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">12</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Pending Flags</p>
                    </div>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-800 p-4 rounded-xl flex items-center gap-4">
                    <div className="p-3 bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 rounded-full"><IconBan /></div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">1,024</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Banned Users</p>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <IconShield className="text-red-500" /> Moderation Queue
                </h3>
                <div className="grid gap-4">
                    {flaggedContent.map(item => (
                        <div key={item.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
                            <div className="flex gap-4 items-center">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-gray-400 font-bold uppercase tracking-wider">
                                    {item.type}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{item.reason}</span>
                                        <span className="text-xs text-gray-400">Confidence: {item.confidence}</span>
                                    </div>
                                    <h4 className="font-bold text-gray-900 dark:text-white text-sm">{item.user}</h4>
                                    <p className="text-xs text-gray-500 italic mt-0.5">{item.content}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" className="text-xs h-8 hover:bg-green-50 text-green-600 border-green-200">Ignore</Button>
                                <Button className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white border-none shadow-sm">Remove & Ban</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderAnalytics = () => (
        <div className="animate-fade-in space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2"><IconUser /> Gender Distribution</h3>
                    <div className="flex items-end gap-8 justify-center h-40 pb-4 border-b border-gray-100 dark:border-zinc-800">
                        <div className="w-16 bg-blue-500 rounded-t-lg relative group h-[70%]">
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold">45%</span>
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-500 uppercase">Men</span>
                        </div>
                        <div className="w-16 bg-pink-500 rounded-t-lg relative group h-[80%]">
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold">52%</span>
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-500 uppercase">Women</span>
                        </div>
                        <div className="w-16 bg-purple-500 rounded-t-lg relative group h-[10%]">
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold">3%</span>
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-gray-500 uppercase">NB</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2"><IconMapPin /> Top Locations</h3>
                    <ul className="space-y-3">
                        {[
                            { city: 'New York, USA', count: '4,201 users', pct: '28%' },
                            { city: 'London, UK', count: '2,100 users', pct: '14%' },
                            { city: 'Los Angeles, USA', count: '1,850 users', pct: '12%' },
                            { city: 'Toronto, Canada', count: '900 users', pct: '6%' },
                        ].map((loc, i) => (
                            <li key={i} className="flex items-center justify-between">
                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{loc.city}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500">{loc.count}</span>
                                    <div className="w-16 bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-black dark:bg-white h-full" style={{ width: loc.pct }}></div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><IconHeart /> Trending Interests</h3>
                <div className="flex flex-wrap gap-2">
                    {['Coffee', 'Hiking', 'Travel', 'Anime', 'Gym', 'Foodie', 'Art', 'Music', 'Tech', 'Yoga', 'Photography', 'Reading'].map((tag, i) => (
                        <span 
                            key={i} 
                            className="px-3 py-1.5 bg-gray-50 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium"
                            style={{ fontSize: `${Math.max(0.75, 1 + (Math.random() * 0.5))}rem`, opacity: Math.max(0.6, Math.random() + 0.4) }}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderInsights = () => (
        <div className="animate-fade-in space-y-8">
            {/* Top Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Top Keywords</h3>
                    <div className="flex flex-wrap gap-2">
                        {insightMetrics.topKeywords.map((kw, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs font-bold">{kw}</span>
                        ))}
                    </div>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Zero-Result Searches</h3>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{insightMetrics.zeroResults}</div>
                    <p className="text-[10px] text-red-500 mt-1 font-medium">High urgency gap</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Avg. Filters Used</h3>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{insightMetrics.avgFilters}</div>
                    <p className="text-[10px] text-green-500 mt-1 font-medium">Healthy engagement</p>
                </div>
            </div>

            {/* Log Table */}
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <IconSparkles className="text-yellow-500" /> Live Search Log
                </h2>
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs w-48">User</th>
                                    <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Prompt</th>
                                    <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs w-32">Filters</th>
                                    <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs text-right w-24">Results</th>
                                    <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs text-right w-24">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                                {searchLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold text-xs border border-gray-200 dark:border-zinc-700">
                                                    {log.avatar}
                                                </div>
                                                <div className="font-bold text-gray-900 dark:text-white truncate max-w-[120px]" title={log.user}>{log.user}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-gray-800 dark:text-gray-200 font-medium font-mono text-xs bg-gray-50 dark:bg-zinc-800 px-2 py-1 rounded block truncate max-w-xs" title={log.prompt}>
                                                "{log.prompt}"
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {log.filters.length > 0 ? log.filters.map((f, i) => (
                                                    <span key={i} className="text-[10px] bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 whitespace-nowrap">{f}</span>
                                                )) : <span className="text-gray-400 text-xs">-</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${log.results === 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'}`}>
                                                {log.results} matches
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs text-gray-400 whitespace-nowrap">
                                            {log.time}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderVerifications = () => (
        <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Verification Queue</h2>
            
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">User</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Submitted</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Links</th>
                                <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {/* CURRENT USER ROW (Only if pending) */}
                            {userProfile && userProfile.verificationStatus === 'pending' ? (
                                <tr className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors bg-yellow-50/30 dark:bg-yellow-900/10">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-xs">
                                                {userProfile.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900 dark:text-white">{userProfile.name} (You)</div>
                                                <div className="text-xs text-gray-500">{userProfile.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">Just now</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            {userProfile.linkedin && <span className="p-1 bg-[#0077b5]/10 text-[#0077b5] rounded text-[10px] font-bold">LI</span>}
                                            {userProfile.instagram && <span className="p-1 bg-[#E1306C]/10 text-[#E1306C] rounded text-[10px] font-bold">IG</span>}
                                            {userProfile.facebook && <span className="p-1 bg-[#1877F2]/10 text-[#1877F2] rounded text-[10px] font-bold">FB</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" onClick={() => handleVerificationAction(false)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full justify-center"><IconX /></Button>
                                            <Button onClick={() => handleVerificationAction(true)} className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white border-none shadow-sm"><IconCheck className="mr-1" /> Approve</Button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 italic">
                                        {userProfile?.verificationStatus === 'verified' 
                                            ? "Current user is already verified. Great job!" 
                                            : "No pending verifications."}
                                    </td>
                                </tr>
                            )}
                            
                            {/* Mock Pending Users */}
                            {['David Kim', 'Emma Watson', 'John Doe'].map((name, i) => (
                                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 flex items-center justify-center font-bold text-xs">
                                                {name.charAt(0)}
                                            </div>
                                            <div className="font-medium text-gray-900 dark:text-white">{name}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">2h ago</td>
                                    <td className="px-6 py-4"><span className="text-xs text-gray-400 italic">Docs uploaded</span></td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="secondary" className="h-8 text-xs">Review</Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderUsers = () => (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h2>
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Search users..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-sm focus:ring-1 focus:ring-black dark:focus:ring-white outline-none w-64"
                    />
                    <div className="absolute left-3 top-2.5 text-gray-400"><IconSearch /></div>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Name</th>
                            <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Plan</th>
                            <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs">Status</th>
                            <th className="px-6 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-xs text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                        {filteredUsers.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{user.name}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${user.plan === 'Pro' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {user.plan}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`flex items-center gap-1.5 text-xs font-medium ${user.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-green-600' : 'bg-red-600'}`}></span>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-gray-400 hover:text-black dark:hover:text-white p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"><IconEye /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-[#111] font-sans text-[#37352f] dark:text-[#d4d4d4]">
            {/* Sidebar */}
            <div className="w-64 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col">
                <div className="p-6 border-b border-gray-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">💍</span>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Shaadi24</h1>
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 pl-8">Admin Console</div>
                </div>
                
                <nav className="flex-1 p-4 space-y-1">
                    <TabButton id="OVERVIEW" label="Overview" icon={<IconZap />} />
                    <TabButton id="INSIGHTS" label="Search Insights" icon={<IconSparkles />} />
                    <TabButton id="REVENUE" label="Revenue" icon={<IconCreditCard />} />
                    <TabButton id="CMS" label="Content (CMS)" icon={<IconFileText />} />
                    <TabButton id="SAFETY" label="Safety & Mod" icon={<IconShield />} badge={2} />
                    <TabButton id="SUPPORT" label="Support" icon={<IconHelpCircle />} badge={mockTickets.filter(t => t.status === 'Open').length} />
                    <TabButton id="VERIFICATIONS" label="Verifications" icon={<IconVerify />} badge={stats.pendingVerifications} />
                    <TabButton id="USERS" label="Users" icon={<IconUser />} />
                    <TabButton id="ANALYTICS" label="Analytics" icon={<IconMapPin />} />
                    <TabButton id="SETTINGS" label="Settings" icon={<IconLock />} />
                </nav>

                <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
                    <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 p-2 rounded transition-colors">
                        <IconLogOut /> Logout
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-8">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white capitalize">
                        {activeTab.toLowerCase().replace('_', ' ')}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            Live
                        </div>
                        <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center font-bold text-xs">
                            AD
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-8">
                    {activeTab === 'OVERVIEW' && renderOverview()}
                    {activeTab === 'INSIGHTS' && renderInsights()}
                    {activeTab === 'REVENUE' && renderRevenue()}
                    {activeTab === 'CMS' && renderCMS()}
                    {activeTab === 'SAFETY' && renderSafety()}
                    {activeTab === 'SUPPORT' && renderSupport()}
                    {activeTab === 'ANALYTICS' && renderAnalytics()}
                    {activeTab === 'VERIFICATIONS' && renderVerifications()}
                    {activeTab === 'USERS' && renderUsers()}
                    {activeTab === 'SETTINGS' && (
                        <div className="text-center py-20 text-gray-400">
                            <IconLock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-bold">System Settings</h3>
                            <p>Global configuration is locked in demo mode.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;