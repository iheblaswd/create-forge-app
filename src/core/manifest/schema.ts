import { z } from "zod";

export const SUPPORTED_SCHEMA = 1;

/** "groupId:artifactId" — exactly one colon, both parts non-empty. */
export const MAVEN_COORDINATES = /^[^:\s]+:[^:\s]+$/;

const nonEmptyString = z.string().min(1, "must be a non-empty string");

const optionSchema = z
  .object({
    files: z.array(nonEmptyString).default([]),
    maven: z
      .record(
        nonEmptyString,
        z.array(
          z
            .string()
            .regex(MAVEN_COORDINATES, 'expected the form "groupId:artifactId" (e.g. "io.jsonwebtoken:jjwt-api")'),
        ),
      )
      .default({}),
    env: z.array(nonEmptyString).default([]),
    requires: z.record(nonEmptyString, nonEmptyString).default({}),
  })
  .strict();

const moduleSchema = z
  .object({
    default: nonEmptyString,
    options: z.record(nonEmptyString, optionSchema),
  })
  .strict();

/**
 * Shape of forge.template.json, schema 1 (CLAUDE.md 4.4). The `schema` field is
 * checked separately so an unsupported version gets a dedicated message.
 */
export const manifestSchema = z
  .object({
    schema: z.literal(SUPPORTED_SCHEMA),
    name: nonEmptyString,
    app: z.object({ api: nonEmptyString, web: nonEmptyString, packageRoot: nonEmptyString }).strict(),
    env: z.object({ example: nonEmptyString, local: nonEmptyString }).strict(),
    exclude: z.array(nonEmptyString).default([]),
    conditional: z.array(nonEmptyString).default([]),
    modules: z.record(nonEmptyString, moduleSchema),
  })
  .strict();

export type ManifestOption = z.output<typeof optionSchema>;
export type ManifestModule = z.output<typeof moduleSchema>;
export type Manifest = z.output<typeof manifestSchema>;
