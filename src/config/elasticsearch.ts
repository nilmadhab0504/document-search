import { Client } from "@elastic/elasticsearch";

const elasticsearchUrl =
  process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";

export const elasticsearchClient = new Client({
  node: elasticsearchUrl,
});