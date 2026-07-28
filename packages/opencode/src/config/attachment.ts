export * as ConfigAttachment from "./attachment"

import { Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"
import { ConfigModelID } from "./model-id"

export const Image = Schema.Struct({
  auto_resize: Schema.optional(Schema.Boolean).annotate({
    description: "Resize images before sending them to the model when they exceed configured limits (default: true)",
  }),
  max_width: Schema.optional(PositiveInt).annotate({
    description: "Maximum image width before resizing or rejecting the attachment (default: 2000)",
  }),
  max_height: Schema.optional(PositiveInt).annotate({
    description: "Maximum image height before resizing or rejecting the attachment (default: 2000)",
  }),
  max_base64_bytes: Schema.optional(PositiveInt).annotate({
    description: "Maximum base64 payload bytes for an image attachment (default: 5242880)",
  }),
  vision_model: Schema.optional(ConfigModelID).annotate({
    description:
      "Fallback vision model (format provider/model) used to describe images when the active model does not support image input",
  }),
  cache: Schema.optional(Schema.Boolean).annotate({
    description: "Cache vision fallback analysis results by image content hash (default: true)",
  }),
}).annotate({ identifier: "ImageAttachmentConfig" })
export type Image = Schema.Schema.Type<typeof Image>

export const Info = Schema.Struct({
  image: Schema.optional(Image).annotate({ description: "Image attachment configuration" }),
}).annotate({ identifier: "AttachmentConfig" })
export type Info = Schema.Schema.Type<typeof Info>
