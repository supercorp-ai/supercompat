import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import { supercompat, openaiClientAdapter } from "../src/index.ts";

const apiKey = process.env.TEST_OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("TEST_OPENAI_API_KEY is required to run this test");
}

test("supercompat can call OpenAI completions", async () => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
      : {}),
  });
  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
  });

  const result = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: "What is 2 + 2? Reply with just one number and nothing else.",
      },
    ],
  });

  const choices =
    "choices" in result ? result.choices : (result as any).data.choices;
  const message = choices[0]?.message?.content?.trim();
  assert.equal(message, "4");
});

test("supercompat can list models via OpenAI", async () => {
  const realOpenAI = new OpenAI({
    apiKey,
    ...(process.env.HTTPS_PROXY
      ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY as string) }
      : {}),
  });
  const client = supercompat({
    client: openaiClientAdapter({ openai: realOpenAI }),
  });

  const models = [] as string[];
  const response = await client.models.list();
  for await (const model of response) {
    models.push(model.id);
  }

  assert.ok(models.length > 0);
});
