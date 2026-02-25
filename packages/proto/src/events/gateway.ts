import { z } from 'zod';

export const GATEWAY_HELLO = 'GATEWAY_HELLO' as const;
export const GATEWAY_HEARTBEAT = 'GATEWAY_HEARTBEAT' as const;
export const GATEWAY_HEARTBEAT_ACK = 'GATEWAY_HEARTBEAT_ACK' as const;
export const GATEWAY_IDENTIFY = 'GATEWAY_IDENTIFY' as const;
export const GATEWAY_READY = 'GATEWAY_READY' as const;

export const GatewayHelloPayload = z.object({
  heartbeatIntervalMs: z.number(),
});

export const GatewayIdentifyPayload = z.object({
  token: z.string().min(1),
});

export const GatewayReadyServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

export const GatewayReadyPayload = z.object({
  sessionId: z.string(),
  userId: z.string(),
  servers: z.array(GatewayReadyServerSchema),
});

export type GatewayHello = z.infer<typeof GatewayHelloPayload>;
export type GatewayIdentify = z.infer<typeof GatewayIdentifyPayload>;
export type GatewayReady = z.infer<typeof GatewayReadyPayload>;
export type GatewayReadyServer = z.infer<typeof GatewayReadyServerSchema>;
