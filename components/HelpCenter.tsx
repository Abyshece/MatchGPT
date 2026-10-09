import React from 'react';
import { PageHeader, InfoSection, Toggle } from './NotionUI';
import { IconBook, IconCheck, IconX, IconHelpCircle, IconSearch, IconMessageCircle, IconShield } from '../constants';
import { Capacitor } from '@capacitor/core';
import { helpTopics, SUPPORT_EMAIL, type HelpPlatform } from './helpTopics';

// ============================================================================
// HelpCenter: getting started, search tips, common questions and a way to
// reach us (the stores ask for one in the app). The answers are the same as
// on the website's /support page (helpTopics).
// ============================================================================

const Example: React.FC<{ good: boolean; children: React.ReactNode }> = ({ good, children }) => (
  <li className="flex gap-2">
    <span aria-hidden="true" className={`flex-none mt-0.5 [&>svg]:w-4 [&>svg]:h-4 ${good ? 'text-green-500' : 'text-red-500'}`}>{good ? <IconCheck /> : <IconX />}</span>
    <span>{children}</span>
  </li>
);

const HelpCenter: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#191919]">
        <div className="max-w-4xl mx-auto py-12 px-6 animate-fade-in">
            <PageHeader title="Help Center" icon={<IconHelpCircle />} />

            <div className="grid gap-8">

                {/* Intro Card */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <IconBook /> Getting Started
                    </h2>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                        Welcome to Shaadi24! Describe the person you hope to marry, in your own words, and meet the people you fit best: by values, family, lifestyle and plans, not just photos.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm">
                            <div className="mb-2 text-gray-700 dark:text-gray-300 [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconSearch /></div>
                            <h3 className="font-bold text-xs uppercase text-gray-500 dark:text-gray-400">Search in your words</h3>
                            <p className="text-xs text-gray-800 dark:text-gray-200 mt-1">Say who you're looking for; the best fits come first.</p>
                        </div>
                        <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm">
                            <div className="mb-2 text-gray-700 dark:text-gray-300 [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconMessageCircle /></div>
                            <h3 className="font-bold text-xs uppercase text-gray-500 dark:text-gray-400">Like, match, chat</h3>
                            <p className="text-xs text-gray-800 dark:text-gray-200 mt-1">When you both like each other, it's a match and you can chat.</p>
                        </div>
                        <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm">
                            <div className="mb-2 text-gray-700 dark:text-gray-300 [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconShield /></div>
                            <h3 className="font-bold text-xs uppercase text-gray-500 dark:text-gray-400">Verified</h3>
                            <p className="text-xs text-gray-800 dark:text-gray-200 mt-1">The badge means our team has checked who they are.</p>
                        </div>
                    </div>
                </div>

                {/* Search Mastery Section */}
                <InfoSection title="Search Mastery">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        The search bar is your most powerful tool. Instead of just filtering by age or location, describe the <strong>person</strong> you are looking for.
                    </p>

                    <div className="grid gap-4">
                        <div className="border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                            <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-2">Effective Prompts</h4>
                            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                <Example good>"A Marathi software engineer in Pune who loves to travel"</Example>
                                <Example good>"Vegetarian, Gujarati, wants children, 27 to 32"</Example>
                                <Example good>"A doctor settled in the UK, open to moving back to India"</Example>
                            </ul>
                        </div>

                        <div className="border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 rounded-lg p-4">
                            <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-2">Avoid</h4>
                            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                <Example good={false}>"Someone nice" (say what matters to you)</Example>
                                <Example good={false}>Names, phone numbers or other personal details (search finds people by who they are)</Example>
                            </ul>
                        </div>
                    </div>
                </InfoSection>

                {/* FAQ Section */}
                <InfoSection title="Frequently Asked Questions">
                    {helpTopics(Capacitor.getPlatform() as HelpPlatform).map((t) => (
                        <Toggle key={t.q} title={t.q}>
                            <p className="text-sm text-gray-600 dark:text-gray-300 pb-2 leading-relaxed">{t.a}</p>
                        </Toggle>
                    ))}
                </InfoSection>

                {/* Support Contact */}
                <div className="border-t border-gray-100 dark:border-zinc-800 pt-8 mt-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Still have questions? Write to us at {SUPPORT_EMAIL}.</p>
                    <a
                        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shaadi24 help')}`}
                        className="inline-block bg-black dark:bg-white text-white dark:text-black px-6 py-2 rounded-full text-sm font-bold shadow-md hover:scale-105 transition-transform"
                    >
                        Contact Support
                    </a>
                </div>

            </div>
        </div>
    </div>
  );
};

export default HelpCenter;
