const baseUrl = process.env.BENCH_URL ?? "http://localhost:3000";
const tenantId = process.env.BENCH_TENANT ?? "bench-tenant";
const searches = Number(process.env.BENCH_SEARCHES ?? 50);

function percentile(samples: number[], ratio: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantId,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }

  return response;
}

async function main(): Promise<void> {
  const created = await request("/documents", {
    method: "POST",
    body: JSON.stringify({
      title: "Distributed consensus notes",
      content: "Raft and Paxos keep a replicated log consistent across nodes.",
    }),
  });
  const document = (await created.json()) as { indexing?: string };
  console.log(`created document, indexing=${document.indexing ?? "unknown"}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const samples: number[] = [];

  for (let i = 0; i < searches; i += 1) {
    const started = performance.now();
    await request("/search?q=consensus");
    samples.push(performance.now() - started);
  }

  console.log(
    JSON.stringify(
      {
        searches,
        p50Ms: Math.round(percentile(samples, 0.5)),
        p95Ms: Math.round(percentile(samples, 0.95)),
        maxMs: Math.round(Math.max(...samples)),
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
