# DeepSeek API - Learnings from This Project

## Endpoint

```
POST https://api.deepseek.com/v1/chat/completions
Authorization: Bearer <DEEPSEEK_API_KEY>
```

## What Works

### 1. Basic Chat Completions

Standard OpenAI-compatible format. Works as expected.

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.3,
  "max_tokens": 8000
}
```

### 2. JSON Mode (`response_format`)

DeepSeek supports `{ "type": "json_object" }` which forces valid JSON output.
But it does NOT guarantee the JSON matches any specific schema.
The model decides its own field names and structure.

```json
{
  "response_format": { "type": "json_object" }
}
```

**Problem encountered**: the model returns valid JSON but uses inconsistent field names:
- `quantity` instead of `qty`
- `alternative` instead of `swap`
- Nests arrays as objects, etc.

### 3. Function/Tool Calling (what actually works for structured output)

This is the correct approach for getting schema-compliant JSON from DeepSeek.
You define a "tool" with a JSON Schema for its parameters.
The model returns a `tool_calls` array with arguments matching that schema.

```json
{
  "model": "deepseek-chat",
  "messages": [...],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "generate_meal_plan",
        "description": "Generate a structured meal plan",
        "parameters": {
          "type": "object",
          "properties": {
            "meals": { ... },
            "grocery": { ... }
          },
          "required": ["meals", "grocery"]
        }
      }
    }
  ],
  "temperature": 0.3,
  "max_tokens": 8000
}
```

**Response shape** (when tool calling succeeds):

```json
{
  "choices": [
    {
      "message": {
        "tool_calls": [
          {
            "id": "call_xxx",
            "type": "function",
            "function": {
              "name": "generate_meal_plan",
              "arguments": "{ \"meals\": [...], \"grocery\": [...] }"
            }
          }
        ]
      }
    }
  ]
}
```

The `arguments` field is a JSON string you need to `JSON.parse()`.

## What Does NOT Work

### 1. `json_schema` response format

DeepSeek does NOT support OpenAI's `response_format: { type: "json_schema", json_schema: {...} }`.
Sending this returns HTTP 400.

### 2. `tool_choice` forcing a specific function

Passing `"tool_choice": { "type": "function", "function": { "name": "..." } }` sometimes works but is unreliable.
Better to just pass `tools` without `tool_choice` - the model usually calls the tool anyway when the schema is clear.

### 3. `max_tokens: 3000` for complex output

A full Indian meal plan with 3 meals, grocery list, substitutions, budget, and todos easily exceeds 3000 tokens.
The response gets truncated mid-JSON, breaking the parse.
Use `max_tokens: 8000` for complex structured output.

## Gotchas & Workarounds

### Truncated JSON

Even with 8000 max_tokens, the model occasionally truncates.
Solution: JSON repair that closes unterminated strings and open braces.

```ts
// If JSON.parse fails, try:
// 1. Close any unterminated string (count quotes)
// 2. Close unclosed { and [ at the end
```

### Model Ignores Tool Schema Sometimes

On retry attempts the model might return content in `message.content` instead of `tool_calls`.
Always check both:

```ts
const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
const fallback = message?.content;
const raw = toolArgs || fallback;
```

### Field Name Drift

Even with tool calling, the model occasionally uses slightly different names:
- `instructions` instead of `steps`
- `amount` instead of `qty`

For critical apps, add a normalization layer.
For this project, making the zod schema lenient (`.optional().default([])`) was simpler.

### Temperature

- `0.3` gives consistent structured output
- Higher values increase creativity but also increase schema violations
- For tool calling, keep it low (0.2-0.4)

## Cost & Latency

- Model: `deepseek-chat` (DeepSeek V3)
- Input: ~500-1000 tokens (system prompt + user request + tool schema)
- Output: ~2000-5000 tokens (full meal plan)
- Latency: 15-40 seconds for a complete plan
- Cost: negligible for demo usage (pennies per request)

## Recommended Pattern for Structured Output

```ts
const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [{ type: "function", function: { name, description, parameters } }],
    temperature: 0.3,
    max_tokens: 8000,
  }),
});

const data = await response.json();
const args = data.choices[0].message.tool_calls?.[0]?.function?.arguments
  || data.choices[0].message.content;
const parsed = JSON.parse(args);
const validated = myZodSchema.parse(parsed);
```

## Summary

| Approach | Works? | Reliability |
|---|---|---|
| Plain chat + pray for JSON | No | Unpredictable format |
| `response_format: json_object` | Partial | Valid JSON, wrong fields |
| `response_format: json_schema` | No | HTTP 400 |
| Tool calling with JSON Schema | Yes | Best option for DeepSeek |
| Tool calling + JSON repair + lenient zod | Yes | Production-grade |
