/**
 * Utility functions for handling store ID mapping between different formats
 */

/**
 * Converts a legacy store ID to the new format
 * @param legacyId - The legacy store ID (e.g., 'store_1')
 * @returns The standardized store ID (e.g., 'STR-1722255700000')
 */
export const toStandardStoreId = (legacyId: string): string => {
  // If it's already in the new format, return as is
  if (legacyId.startsWith('STR-')) {
    return legacyId;
  }
  
  // Map legacy IDs to new format
  const legacyMappings: Record<string, string> = {
    'store_1': 'STR-1722255700000',
    // Add more mappings as needed
  };
  
  return legacyMappings[legacyId] || legacyId;
};

/**
 * Gets the legacy store ID format
 * @param standardId - The standardized store ID (e.g., 'STR-1722255700000')
 * @returns The legacy store ID (e.g., 'store_1') or the original ID if no mapping exists
 */
export const toLegacyStoreId = (standardId: string): string => {
  // If it's already in legacy format, return as is
  if (standardId.startsWith('store_')) {
    return standardId;
  }
  
  // Map standard IDs to legacy format
  const standardMappings: Record<string, string> = {
    'STR-1722255700000': 'store_1',
    // Add more mappings as needed
  };
  
  return standardMappings[standardId] || standardId;
};

/**
 * Validates if a store ID is in the standard format
 * @param id - The store ID to validate
 * @returns boolean indicating if the ID is in the standard format
 */
export const isStandardStoreId = (id: string): boolean => {
  return /^STR-\d+$/.test(id);
};
