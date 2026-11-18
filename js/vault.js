/**
 * Kryptografischer Passwort-Generator & AES-GCM-Tresor (Web Crypto API)
 */
const VAULT_STORAGE_KEY = 'flowvault_encrypted_vault_v1';

export function generateSecurePassword(length = 16, opts = { upper: true, numbers: true, symbols: true }) {
  let charset = 'abcdefghijklmnopqrstuvwxyz';
  if (opts.upper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (opts.numbers) charset += '0123456789';
  if (opts.symbols) charset += '!@#$%^&*()-_=+[]{}?';

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
}

export class CryptoVault {
  constructor() {
    this.cryptoKey = null;
    this.salt = null;
    this.entries = [];
  }

  hasExistingVault() {
    return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
  }

  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      Array.of('deriveKey')
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      Array.of('encrypt', 'decrypt')
    );
  }

  bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  base64ToBuf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async unlock(masterPassword) {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      // Neuen Tresor anlegen
      this.salt = crypto.getRandomValues(new Uint8Array(16));
      this.cryptoKey = await this.deriveKey(masterPassword, this.salt);
      this.entries = Array.of({
        id: 'v_welcome',
        title: 'Beispiel-Notiz (Wiederherstellungs-Code)',
        secret: 'FV-9921-SAFE'
      });
      await this.save();
      return this.entries;
    }

    const parsed = JSON.parse(raw);
    this.salt = this.base64ToBuf(parsed.salt);
    const iv = this.base64ToBuf(parsed.iv);
    const ciphertext = this.base64ToBuf(parsed.data);

    const key = await this.deriveKey(masterPassword, this.salt);
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const jsonStr = new TextDecoder().decode(decrypted);
      this.entries = JSON.parse(jsonStr);
      this.cryptoKey = key;
      return this.entries;
    } catch {
      throw new Error('Falsches Master-Passwort!');
    }
  }

  async save() {
    if (!this.cryptoKey || !this.salt) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(this.entries));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      encoded
    );

    const payload = {
      salt: this.bufToBase64(this.salt),
      iv: this.bufToBase64(iv),
      data: this.bufToBase64(ciphertext)
    };
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));
  }

  async addEntry(title, secret) {
    if (!this.cryptoKey) return;
    this.entries.unshift({
      id: 'v_' + Date.now().toString(36),
      title: title.trim(),
      secret: secret.trim()
    });
    await this.save();
  }

  async deleteEntry(id) {
    if (!this.cryptoKey) return;
    this.entries = this.entries.filter((e) => e.id !== id);
    await this.save();
  }

  lock() {
    this.cryptoKey = null;
    this.entries = [];
  }
}
