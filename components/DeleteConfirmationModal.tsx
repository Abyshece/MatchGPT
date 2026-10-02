
import React from 'react';
import { Button } from './NotionUI';
import { IconTrash } from '../constants';

interface DeleteConfirmationModalProps {
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    description?: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ 
    onConfirm, 
    onCancel, 
    title = "Delete Chat History?", 
    description = "Are you sure you want to delete this search from your history? This action cannot be undone." 
}) => (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center border border-gray-200 dark:border-zinc-800">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4"><IconTrash /></div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{description}</p>
            <div className="flex gap-3 justify-center">
                <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button onClick={onConfirm} className="bg-red-500 hover:bg-red-600 text-white border-none">Delete</Button>
            </div>
        </div>
    </div>
);

export default DeleteConfirmationModal;
