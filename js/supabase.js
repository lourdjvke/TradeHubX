// Supabase Storage for KYC (project kmazcrnutcwvaapffhma)
import { db, ref, get } from './firebase.js';

const SUPABASE_URL = 'https://kmazcrnutcwvaapffhma.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_glo7Us9rft-6UeJJPizYTg_h1rCjGBY';
const KYC_BUCKET = 'kyc';

let cachedSecret = null;

async function storageKey() {
  if (cachedSecret) return cachedSecret;
  try {
    const ls = localStorage.getItem('sb_secret');
    if (ls) { cachedSecret = ls; return ls; }
  } catch {}
  try {
    const snap = await get(ref(db, 'config/sbSecret'));
    if (snap.exists() && snap.val()) {
      cachedSecret = String(snap.val());
      return cachedSecret;
    }
  } catch {}
  return SUPABASE_PUBLISHABLE;
}

export async function uploadKycFile(file, path) {
  const key = await storageKey();
  const url = `${SUPABASE_URL}/storage/v1/object/${KYC_BUCKET}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Upload failed (${res.status})`);
  }
  return getPublicUrl(path);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getPublicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${KYC_BUCKET}/${path}`;
}

export { SUPABASE_URL, KYC_BUCKET, SUPABASE_PUBLISHABLE };
