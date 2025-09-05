import fs from "fs";
import path from "path";
import CryptoJS from 'crypto-js';
const usersFilePath = path.join(process.cwd(), "app/data/json/users.json");
const secretKey = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

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

const resetPasswords = () => {
  const users = readUsers();
  const defaultPassword = "password";

  for (const user of users) {
    user.password = CryptoJS.AES.encrypt(defaultPassword, secretKey).toString();
    console.log(`Reset password for user: ${user.email}`);
  }

  writeUsers(users);
  console.log("All passwords have been reset to the default password.");
};

resetPasswords();
