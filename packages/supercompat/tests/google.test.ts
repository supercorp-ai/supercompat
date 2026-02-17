import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { supercompat, googleClientAdapter } from "../src/index.ts";

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is required to run this test");
}

test("supercompat can list models via Google", async () => {
  const google = new GoogleGenAI({ apiKey });

  const client = supercompat({
    client: googleClientAdapter({ google }),
  });

  const models = [] as string[];
  const response = await client.models.list();
  for await (const model of response) {
    models.push(model.id);
  }

  assert.ok(models.length > 0, "Expected at least one model");

  // Assert that gemini-3-flash-preview is available
  const hasGemini3FlashPreview = models.some(id => id.includes('gemini-3-flash-preview'));
  assert.ok(hasGemini3FlashPreview, "Expected gemini-3-flash-preview to be in the models list");

  // Also verify that some Gemini models are present
  const geminiModels = models.filter(id => id.includes('gemini'));
  assert.ok(geminiModels.length > 0, "Expected at least one Gemini model");
});
