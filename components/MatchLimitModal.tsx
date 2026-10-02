
import React from 'react';
import { Button } from './NotionUI';
import { IconMessageCircle } from '../constants';

interface MatchLimitModalProps {
    onClose: () => void;
    count: number;
}

const MatchLimitModal: React.FC<MatchLimitModalProps> = ({ onClose, count }) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center border border-gray-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <IconMessageCircle />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Maximum Matches Reached</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                You have <strong>{count} active matches</strong>. To ensure meaningful connections, you must reply to existing chats or unmatch users before you can like or search for new people.
            </p>
            <Button onClick={onClose} className="w-full justify-center h-11 text-base">
                Understood
            </Button>
        </div>
    </div>
);

export default MatchLimitModal;
