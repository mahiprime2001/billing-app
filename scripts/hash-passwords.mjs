import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

const usersFilePath = path.join(process.cwd(), "app/data/json/users.json");

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

const hashPasswords = async () => {
  const users = readUsers();
  const saltRounds = 10;

  for (const user of users) {
    if (user.password && !user.password.startsWith("$2a$")) {
      const salt = await bcrypt.genSalt(saltRounds);
      user.password = await bcrypt.hash(user.password, salt);
      console.log(`Hashed password for user: ${user.email}`);
    }
  }

  writeUsers(users);
  console.log("All passwords have been hashed.");
};

hashPasswords();
