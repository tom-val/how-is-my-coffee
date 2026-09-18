import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { api } from './api';

/**
 * The photo pipeline: pick → downscale → presigned PUT → `photoKey`.
 *
 * Downscaling happens on the device, before anything crosses the network. A modern phone photo is
 * 3–8 MB; at 1280 px on the long edge and JPEG q0.8 it is a couple of hundred KB, which keeps the
 * upload quick on mobile data and the S3 bill small. Re-encoding as JPEG also strips EXIF — the
 * old web client did the same, deliberately: a coffee photo should not carry GPS metadata beyond
 * the coordinates the user chose to attach.
 */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * Open the system photo library and return a downscaled JPEG, or null if the user backed out or
 * denied access. Permission is requested by the picker itself on first use.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1, // we re-encode below; letting the picker compress first would only lose detail twice
    exif: false,
  });
  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  return downscale(asset.uri, asset.width, asset.height);
}

/** Take a photo with the camera. Same output as `pickPhoto`. */
export async function capturePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  return downscale(asset.uri, asset.width, asset.height);
}

/** Fit the image inside `MAX_DIMENSION` on its longest side and re-encode as JPEG. */
async function downscale(uri: string, width: number, height: number): Promise<PickedPhoto> {
  const longest = Math.max(width, height);
  const context = ImageManipulator.manipulate(uri);
  if (longest > MAX_DIMENSION) {
    // Constrain the long edge and let the library derive the other one, so the ratio is preserved.
    if (width >= height) context.resize({ width: MAX_DIMENSION });
    else context.resize({ height: MAX_DIMENSION });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Upload a picked photo and return its S3 key, which the caller sends as `photoKey`.
 *
 * Reading the local file back as a Blob (rather than base64) keeps the PUT a plain binary body on
 * every platform: on native `fetch` resolves `file://` through XMLHttpRequest, on web the picker
 * already hands back a blob URL.
 */
export async function uploadPhoto(photo: PickedPhoto): Promise<string> {
  const fileName = `coffee-${Date.now()}.jpg`;
  const contentType = 'image/jpeg';

  const target = await api.uploadUrl({ fileName, contentType });

  const blob = await (await fetch(photo.uri)).blob();
  const res = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);

  return target.key;
}
