import { z } from 'zod';

export const AwsLambdaLayerFilterMetadata = z.object({
  arn: z.string(),
  runtime: z.string().optional(),
  architecture: z.string().optional(),
});