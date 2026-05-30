// File download/share for generated exports. Web downloads via a Blob; native
// writes to the cache dir and offers the system share sheet (best-effort until
// store distribution adds expo-sharing). Kept apart from lib/export.ts so the
// pure builders there stay unit-testable.
import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";

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
  // Native: write to the cache dir, then offer the system share sheet.
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Share.share(Platform.OS === "ios" ? { url: file.uri } : { message: file.uri, url: file.uri });
}

/** Render HTML to a PDF. Web opens the print dialog (Save as PDF); native writes a
 *  PDF file and shares it. */
export async function printPdf(html: string): Promise<void> {
  if (Platform.OS === "web") {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  await Share.share(Platform.OS === "ios" ? { url: uri } : { message: uri, url: uri });
}
