
import React, { useState } from 'react';
import { PageHeader, Card, Button } from './NotionUI';
import { PHOTO_SLOTS_CONFIG, IconUpload, IconCheck, IconChevronRight, IconChevronLeft } from '../constants';
import { PhotoSlot } from '../types';

interface PhotoUploadProps {
  onComplete: (photos: PhotoSlot[]) => void;
  onBack: () => void;
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({ onComplete, onBack }) => {
  const [slots, setSlots] = useState<PhotoSlot[]>(PHOTO_SLOTS_CONFIG);

  const handleFileChange = (slotId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSlots(prev => prev.map(slot => 
        slot.id === slotId ? { ...slot, file: file, previewUrl: url } : slot
      ));
    }
  };

  // Allow completion if at least 4 photos are uploaded
  const uploadedCount = slots.filter(s => s.file !== null).length;
  const isComplete = uploadedCount >= 4;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in">
      {/* 1. Website Header */}
      <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#191919] z-20">
        <button 
            onClick={onBack} 
            className="mr-3 p-2 -ml-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title="Back"
        >
            <IconChevronLeft />
        </button>
        <div className="font-bold text-gray-700 dark:text-gray-100 text-lg flex items-center gap-2 select-none">
             Shaadi24
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-6 px-4 h-full flex flex-col">
           <div className="flex-none mb-4">
              <PageHeader title="Visual Profile" />
              <div className="text-gray-600 dark:text-gray-300 text-sm -mt-6">
                Upload at least 4 photos to complete your profile. The AI uses these specific categories to find your best match.
              </div>
           </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1 min-h-0">
            {slots.map((slot) => (
              <Card key={slot.id} className="p-3 flex flex-col h-full relative overflow-hidden group">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wide truncate max-w-[80%]">
                    {slot.category}
                  </span>
                  {slot.file && <div className="text-green-500 transform scale-75"><IconCheck /></div>}
                </div>
                
                <h3 className="font-semibold text-xs text-gray-800 dark:text-gray-100 mb-0.5 truncate">{slot.description}</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 flex-grow leading-tight line-clamp-2">{slot.tip}</p>

                <div className="aspect-square bg-gray-50 dark:bg-zinc-800 border border-dashed border-gray-300 dark:border-zinc-700 rounded-md relative flex items-center justify-center overflow-hidden hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
                   {slot.previewUrl ? (
                     <img src={slot.previewUrl} alt="Preview" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                   ) : (
                     <div className="text-center p-2">
                        <div className="mx-auto w-6 h-6 mb-1 text-gray-300 dark:text-gray-600"><IconUpload /></div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">Upload</span>
                     </div>
                   )}
                   
                   <input 
                     type="file" 
                     accept="image/*"
                     className="absolute inset-0 opacity-0 cursor-pointer"
                     onChange={(e) => handleFileChange(slot.id, e)}
                   />
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex justify-end flex-none pb-6">
            <Button 
              onClick={() => onComplete(slots)} 
              disabled={!isComplete}
              className="h-10 px-6 text-sm shadow-lg"
            >
              {isComplete ? 'Complete Profile' : `Upload ${4 - uploadedCount} more`} <IconChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoUpload;
