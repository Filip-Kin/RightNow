// File download/share for generated exports. Web downloads via a Blob; native
// writes to the cache dir and shares the actual file through expo-sharing (a
// content:// URI), so the receiving app gets the file - not a file:// text link
// (which is what RN's Share.share does on Android). Kept apart from lib/export.ts
// so the pure builders there stay unit-testable.
import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/** Write `content` to a cache file and share it as a real file on native. */
async function shareFile(filename: string, mime: string, content: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await shareUri(file.uri, mime, filename);
}

/** Share an existing file URI as a real file (content:// on Android) via the system
 *  sheet. Falls back to RN Share only if expo-sharing isn't available. */
async function shareUri(uri: string, mime: string, dialogTitle: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle });
    return;
  }
  await Share.share(Platform.OS === "ios" ? { url: uri } : { message: uri, url: uri });
}

export async function saveExport(filename: string, mime: string, content: string): Promise<void> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await shareFile(filename, mime, content);
}

/** Render HTML to a PDF. Web opens the print dialog (Save as PDF); native writes a
 *  PDF file and shares it as a real file. */
export async function printPdf(html: string): Promise<void> {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await shareUri(uri, "application/pdf", "Export.pdf");
}
