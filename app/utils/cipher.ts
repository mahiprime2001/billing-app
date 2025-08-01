import CryptoJS from 'crypto-js';

const secretKey = process.env.CIPHER_SECRET_KEY || 'default-secret-key';

if (process.env.NODE_ENV !== 'production' && secretKey === 'default-secret-key') {
  console.warn('Warning: Using default secret key for encryption. Please set CIPHER_SECRET_KEY in your environment variables.');
}

export const encrypt = (text: string) => {
  return CryptoJS.AES.encrypt(text, secretKey).toString();
};

export const decrypt = (ciphertext: string) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};
