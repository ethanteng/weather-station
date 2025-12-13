import { Router, Request, Response } from 'express';
import { evaluateRules } from '../automation/engine';
import {
  RAIN_DELAY_THRESHOLD_INCHES,
  RAIN_DELAY_DURATION_HOURS,
  SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT,
  SOIL_MOISTURE_LOW_THRESHOLD_PERCENT,
  DRY_WATERING_DURATION_MINUTES,
} from '../automation/constants';

const router = Router();

/**
 * GET /api/automations
 * Get list of automation rules (hardcoded for Phase 1)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Return hardcoded rules for Phase 1
    const rules = [
      {
        id: 'rainy_day_pause',
        name: 'Rainy Day Pause',
        enabled: true,
        description: `If rain_24h >= ${RAIN_DELAY_THRESHOLD_INCHES}" → set rain delay ${RAIN_DELAY_DURATION_HOURS}h`,
        conditions: {
          rain24h: { operator: '>=', value: RAIN_DELAY_THRESHOLD_INCHES },
        },
        actions: {
          type: 'set_rain_delay',
          hours: RAIN_DELAY_DURATION_HOURS,
        },
      },
      {
        id: 'too_wet_skip',
        name: 'Too Wet: Skip',
        enabled: true,
        description: `If soil_moisture >= ${SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT}% → set rain delay 24h`,
        conditions: {
          soilMoisture: { operator: '>=', value: SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT },
        },
        actions: {
          type: 'set_rain_delay',
          hours: 24,
        },
      },
      {
        id: 'too_dry_boost',
        name: 'Too Dry: Boost',
        enabled: true,
        description: `If soil_moisture <= ${SOIL_MOISTURE_LOW_THRESHOLD_PERCENT}% AND rain_24h < 0.1" → run lawn zone ${DRY_WATERING_DURATION_MINUTES} min`,
        conditions: {
          soilMoisture: { operator: '<=', value: SOIL_MOISTURE_LOW_THRESHOLD_PERCENT },
          rain24h: { operator: '<', value: 0.1 },
        },
        actions: {
          type: 'run_zone',
          minutes: DRY_WATERING_DURATION_MINUTES,
        },
      },
    ];

    res.json(rules);
  } catch (error) {
    console.error('Error fetching automations:', error);
    res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

/**
 * POST /api/automations/run
 * Manually trigger automation evaluation
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    await evaluateRules();
    res.json({ success: true, message: 'Automation rules evaluated' });
  } catch (error) {
    console.error('Error running automations:', error);
    res.status(500).json({ error: 'Failed to run automations' });
  }
});

export default router;

