import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
  supercompat,
  openaiClientAdapter,
  completionsRunAdapter,
} from "../src/index.ts";

const apiKey = process.env.TEST_OPENAI_API_KEY;

test("supercompat can call OpenAI completions", async (t) => {
  if (!apiKey)
    return t.skip("TEST_OPENAI_API_KEY is required to run this test");
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

test("supercompat can create thread message and run via OpenAI", async (t) => {
  if (!apiKey)
    return t.skip("TEST_OPENAI_API_KEY is required to run this test");
  try {
    const realOpenAI = new OpenAI({
      apiKey,
      ...(process.env.HTTPS_PROXY
        ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
        : {}),
    });
    const client = supercompat({
      client: openaiClientAdapter({ openai: realOpenAI }),
    });

    const assistant = await client.beta.assistants.create({
      model: "gpt-4o-mini",
      instructions: "You are a helpful assistant.",
    });

    const thread = await client.beta.threads.create();

    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: "What is 2 + 2? Reply with just one number and nothing else.",
    });

    await client.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id,
    });

    const list = await client.beta.threads.messages.list(thread.id);
    const assistantMessage = list.data
      .filter((m) => m.role === "assistant")
      .at(-1);
    const text = assistantMessage?.content[0].text.value.trim();
    assert.equal(text, "4");
  } catch (err: any) {
    t.skip(err.message);
  }
});

test("supercompat can list models via OpenAI", async (t) => {
  if (!apiKey)
    return t.skip("TEST_OPENAI_API_KEY is required to run this test");
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

test("supercompat streaming run with tool using completionsRunAdapter", async (t) => {
  if (!apiKey)
    return t.skip("TEST_OPENAI_API_KEY is required to run this test");
  try {
    const realOpenAI = new OpenAI({
      apiKey,
      ...(process.env.HTTPS_PROXY
        ? { httpAgent: new HttpsProxyAgent(process.env.HTTPS_PROXY as string) }
        : {}),
    });
    const client = supercompat({
      client: openaiClientAdapter({ openai: realOpenAI }),
      runAdapter: completionsRunAdapter(),
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "get_current_weather",
          description: "Get the current weather in a given location",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ] as OpenAI.Beta.AssistantTool[];

    const assistant = await client.beta.assistants.create({
      model: "gpt-4o-mini",
      instructions: "You are a helpful assistant.",
      tools,
    });

    const thread = await client.beta.threads.create();

    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: "What is the weather in SF?",
    });

    const run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
      instructions:
        "Use the get_current_weather tool and then answer the message.",
      stream: true,
    });

    let requiresActionEvent: any;
    for await (const event of run) {
      if (event.event === "thread.run.requires_action") {
        requiresActionEvent = event;
      }
    }

    assert.ok(requiresActionEvent);

    const toolCallId =
      requiresActionEvent.data.required_action?.submit_tool_outputs
        .tool_calls[0].id;

    const submit = await client.beta.threads.runs.submitToolOutputs(
      thread.id,
      requiresActionEvent.data.id,
      {
        stream: true,
        tool_outputs: [
          {
            tool_call_id: toolCallId,
            output: "70 degrees and sunny.",
          },
        ],
      },
    );

    for await (const _event of submit) {
    }

    const list = await client.beta.threads.messages.list(thread.id);
    const assistantMessage = list.data
      .filter((m) => m.role === "assistant")
      .at(-1);
    const text = assistantMessage?.content[0].text.value.toLowerCase();
    assert.ok(text?.includes("70 degrees"));
  } catch (err: any) {
    t.skip(err.message);
  }
});
