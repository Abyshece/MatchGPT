
import React, { useState, useEffect } from 'react';
import { MatchCandidate, ChatMessage, SubscriptionTier } from '../types';
import { IconSearch, IconX, MOCK_CHATS, MOCK_MATCH_CANDIDATES, IconUserMinus, IconBan, IconFlag } from '../constants';
import { Button } from './NotionUI';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import DateProposalModal from './DateProposalModal';

interface ChatSystemProps {
  initialMatches?: MatchCandidate[];
  onViewProfile?: (match: MatchCandidate) => void;
  onUnmatch?: (matchId: string) => void;
  userTier?: SubscriptionTier;
}

const REMOVE_REASONS = ["No longer interested", "Met someone else", "Incompatible", "No chemistry", "Other"];
const REPORT_REASONS = ["Inappropriate content", "Fake profile / Catfish", "Scam / Spam", "Harassment", "Underage", "Other"];

const ChatSystem: React.FC<ChatSystemProps> = ({ initialMatches = [], onViewProfile, onUnmatch, userTier = 'FREE' }) => {
  // State
  const [matches, setMatches] = useState<MatchCandidate[]>(initialMatches.length > 0 ? initialMatches : MOCK_MATCH_CANDIDATES);
  const [blockedUsers, setBlockedUsers] = useState<MatchCandidate[]>([]);
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'BLOCKED'>('ACTIVE');
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(MOCK_CHATS);
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Responsive State
  const [mobileView, setMobileView] = useState<'LIST' | 'CHAT'>('LIST');

  // Modal State
  const [showDateModal, setShowDateModal] = useState(false);
  const [modalAction, setModalAction] = useState<'BLOCK' | 'REMOVE' | 'REPORT' | null>(null);
  const [actionReason, setActionReason] = useState<string>('');

  // Sync props to state
  useEffect(() => {
    if (initialMatches.length > 0) setMatches(initialMatches);
  }, [initialMatches]);

  const activeMatch = matches.find(m => m.id === activeMatchId);

  // Handlers
  const handleSelectMatch = (id: string) => {
    setActiveMatchId(id);
    setMobileView('CHAT');
    
    // Mark as read logic
    setMessages(prev => {
        const chat = prev[id];
        if (!chat || !chat.some(m => m.senderId !== 'me' && !m.isRead)) return prev;
        return {
            ...prev,
            [id]: chat.map(m => m.senderId !== 'me' ? { ...m, isRead: true } : m)
        };
    });
  };

  const handleSendMessage = (text: string) => {
    if (!activeMatchId) return;
    
    const newMessage: ChatMessage = { id: Date.now().toString(), senderId: 'me', text, timestamp: Date.now(), isRead: false };
    setMessages(prev => ({ ...prev, [activeMatchId]: [...(prev[activeMatchId] || []), newMessage] }));

    // Sim logic
    setTimeout(() => {
        setMessages(prev => {
            const current = prev[activeMatchId] || [];
            return { ...prev, [activeMatchId]: current.map(m => m.id === newMessage.id ? { ...m, isRead: true } : m) };
        });
        setIsTyping(true);
        setTimeout(() => {
            const isProposal = text.includes('📅 **Date Proposal**');
            const replyText = isProposal ? "That sounds lovely! I'd love to meet up then. 😊" : "That's interesting! Tell me more.";
            const reply: ChatMessage = { id: (Date.now() + 1).toString(), senderId: activeMatchId, text: replyText, timestamp: Date.now(), isRead: true };
            setMessages(prev => ({ ...prev, [activeMatchId]: [...(prev[activeMatchId] || []), reply] }));
            setIsTyping(false);
        }, 2000);
    }, 1500);
  };

  const confirmAction = () => {
      if (!activeMatchId) return;
      if ((modalAction === 'REMOVE' || modalAction === 'REPORT') && !actionReason) { alert("Please select a reason."); return; }

      const userToActOn = matches.find(m => m.id === activeMatchId);
      if (modalAction === 'BLOCK' && userToActOn) {
          setBlockedUsers(prev => [...prev, userToActOn]);
          if (onUnmatch) onUnmatch(activeMatchId);
          setMatches(prev => prev.filter(m => m.id !== activeMatchId));
          alert("User blocked.");
      } else if (modalAction === 'REMOVE') {
          if (onUnmatch) onUnmatch(activeMatchId);
          setMatches(prev => prev.filter(m => m.id !== activeMatchId));
          alert("Match removed.");
      } else if (modalAction === 'REPORT') {
          if (onUnmatch) onUnmatch(activeMatchId);
          setMatches(prev => prev.filter(m => m.id !== activeMatchId));
          alert("User reported and hidden.");
      }
      setActiveMatchId(null);
      setMobileView('LIST');
      setModalAction(null);
  };

  const handleUnblock = (userId: string) => {
      const user = blockedUsers.find(u => u.id === userId);
      if (user) {
          setMatches(prev => [...prev, user]);
          setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      }
  };

  return (
    <div className="h-full bg-gray-50/50 dark:bg-zinc-950/50 border-t border-gray-100 dark:border-zinc-800 overflow-hidden font-sans flex justify-center relative">
      
      {/* ACTION MODALS */}
      {modalAction && (
          <div className="fixed inset-0 z-[300] popup-backdrop flex items-center justify-center p-4">
              <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-fade-in">
                  <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50 dark:bg-zinc-800">
                      <h3 className="font-bold text-gray-800 dark:text-gray-100">{modalAction === 'BLOCK' ? 'Block User' : modalAction === 'REMOVE' ? 'Remove Match' : 'Report User'}</h3>
                      <button onClick={() => setModalAction(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-gray-500 dark:text-gray-400"><IconX /></button>
                  </div>
                  <div className="p-6">
                      {modalAction === 'BLOCK' ? (
                          <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to block <strong>{activeMatch?.name}</strong>? You won't see them again.</p>
                      ) : (
                          <div className="space-y-3 mb-6">
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Select a reason:</p>
                              {(modalAction === 'REMOVE' ? REMOVE_REASONS : REPORT_REASONS).map(reason => (
                                  <label key={reason} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent hover:border-gray-100 dark:hover:border-zinc-700">
                                      <input type="radio" name="reason" value={reason} checked={actionReason === reason} onChange={(e) => setActionReason(e.target.value)} className="text-black focus:ring-black dark:focus:ring-white" />
                                      <span className="text-sm text-gray-700 dark:text-gray-300">{reason}</span>
                                  </label>
                              ))}
                          </div>
                      )}
                      <div className="flex gap-3 justify-end">
                          <Button variant="ghost" onClick={() => setModalAction(null)}>Cancel</Button>
                          <Button onClick={confirmAction} className={modalAction === 'REPORT' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-black dark:bg-white text-white dark:text-black'}>Confirm</Button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* DATE PROPOSAL MODAL */}
      {showDateModal && (
          <DateProposalModal 
            onClose={() => setShowDateModal(false)} 
            onSend={(msg) => handleSendMessage(msg)}
            cityContext={activeMatch?.location.split(',')[0] || "City"} 
          />
      )}

      <div className="flex w-full max-w-6xl h-full bg-white dark:bg-zinc-900 shadow-xl shadow-gray-200/50 dark:shadow-none border-x border-gray-200 dark:border-zinc-800">
        <ChatList 
            matches={matches} 
            messages={messages} 
            activeMatchId={activeMatchId} 
            onSelectMatch={handleSelectMatch}
            viewMode={viewMode}
            setViewMode={setViewMode}
            blockedUsers={blockedUsers}
            onUnblock={handleUnblock}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            isVisible={mobileView === 'LIST'}
        />

        {mobileView === 'CHAT' || (window.innerWidth >= 768) ? (
             activeMatch ? (
                <ChatWindow 
                    activeMatch={activeMatch}
                    messages={messages[activeMatch.id] || []}
                    isTyping={isTyping}
                    onSendMessage={handleSendMessage}
                    onBack={() => { setActiveMatchId(null); setMobileView('LIST'); }}
                    onViewProfile={onViewProfile || (() => {})}
                    onInitiateAction={(action) => { setModalAction(action); setActionReason(''); }}
                    onOpenDateModal={() => setShowDateModal(true)}
                    isDateProposalLocked={userTier === 'FREE'}
                />
             ) : (
                <div className="hidden md:flex flex-1 flex-col items-center justify-center text-gray-300 dark:text-zinc-700 select-none bg-gray-50/30 dark:bg-zinc-900">
                    <div className="w-24 h-24 mb-4 opacity-20"><IconSearch /></div>
                    <p className="text-sm font-medium text-gray-400 dark:text-zinc-600">Select a conversation to start chatting</p>
                </div>
             )
        ) : null}
      </div>
    </div>
  );
};

export default ChatSystem;
