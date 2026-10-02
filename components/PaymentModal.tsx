
import React, { useState } from 'react';
import { Button } from './NotionUI';
import { IconX, IconLock, IconCheck, IconCreditCard, IconShield } from '../constants';

interface PaymentModalProps {
    amount: number;
    description: string;
    onClose: () => void;
    onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ amount, description, onClose, onSuccess }) => {
    const [processing, setProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvc, setCvc] = useState('');

    const handleCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 16) val = val.slice(0, 16);
        const formatted = val.replace(/(\d{4})/g, '$1 ').trim();
        setCardNumber(formatted);
    };

    const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 4) val = val.slice(0, 4);
        if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2);
        setExpiry(val);
    };

    const handlePay = (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        // Simulate Stripe processing delay
        setTimeout(() => {
            setProcessing(false);
            setIsSuccess(true);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1500);
        }, 2000);
    };

    if (isSuccess) {
        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center border border-gray-200 dark:border-zinc-800">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
                        <IconCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Successful!</h3>
                    <p className="text-gray-500 dark:text-gray-400">Your boost is now active.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative border border-gray-200 dark:border-zinc-800">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white z-10 transition-colors">
                    <IconX />
                </button>

                <div className="p-6 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/30">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <div className="text-green-600"><IconShield /></div> Secure Payment
                    </h3>
                    <div className="mt-4 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{description}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">One-time purchase</p>
                        </div>
                        <div className="text-xl font-bold text-gray-900 dark:text-white">
                            ₹{amount}
                        </div>
                    </div>
                </div>

                <form onSubmit={handlePay} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">Card Information</label>
                        <div className="border border-gray-300 dark:border-zinc-700 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all bg-white dark:bg-zinc-800">
                            <div className="flex items-center px-3 py-2.5 border-b border-gray-200 dark:border-zinc-700">
                                <IconCreditCard />
                                <input 
                                    type="text" 
                                    placeholder="0000 0000 0000 0000"
                                    value={cardNumber}
                                    onChange={handleCardChange}
                                    className="w-full ml-3 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 font-mono"
                                    required
                                />
                            </div>
                            <div className="flex divide-x divide-gray-200 dark:divide-zinc-700">
                                <input 
                                    type="text" 
                                    placeholder="MM / YY"
                                    value={expiry}
                                    onChange={handleExpiryChange}
                                    className="w-1/2 px-3 py-2.5 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 font-mono text-center"
                                    required
                                />
                                <input 
                                    type="text" 
                                    placeholder="CVC"
                                    value={cvc}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                                        setCvc(val);
                                    }}
                                    className="w-1/2 px-3 py-2.5 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 font-mono text-center"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <Button 
                        onClick={() => {}} 
                        className="w-full justify-center h-12 text-base font-bold shadow-lg"
                        disabled={processing}
                    >
                        {processing ? 'Processing...' : `Pay ₹${amount}`}
                    </Button>
                    
                    <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400 uppercase tracking-wide">
                        <IconLock /> Encrypted & Secure
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PaymentModal;
