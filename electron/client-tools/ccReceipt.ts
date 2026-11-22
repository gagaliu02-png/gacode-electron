/**
 * T-108 · pc_cc_* 共用多层回执字段。
 * 与 gaclaw/src/llm/cc-receipt.js 同口径；端侧不自己生成 delivery_id（服务端 pending_id 是唯一身份）。
 */
export type CcReceiptStatus = 'delivered' | 'accepted' | 'queued' | 'visible' | 'turn_acked' | 'pending';

export interface CcReceipt {
  delivery_id: string;
  status: CcReceiptStatus;
  delivered: boolean;
  accepted: boolean;
  queued: boolean;
  visible: boolean;
  turn_acked: boolean;
  duplicate: boolean;
  error_code: string | null;
}

export interface CcEnvelope {
  __gacode_internal: true;
  v: 1;
  kind: string;
  delivery_id: string;
  origin: string;
  from_id: string;
  to_session: string;
  text: string;
  sent_at: string;
}

export function buildCcReceipt(opts: {
  deliveryId?: string | null;
  delivered?: boolean;
  accepted?: boolean;
  queued?: boolean;
  visible?: boolean;
  turnAcked?: boolean;
  duplicate?: boolean;
  errorCode?: string | null;
} = {}): CcReceipt {
  const delivered = !!opts.delivered;
  const accepted = !!opts.accepted;
  const queued = !!opts.queued;
  const visible = !!opts.visible;
  const turnAcked = !!opts.turnAcked;
  const status: CcReceiptStatus = turnAcked ? 'turn_acked' : visible ? 'visible' : queued ? 'queued' : accepted ? 'accepted' : delivered ? 'delivered' : 'pending';
  return {
    delivery_id: String(opts.deliveryId || ''),
    status,
    delivered,
    accepted,
    queued,
    visible,
    turn_acked: turnAcked,
    duplicate: !!opts.duplicate,
    error_code: opts.duplicate ? 'DUPLICATE' : (opts.errorCode || null),
  };
}

/** 从工具入参里取服务端下发的 delivery_id（pending_id），没有就不伪造。 */
export function deliveryIdFromArgs(args: Record<string, unknown> | null): string {
  if (!args) return '';
  const v = args.delivery_id ?? args.pending_id ?? args.task_id;
  return v == null ? '' : String(v).slice(0, 200);
}
