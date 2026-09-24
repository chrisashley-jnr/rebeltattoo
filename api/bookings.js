// The booking dashboard requires the Sites Worker, D1, and private R2 storage.
// Keep older Vercel deployments from accepting requests that cannot be saved.
export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  return response.status(503).json({
    error: "Booking is unavailable on this deployment. Deploy the Sites build to accept requests.",
  });
}
