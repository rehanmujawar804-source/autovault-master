import type { Supplier } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
//  NORMALIZATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trims leading/trailing whitespace and collapses multiple internal spaces into a single space.
 */
export function normalizeSupplierName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Trims whitespace and collapses multiple internal spaces.
 */
export function normalizeContactPerson(contactPerson: string): string {
  if (!contactPerson) return "";
  return contactPerson.trim().replace(/\s+/g, " ");
}

/**
 * Normalizes Indian mobile number into canonical 10-digit format.
 * Strips +91, leading 0, 91 prefix (for 12 digits), spaces, hyphens, and parentheses.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Normalizes WhatsApp number into canonical 10-digit format.
 */
export function normalizeWhatsApp(whatsApp: string): string {
  return normalizePhone(whatsApp);
}

/**
 * Normalizes email address to lowercase and trimmed.
 */
export function normalizeEmail(email: string): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/**
 * Normalizes address by trimming and collapsing excessive whitespace.
 */
export function normalizeAddress(address: string): string {
  if (!address) return "";
  return address.trim().replace(/\s+/g, " ");
}

/**
 * Normalizes GSTIN to uppercase with spaces and hyphens removed.
 */
export function normalizeGST(gst: string): string {
  if (!gst) return "";
  return gst.trim().toUpperCase().replace(/[\s\-]/g, "");
}

/**
 * Normalizes notes by trimming leading/trailing whitespace.
 */
