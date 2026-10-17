import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'fotos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Neemt een foto met de camera en bewaart die blijvend in de app, zodat het bewijs
 * niet verdwijnt als het systeem de cache opruimt.
 */
export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Geen toegang tot de camera. Sta dit toe in de instellingen.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: true });
  if (result.canceled || result.assets.length === 0) return null;
  const source = new File(result.assets[0].uri);
  const target = new File(photoDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`);
  await source.copy(target);
  return target.uri;
}

export function deletePhotos(uris: string[]) {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('Foto verwijderen mislukt', uri, e);
    }
  }
}

export async function readPhotoBase64(uri: string): Promise<string | null> {
  try {
    return await new File(uri).base64();
  } catch {
    return null;
  }
}

export async function readPhotoBytes(uri: string): Promise<Uint8Array | null> {
  try {
    return await new File(uri).bytes();
  } catch {
    return null;
  }
}
