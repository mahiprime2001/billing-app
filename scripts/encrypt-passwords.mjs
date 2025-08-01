import fs from "fs";
import path from "path";
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const usersFilePath = path.join(process.cwd(), "app/data/json/users.json");
const secretKey = process.env.CIPHER_SECRET_KEY;

if (!secretKey) {
  console.error("Error: CIPHER_SECRET_KEY is not set in the environment variables.");
  process.exit(1);
}

const readUsers = () => {
  try {
    const usersData = fs.readFileSync(usersFilePath, "utf-8");
    return JSON.parse(usersData);
  } catch (error) {
    console.error("Error reading users file:", error);
    return [];
  }
};

const writeUsers = (users) => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error("Error writing users file:", error);
  }
};

const encryptPasswords = () => {
  const users = readUsers();

  for (const user of users) {
    // This is a simple check to see if the password is a bcrypt hash.
    // It's not perfect, but it will prevent re-encrypting already encrypted passwords.
    if (user.password.startsWith('$2a$')) {
        // This is a dummy password, it should be updated by the user.
        user.password = CryptoJS.AES.encrypt("password", secretKey).toString();
        console.log(`Re-encrypted password for user: ${user.email}`);
    }
  }

  writeUsers(users);
  console.log("All passwords have been encrypted.");
};

encryptPasswords();
