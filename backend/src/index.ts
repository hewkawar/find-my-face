export interface Env {
  VECTORIZE_INDEX: VectorizeIndex;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);

    // Search endpoint
    if (url.pathname === "/search" && request.method === "POST") {
      try {
        const body = await request.json() as { vector: number[] };
        
        // Search in Vectorize
        const matches = await env.VECTORIZE_INDEX.query(body.vector, { topK: 5 });
        
        return new Response(JSON.stringify(matches), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // Index endpoint (Upload new face vector)
    if (url.pathname === "/index" && request.method === "POST") {
      try {
        const body = await request.json() as { id: string, vector: number[], metadata: any };
        
        // Insert into Vectorize
        await env.VECTORIZE_INDEX.insert([
          {
            id: body.id,
            values: body.vector,
            metadata: body.metadata,
          }
        ]);
        
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return new Response("Face Recognition API", { 
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  },
};
