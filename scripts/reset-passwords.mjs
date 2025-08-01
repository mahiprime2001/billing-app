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
