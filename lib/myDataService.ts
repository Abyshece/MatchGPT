// ============================================================================
// myDataService: Settings → "Download my data"
//
// export_my_data() gathers what MatchGPT holds about the signed-in person
// (account, profile, photos, likes, matches, messages, reports they made,
// subscriptions and payments, consents, the phones notifications go to, …).
// It's saved as a JSON file: a download on the website, the share sheet in
// the apps (saveFile).
// ============================================================================

import { supabase } from './supabase';
import { saveTextFile } from './saveFile';

/** Saves the person's data. False if they closed the share sheet. */
export async function downloadMyData(): Promise<boolean> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw new Error(error.message);
  const day = new Date().toISOString().slice(0, 10);
  return saveTextFile(`matchgpt-my-data-${day}.json`, JSON.stringify(data, null, 2), 'application/json');
}
