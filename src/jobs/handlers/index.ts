import { dispatchReadyOrder } from '@/jobs/handlers/dispatch-ready-order';
import { processRefund } from '@/jobs/handlers/process-refund';
import { sendOrderNotification } from '@/jobs/handlers/send-order-notification';
import { syncOrderDelayStatus } from '@/jobs/handlers/sync-order-delay-status';
import { type BackgroundJobHandler } from '@/jobs/worker';

export const backgroundJobHandlers = {
    dispatch_ready_order: dispatchReadyOrder,
    process_refund: processRefund,
    send_order_notification: sendOrderNotification,
    sync_order_delay_status: syncOrderDelayStatus,
} satisfies Record<string, BackgroundJobHandler>;
