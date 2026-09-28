/**
 * Expo-specific configuration. To reuse the app for a different expo, edit this file only.
 */
export const EXPO_CONFIG = {
  appName: 'Expo Notebook',
  expoName: 'Drone Expo',
  categories: [
    'Frames',
    'Motors',
    'ESCs',
    'Flight controllers',
    'Cameras & gimbals',
    'Batteries',
    'Props',
    'Radio & video links',
    'GPS & sensors',
    'Full drones',
    'Payloads',
    'Software',
    'Services',
    'Other',
  ],
  /** Words that make a card line likely to be the company name (in addition to generic legal suffixes). */
  companyKeywords: [
    'Robotics',
    'Aero',
    'Aerospace',
    'Aeronautics',
    'Aviation',
    'Drone',
    'Drones',
    'UAV',
    'UAS',
    'Avionics',
    'Dynamics',
  ],
  /** After this many un-backed-up changes the header nudges for a backup. */
  backupNudgeThreshold: 10,
} as const;

export type Category = (typeof EXPO_CONFIG.categories)[number];

export const CLAUDE_SCAN_MODEL = 'claude-sonnet-4-5';
