export function buildDocumentSearchQuery(tenantId: string, query: string) {
  return {
    bool: {
      filter: [{ term: { tenantId } }],
      must: [
        {
          multi_match: {
            query,
            fields: ["title^2", "content"],
            fuzziness: "AUTO",
          },
        },
      ],
    },
  };
}
