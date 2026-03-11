/**
 * Automation rule constants
 * These thresholds can be adjusted as needed
 *
 * Soil moisture: Ecowitt sensors typically max out around 80% even after heavy rain.
 * Thresholds are scaled to this observed range (50%→40% wet, 30%→25% dry).
 */
export const RAIN_DELAY_THRESHOLD_INCHES = 0.5;
export const RAIN_DELAY_DURATION_HOURS = 48;
export const SOIL_MOISTURE_MAX_OBSERVED_PERCENT = 80; // Sensors rarely exceed this even when saturated
export const SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT = 60; // Wet: skip watering (60%+)
export const SOIL_MOISTURE_LOW_THRESHOLD_PERCENT = 35;  // Dry: boost watering (0-35%)
export const DRY_WATERING_DURATION_MINUTES = 10;
export const DRY_RAIN_THRESHOLD_INCHES = 0.1; // If rain < 0.1", consider it dry

// Zone name patterns to identify lawn zone
export const LAWN_ZONE_PATTERNS = ['lawn', 'grass', 'yard'];

