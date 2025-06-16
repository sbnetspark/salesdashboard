// src/utils/getUserRole.js

/**
 * NetSpark - User Role Utility
 * ------------------------------------------------
 * Returns role for a given email:
 *   - "executive": Executive-level access
 *   - "manager": Management-level access
 *   - "seller": All other @netsparktelecom.com users
 *   - "none": Not authorized (external or unrecognized)
 *
 * To update, edit the email lists below.
 */

export const ROLES = Object.freeze({
  EXECUTIVE: "executive",
  MANAGER: "manager",
  SELLER: "seller",
  NONE: "none",
});

// ---- Executive and Manager Email Lists ----
// To update access, just add/remove emails below:
const EXECUTIVE_EMAILS = [
  "sam.bonomo@netsparktelecom.com",
  "micah.cooksey@netsparktelecom.com",
  "scott.mitchell@netsparktelecom.com",
  "dustin.frank@netsparktelecom.com",
  "chris.carn@netsparktelecom.com",
];

const MANAGER_EMAILS = [
  "jesse.doyle@netsparktelecom.com",
  "adam.meyer@netsparktelecom.com",
  "dan.healy@netsparktelecom.com",
];

// ---- Core Role Utility ----
/**
 * Returns the user role string.
 * @param {string} email - User email address
 * @returns {string} One of "executive", "manager", "seller", "none"
 */
export function getUserRole(email) {
  if (!email || typeof email !== "string") return ROLES.NONE;
  const normalized = email.trim().toLowerCase();

  if (EXECUTIVE_EMAILS.includes(normalized)) return ROLES.EXECUTIVE;
  if (MANAGER_EMAILS.includes(normalized)) return ROLES.MANAGER;
  // All other @netsparktelecom.com are "seller"
  if (normalized.endsWith("@netsparktelecom.com")) return ROLES.SELLER;
  return ROLES.NONE;
}

// ---- Helper (optional, not used, but for future expandability) ----
/**
 * Returns true if a user is at least manager or exec.
 * @param {string} email
 */
export function isManagerOrHigher(email) {
  const role = getUserRole(email);
  return role === ROLES.MANAGER || role === ROLES.EXECUTIVE;
}
