import express from "express";

const app = express();

// Accept JSON + raw text
app.use(express.json({ limit: "10mb" }));
app.use(express.text({ type: "*/*", limit: "10mb" }));

app.post("/webhook", (req, res) => {
  console.log("---- WEBHOOK HIT ----");
  console.log("Headers:", req.headers);

  // If JSON came in
  if (typeof req.body === "object") {
    console.log("Body (JSON):", JSON.stringify(req.body, null, 2));
  } else {
    console.log("Body (RAW):", req.body);
  }

  res.status(200).send("ok");
});

app.get("/", (req, res) => {
  res.send("Webhook server running");
});

app.listen(3000, () => {
  console.log("Webhook listening on http://localhost:3000/webhook");
});
