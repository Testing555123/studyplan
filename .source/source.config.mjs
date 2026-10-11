// source.config.ts
import { z } from "zod";
import { defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
var { docs } = defineDocs({
  dir: "content/ebook",
  docs: {
    schema: frontmatterSchema.extend({
      title: z.string().optional(),
      description: z.string().optional()
    })
  }
});
export {
  docs
};
