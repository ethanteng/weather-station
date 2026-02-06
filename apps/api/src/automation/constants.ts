/**
 * Automation rule constants
 * These thresholds can be adjusted as needed
 */

export const RAIN_DELAY_THRESHOLD_INCHES = 0.5;
export const RAIN_DELAY_DURATION_HOURS = 48;
export const SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT = 50;
export const SOIL_MOISTURE_LOW_THRESHOLD_PERCENT = 30;
export const DRY_WATERING_DURATION_MINUTES = 10;
export const DRY_RAIN_THRESHOLD_INCHES = 0.1; // If rain < 0.1", consider it dry

// Zone name patterns to identify lawn zone
export const LAWN_ZONE_PATTERNS = ['lawn', 'grass', 'yard'];

