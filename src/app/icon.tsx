import { ImageResponse } from "next/og";

/** App icons for "Add to Home screen" (the manifest points at /icon/192 and /icon/512). */
export function generateImageMetadata() {
  return [192, 512].map((n) => ({ id: String(n), contentType: "image/png", size: { width: n, height: n } }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const n = Number(await id);
  const u = n / 100;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 40%, #ffb238, #f5462c 55%, #b3121c)",
        }}
      >
        <div
          style={{
            width: 52 * u,
            height: 74 * u,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8 * u,
            border: `${4 * u}px solid #fffdf8`,
            background: "linear-gradient(135deg, #4b95ff, #1f64dc 55%, #1546a8)",
            transform: "rotate(-12deg)",
            boxShadow: `0 ${3 * u}px ${6 * u}px rgba(60,0,10,0.45)`,
          }}
        >
          <div style={{ display: "flex", fontSize: 50 * u, fontWeight: 900, color: "#ffd84a", WebkitTextStroke: `${2.4 * u}px #14213d` }}>N</div>
        </div>
      </div>
    ),
    { width: n, height: n },
  );
}