export function normalizeNotes(notes: string): string {
  if (!notes) return "";
  return notes.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  VALIDATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const INDIAN_PHONE_REGEX = /^[6-9][0-9]{9}$/;
export const INDIAN_GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const CONTACT_PERSON_REGEX = /^[a-zA-Z\s.'\-\u0900-\u097F]+$/;

export function validateSupplierName(
  name: string,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): string | null {
  const normalized = normalizeSupplierName(name);
  if (!normalized) {
    return "Supplier name is required.";
  }
  if (normalized.length < 2) {
    return "Supplier name must be at least 2 characters.";
  }
  if (normalized.length > 100) {
    return "Supplier name must not exceed 100 characters.";
  }
  // Reject names with no letters (e.g. only numbers "123456" or only punctuation like "!!!", "@@@")
  if (!/[a-zA-Z\u0900-\u097F]/.test(normalized)) {
    return "Supplier name must contain letters.";
  }

  // Duplicate check (case-insensitive & whitespace-normalized)
  const normLower = normalized.toLowerCase();
  const isDuplicate = existingSuppliers.some(
    (s) => s.id !== currentSupplierId && normalizeSupplierName(s.name).toLowerCase() === normLower
  );
  if (isDuplicate) {
    return "Supplier with this name already exists.";
  }

  return null;
}

export function validateContactPerson(contactPerson: string): string | null {
  const normalized = normalizeContactPerson(contactPerson);
  if (!normalized) return null; // optional

  if (normalized.length < 2) {
    return "Contact person must be at least 2 characters.";
  }
  if (normalized.length > 80) {
    return "Contact person must be 80 characters or less.";
  }
  // Reject names with no letters or invalid symbols (like numbers, @, !, #)
  if (!CONTACT_PERSON_REGEX.test(normalized) || !/[a-zA-Z\u0900-\u097F]/.test(normalized)) {
    return "Contact person name can only contain letters, spaces, hyphens, and periods.";
  }

  return null;
}

export function validatePhone(
  phone: string,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): string | null {
  if (!phone || !phone.trim()) return null; // optional if email is provided

  const canonical = normalizePhone(phone);
  // Check for dummy repeated digits e.g. 0000000000, 1111111111, 5555555555
  if (!INDIAN_PHONE_REGEX.test(canonical) || /^(\d)\1{9}$/.test(canonical)) {
    return "Enter a valid 10-digit Indian mobile number.";
  }

  // Duplicate phone check
  const isDuplicate = existingSuppliers.some(
    (s) => s.id !== currentSupplierId && s.phone && normalizePhone(s.phone) === canonical
  );
  if (isDuplicate) {
    return "Another supplier already uses this phone number.";
  }

  return null;
}

export function validateWhatsApp(
  whatsApp: string,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): string | null {
  if (!whatsApp || !whatsApp.trim()) return null; // optional

  const canonical = normalizeWhatsApp(whatsApp);
  if (!INDIAN_PHONE_REGEX.test(canonical) || /^(\d)\1{9}$/.test(canonical)) {
    return "Enter a valid 10-digit Indian WhatsApp number.";
  }

  // Duplicate WhatsApp check
  const isDuplicate = existingSuppliers.some(
    (s) => s.id !== currentSupplierId && s.whatsApp && normalizeWhatsApp(s.whatsApp) === canonical
  );
  if (isDuplicate) {
    return "Another supplier already uses this WhatsApp number.";
  }

  return null;
}

export function validateEmail(
  email: string,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null; // optional if phone is provided

  if (normalized.length > 150) {
    return "Email address must not exceed 150 characters.";
  }
  if (!EMAIL_REGEX.test(normalized)) {
    return "Enter a valid email address.";
  }

  // Duplicate email check
  const isDuplicate = existingSuppliers.some(
    (s) => s.id !== currentSupplierId && s.email && normalizeEmail(s.email) === normalized
  );
  if (isDuplicate) {
    return "Another supplier already uses this email address.";
  }

  return null;
}

export function validateAddress(address: string): string | null {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return "Supplier address is required.";
  }

  if (normalized.length > 300) {
    return "Address must be 300 characters or less.";
  }

  return null;
}

export function validateGST(
  gst: string,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): string | null {
  const normalized = normalizeGST(gst);
  if (!normalized) return null; // optional

  if (!INDIAN_GSTIN_REGEX.test(normalized)) {
    return "Enter a valid 15-character GSTIN.";
  }

  // Duplicate GST check
  const isDuplicate = existingSuppliers.some(
    (s) => s.id !== currentSupplierId && s.gst && normalizeGST(s.gst) === normalized
  );
  if (isDuplicate) {
    return "Another supplier already uses this GSTIN.";
  }

  return null;
}

export function validateNotes(notes: string): string | null {
  const normalized = normalizeNotes(notes);
  if (!normalized) return null; // optional

  if (normalized.length > 500) {
    return "Notes must be 500 characters or less.";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORM LEVEL VALIDATOR & NORMALIZER
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierFormRawData {
  name: string;
  contactPerson: string;
  phone: string;
  whatsApp: string;
  email: string;
  address: string;
  gst: string;
  status: "Active" | "Inactive";
  notes: string;
}

export interface SupplierFormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  normalizedData: {
    name: string;
    contactPerson: string;
    phone: string;
    whatsApp: string;
    email: string;
    address: string;
    gst: string;
    status: "Active" | "Inactive";
    notes: string;
  };
}

export function validateAndNormalizeSupplierForm(
  formData: SupplierFormRawData,
  existingSuppliers: Supplier[],
  currentSupplierId?: string
): SupplierFormValidationResult {
  const errors: Record<string, string> = {};

  const nameError = validateSupplierName(formData.name, existingSuppliers, currentSupplierId);
  if (nameError) errors.name = nameError;

  const contactError = validateContactPerson(formData.contactPerson);
  if (contactError) errors.contactPerson = contactError;

  // Conditional Contact Requirement: Phone OR Email must be provided
  const rawPhoneTrimmed = formData.phone ? formData.phone.trim() : "";
  const rawEmailTrimmed = formData.email ? formData.email.trim() : "";

  if (!rawPhoneTrimmed && !rawEmailTrimmed) {
    errors.contactMethod = "At least one contact method (Phone or Email) is required.";
  }

  const phoneError = validatePhone(formData.phone, existingSuppliers, currentSupplierId);
  if (phoneError) errors.phone = phoneError;

  const whatsAppError = validateWhatsApp(formData.whatsApp, existingSuppliers, currentSupplierId);
  if (whatsAppError) errors.whatsApp = whatsAppError;

  const emailError = validateEmail(formData.email, existingSuppliers, currentSupplierId);
  if (emailError) errors.email = emailError;

  const addressError = validateAddress(formData.address);
  if (addressError) errors.address = addressError;

  const gstError = validateGST(formData.gst, existingSuppliers, currentSupplierId);
  if (gstError) errors.gst = gstError;

  const notesError = validateNotes(formData.notes);
  if (notesError) errors.notes = notesError;

  const normalizedData = {
    name: normalizeSupplierName(formData.name),
    contactPerson: normalizeContactPerson(formData.contactPerson),
    phone: normalizePhone(formData.phone),
    whatsApp: normalizeWhatsApp(formData.whatsApp),
    email: normalizeEmail(formData.email),
    address: normalizeAddress(formData.address),
    gst: normalizeGST(formData.gst),
    status: formData.status,
    notes: normalizeNotes(formData.notes),
  };

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedData,
  };
}
