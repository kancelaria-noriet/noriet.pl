// Search-result meta for the migrated posts, layered over their front matter.
// src/_data/postMeta.json maps fileSlug -> { titleTag, description }.
// The h1 on the page stays as written; only the SERP snippet changes.
import meta from "../../_data/postMeta.json" with { type: "json" };

export default {
  eleventyComputed: {
    titleTag: (data) => meta[data.page.fileSlug]?.titleTag || data.titleTag,
    description: (data) => meta[data.page.fileSlug]?.description || data.description,
  },
};
