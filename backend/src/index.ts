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
        const body = await request.json() as { vector: number[], topK?: number, threshold?: number };
        
        // ดึงให้เยอะที่สุดที่ Cloudflare Vectorize รองรับได้ต่อ 1 ครั้ง (ปกติ max คือ 100)
        const limit = body.topK || 100;
        const scoreThreshold = body.threshold || 0.7; // ค่าความเหมือนต่ำสุดที่รับได้ (0.7 คือคล้ายพอสมควร)
        
        // Search in Vectorize
        const result = await env.VECTORIZE_INDEX.query(body.vector, { 
          topK: limit, 
          returnMetadata: "all" 
        });
        
        // กรองเอาเฉพาะคนที่หน้าเหมือนจริงๆ (score > threshold)
        const validMatches = result.matches.filter(match => match.score >= scoreThreshold);
        
        return new Response(JSON.stringify({ matches: validMatches, totalFound: validMatches.length }), {
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
