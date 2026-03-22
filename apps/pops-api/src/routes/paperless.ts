import express, { Router } from "express";
import { getEnv } from "../env.js";

const router: Router = express.Router();

router.get("/api/paperless/documents/:id/thumb", async (req, res) => {
  const paperlessUrl = getEnv("PAPERLESS_URL");
  const paperlessToken = getEnv("PAPERLESS_TOKEN");

  if (!paperlessUrl || !paperlessToken) {
    res.status(404).send("Paperless not configured");
    return;
  }

  try {
    const url = `${paperlessUrl.replace(/\/$/, "")}/api/documents/${req.params.id}/thumb/`;
    const response = await fetch(url, {
      headers: { Authorization: `Token ${paperlessToken}` },
    });

    if (!response.ok) {
      res.status(response.status).send(response.statusText);
      return;
    }

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      // Stream the response body
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch {
    res.status(500).send("Error fetching thumbnail");
  }
});

router.get("/api/paperless/documents/:id/download", async (req, res) => {
  const paperlessUrl = getEnv("PAPERLESS_URL");
  const paperlessToken = getEnv("PAPERLESS_TOKEN");

  if (!paperlessUrl || !paperlessToken) {
    res.status(404).send("Paperless not configured");
    return;
  }

  try {
    const url = `${paperlessUrl.replace(/\/$/, "")}/api/documents/${req.params.id}/download/`;
    const response = await fetch(url, {
      headers: { Authorization: `Token ${paperlessToken}` },
    });

    if (!response.ok) {
      res.status(response.status).send(response.statusText);
      return;
    }

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch {
    res.status(500).send("Error downloading document");
  }
});

export default router;
