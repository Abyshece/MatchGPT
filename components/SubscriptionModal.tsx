
import React from 'react';
import { SubscriptionTier } from '../types';
import { SUBSCRIPTION_PLANS, IconX, IconCheck } from '../constants';
import { Button } from './NotionUI';

interface SubscriptionModalProps {
    onClose: () => void;
    onSubscribe: (tier: SubscriptionTier) => void;
    processingTier: SubscriptionTier | null;
    currentTier?: SubscriptionTier;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSubscribe, processingTier, currentTier = 'FREE' }) => (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 popup-backdrop animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden relative border border-gray-200 dark:border-zinc-800 flex flex-col my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white z-20 bg-gray-100 dark:bg-zinc-800 p-1.5 rounded-full transition-colors"><IconX /></button>
        <div className="p-8 pb-4 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Choose your plan</h2>
            <p className="text-gray-500 dark:text-gray-400">Unlock features to find your perfect match faster.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 md:p-8 pt-2 overflow-y-auto">
            {SUBSCRIPTION_PLANS.map((plan) => {
                const isCurrent = currentTier === plan.tier;
                const isProcessingThis = processingTier === plan.tier;
                const isAnyProcessing = processingTier !== null;
                return (
                    <div key={plan.tier} className={`relative rounded-xl border-2 flex flex-col p-6 transition-all duration-300 ${plan.highlight ? 'border-blue-500 shadow-lg scale-100 md:scale-105 z-10 bg-white dark:bg-zinc-900' : 'border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50 opacity-90 hover:opacity-100'}`}>
                        {plan.highlight && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-sm uppercase tracking-wide">Most Popular</div>}
                        <div className="text-center mb-6">
                            <h3 className={`text-lg font-bold mb-1 ${plan.tier === 'PRO' ? 'text-yellow-500' : (plan.tier === 'PLUS' ? 'text-blue-500' : 'text-gray-900 dark:text-white')}`}>{plan.name}</h3>
                            <div className="flex items-baseline justify-center gap-1"><span className="text-3xl font-extrabold text-gray-900 dark:text-white">{plan.price}</span>{plan.price !== '₹0' && <span className="text-xs text-gray-500 font-medium">{plan.period}</span>}</div>
                        </div>
                        <ul className="flex-1 space-y-3 mb-8">
                            {plan.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><div className={`mt-0.5 ${plan.tier === 'FREE' ? 'text-gray-400' : 'text-green-500'}`}><IconCheck /></div><span className="leading-snug">{feature}</span></li>
                            ))}
                        </ul>
                        <Button onClick={() => onSubscribe(plan.tier)} className={`w-full justify-center h-11 text-sm font-bold rounded-lg transition-transform active:scale-95 ${isCurrent ? 'bg-gray-100 dark:bg-zinc-800 text-gray-400 cursor-default border border-gray-200 dark:border-zinc-700' : (plan.tier === 'PRO' ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:opacity-90 border-none' : (plan.tier === 'PLUS' ? 'bg-blue-600 hover:bg-blue-700 text-white border-none' : 'bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800'))}`} disabled={isAnyProcessing || isCurrent}>
                            {isProcessingThis ? 'Processing...' : (isCurrent ? 'Current Plan' : (plan.tier === 'FREE' ? 'Downgrade' : 'Upgrade'))}
                        </Button>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
);

export default SubscriptionModal;
