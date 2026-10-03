// ============================================================================
// saveFile: hands a file the app made (a CSV, an export) to the person
//
// On the website it downloads. In the phone apps a web page can't download,
// so the file is written to the app's cache and the phone's share sheet opens
// (Save to Files, Drive, email, …).
// ============================================================================

import { Capacitor } from '@capacitor/core';

/** Saves a text file. False if the person closed the share sheet. */
export async function saveTextFile(fileName: string, text: string, mimeType: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: fileName, dialogTitle: fileName, files: [uri] });
      return true;
    } catch (e) {
      if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
