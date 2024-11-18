import { customAlphabet } from "nanoid";

export const generateUserId = customAlphabet("1234567890", 16);
export const generateCronId = customAlphabet("1234567890", 16);

export const generateWorkspaceId = customAlphabet("1234567890", 16);

export const generateSessionId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  32
);
