import { twilioService } from './services/twilio';
import type { AutomationService } from './types';

export const SERVICES: Record<string, AutomationService> = { twilio: twilioService };
