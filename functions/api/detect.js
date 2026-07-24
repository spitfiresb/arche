// Cloudflare Pages Function: POST /api/detect
//
// This is the ONLY server-side piece of the FloorSense demo. It exists solely
// to hold the Roboflow API key so it never ships to the browser. It receives an
// uploaded floor-plan image, forwards it to the trained Roboflow detection
// model, and returns the raw predictions. Direct port of the old Next.js route
// (app/api/detect/route.ts) onto Cloudflare's edge runtime.
//
// Required environment variable (set in the Cloudflare Pages dashboard, or in a
// local .dev.vars file, NEVER commit it):
//   ROBOFLOW_API_KEY = <your Roboflow private API key>

const MODEL_ID = "floorplans-r7e9l-vjwg9";
const VERSION = "2";
const CONFIDENCE = 40; // 0.40 confidence threshold, expressed 0-100

// Uploads above this are refused before the body is read into memory.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function onRequestPost({ request, env }) {
  try {
    // Only the site's own pages call this; a cross-site Origin means someone
    // is scripting the endpoint from elsewhere to spend the Roboflow quota.
    const origin = request.headers.get("Origin");
    if (origin && new URL(origin).hostname !== new URL(request.url).hostname) {
      return json({ error: "Forbidden" }, 403);
    }

    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > MAX_BYTES) {
      return json({ error: "File too large (8 MB max)" }, 413);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return json({ error: "No file provided" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: "File too large (8 MB max)" }, 413);
    }

    const apiKey = env.ROBOFLOW_API_KEY;
    if (!apiKey) {
      return json(
        { error: "Configuration Error: ROBOFLOW_API_KEY is missing" },
        500
      );
    }

    // Roboflow's detect endpoint wants a base64 body with a form-urlencoded
    // content type.
    const buffer = await file.arrayBuffer();
    const base64Image = arrayBufferToBase64(buffer);

    const response = await fetch(
      `https://detect.roboflow.com/${MODEL_ID}/${VERSION}?api_key=${apiKey}&confidence=${CONFIDENCE}`,
      {
        method: "POST",
        body: base64Image,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Roboflow Error:", errorText);

      if (response.status === 401) {
        return json(
          { error: "Invalid API Key. Please check ROBOFLOW_API_KEY." },
          401
        );
      }
      if (response.status === 403) {
        return json({ error: "Access Denied. Check your plan limits." }, 403);
      }
      return json({ error: "Roboflow API Failed", details: errorText }, 500);
    }

    const data = await response.json();
    return json(data, 200);
  } catch (error) {
    console.error("API Error:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
}

// Convert an ArrayBuffer to base64 without pulling in Node's Buffer (which
// isn't available on the Workers runtime by default).
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk)
    );
  }
  return btoa(binary);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
