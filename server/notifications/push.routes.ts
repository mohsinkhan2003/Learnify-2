import { Router } from "express";
import { z } from "zod";
import { asyncHandler, parse } from "../lib/http";
import { badRequest } from "../lib/errors";
import { currentUser, requireAuth } from "../middleware/auth";
import { rateLimits } from "../middleware/rate-limit";
import { isAllowedPushEndpoint, removeSubscription, saveSubscription, vapidPublicKey } from "./push.service";

const router = Router();

// Public: the VAPID public key is not a secret. null means push is disabled on this server.
router.get("/public-key", (_req, res) => {
  res.json({ publicKey: vapidPublicKey() });
});

const endpoint = z.string().url().max(2048);
const subscriptionSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});

router.post(
  "/subscriptions",
  requireAuth,
  rateLimits.push,
  asyncHandler(async (req, res) => {
    const sub = parse(subscriptionSchema, req.body);
    if (!isAllowedPushEndpoint(sub.endpoint)) throw badRequest("Unsupported push service", undefined, "INVALID_PUSH_ENDPOINT");
    await saveSubscription(currentUser(req).id, { endpoint: sub.endpoint, ...sub.keys });
    res.status(201).json({ ok: true });
  }),
);

router.delete(
  "/subscriptions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint: ep } = parse(z.object({ endpoint }), req.body);
    await removeSubscription(currentUser(req).id, ep);
    res.status(204).end();
  }),
);

export default router;
