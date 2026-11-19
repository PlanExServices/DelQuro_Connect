import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { Button, Page, Problem, Sheet, ui, useAction } from './ui';

export type RequestFile = (path: string) => Promise<Response>;
type Attachment = { uri: string; dispose: () => void };

const imageTypes: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
};

function cache() {
  return new Directory(Paths.cache, 'connect-attachments');
}

export function clearAttachmentCache() {
  if (Platform.OS === 'web') return;
  try {
    const directory = cache();
    if (directory.exists) directory.delete();
  } catch {
    // Some devices may already have evicted the files.
  }
}

export function AttachmentButton({ id, label, filename, request, imageOnly, shareImage }: {
  id: string; label: string; filename?: string | null; request: RequestFile; imageOnly?: boolean; shareImage?: boolean;
}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  const action = useAction();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => preview?.dispose(), [preview]);

  function open() {
    void action.run(async () => {
      const response = await request(`/files/${encodeURIComponent(id)}`);
      const mime = response.headers.get('Content-Type')?.split(';')[0] ?? 'application/octet-stream';
      const image = imageTypes[mime];
      const showPreview = image && !shareImage;
      if (!image && imageOnly) throw new Error('This attachment is unavailable as an image.');
      const safeName = filename?.replace(/[^a-zA-Z0-9._ -]/g, '').replace(/^\.+/, '').slice(0, 110);
      const name = image ? `image.${image}` : mime === 'application/pdf' ? 'schedule.pdf' : safeName || 'schedule';
      if (Platform.OS === 'web') {
        const blob = await response.blob();
        if (!mounted.current) return;
        const uri = URL.createObjectURL(blob);
        if (showPreview) setPreview({ uri, dispose: () => URL.revokeObjectURL(uri) });
        else {
          const download = document.createElement('a');
          download.href = uri;
          download.download = name;
          download.click();
          setTimeout(() => URL.revokeObjectURL(uri), 1000);
        }
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mounted.current) return;
      const directory = cache();
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, `${Date.now()}-${id}-${name}`);
      file.write(bytes);
      if (showPreview) {
        setPreview({
          uri: file.uri,
          dispose: () => { if (file.exists) file.delete(); },
        });
        return;
      }
      if (!await Sharing.isAvailableAsync()) throw new Error('This device cannot open the schedule file.');
      await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: label });
    });
  }

  return (
    <View style={ui.stack}>
      <Button label={action.busy ? 'Opening…' : label} icon={imageOnly ? 'image-outline' : 'document-outline'}
        onPress={open} disabled={action.busy} quiet />
      <Problem message={action.error} />
      {preview && (
        <Sheet title={label} onClose={() => setPreview(null)}>
          <Page>
            <Image accessibilityLabel={label} source={{ uri: preview.uri }} resizeMode="contain"
              style={{ width: '100%', minHeight: 280, aspectRatio: 1 }} />
          </Page>
        </Sheet>
      )}
    </View>
  );
}
