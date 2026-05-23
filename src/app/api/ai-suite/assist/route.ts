import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { message, code } = await request.json()

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured on the server.' },
        { status: 503 }
      )
    }

    const systemPrompt = `You are an expert trading script developer for EFI Script Studio — a Bloomberg-terminal-style scripting environment built for professional traders.

Scripts run in the browser via an async sandbox. Available APIs (injected globals):
  api.historical(symbol: string, days: number)  →  Promise<{t,o,h,l,c,v}[]>
  api.search(query: string)                     →  Promise<{ticker,name}[]>

Output helpers (injected globals):
  log(msg)       — print a line to the output console
  warn(msg)      — print a warning line
  table(data[])  — render an array of objects as a formatted table

Rules:
- No import statements — the sandbox only has the APIs above
- Use log(), warn(), table() for output — not console.log()
- All scripts must end with: return run();
- Scripts should be clean, professional, and well-commented
- Use string concatenation (+) for URLs and dynamic strings — not template literals
- Keep variable names clear and meaningful
- Handle errors with try/catch inside the loop, not around the entire run()

When generating code, wrap it in a \`\`\`javascript code block.
Be concise and direct. No filler text.`

    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: message + (code
            ? '\n\nCurrent script in the editor:\n```javascript\n' + code + '\n```'
            : ''),
        },
      ],
      max_tokens: 2000,
      temperature: 0.25,
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'OpenAI API error ' + res.status + ': ' + text },
        { status: 502 }
      )
    }

    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content ?? 'No response from model.'
    return NextResponse.json({ reply })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
