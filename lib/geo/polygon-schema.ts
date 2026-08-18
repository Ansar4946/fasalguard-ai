import { z } from "zod";

const positionSchema = z.array(z.number()).min(2).max(3);
const ringSchema = z.array(positionSchema).min(4);

export const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(ringSchema).min(1),
});
