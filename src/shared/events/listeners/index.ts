/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerAuditListeners } from './AuditListener';
import { registerEmailListeners } from './EmailListener';
import { registerCalendarListeners } from './CalendarListener';
import { registerNotificationListeners } from './NotificationListener';
import { registerTimelineListeners } from './TimelineListener';
import { registerMetricsListeners } from './MetricsListener';

export function registerListeners(eventBus: any) {
  registerAuditListeners(eventBus);
  registerEmailListeners(eventBus);
  registerCalendarListeners(eventBus);
  registerNotificationListeners(eventBus);
  registerTimelineListeners(eventBus);
  registerMetricsListeners(eventBus);
}
