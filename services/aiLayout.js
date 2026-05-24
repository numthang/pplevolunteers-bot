// services/aiLayout.js
// AI-powered image layout analysis — provider-agnostic
// Supported providers: claude (default), gemini (future)

const LAYOUT_PROMPT = `Analyze this image to determine the best placement for a quote text overlay.
Return ONLY valid JSON, no markdown, no explanation:
{
  "quotePosition": "top-left|top-right|center-left|center-right|bottom-left|bottom-right",
  "namePosition": "bottom-left|bottom-right|bottom-center",
  "textColor": "#FFFFFF or #000000",
  "accentColor": "#FFFFFF or #000000 or #ff6a13",
  "applyBW": true or false,
  "reasoning": "one sentence"
}

Rules:
- quotePosition: find the area that is GENUINELY empty — uniform color, plain wall, sky, floor, or out-of-focus background. STRICTLY AVOID: any area containing a person, face, or body — even partially. Also avoid: text, slides, screens, logos, busy patterns
- Scan all 6 zones. Rank them by: (1) no people at all, (2) uniform/plain background, (3) low visual complexity. Pick the highest-ranked zone
- If the image has a person on the left, choose a right-side zone. If person is centered, choose top or bottom corner with no person
- textColor: must contrast with background at chosen position (#FFFFFF on dark, #000000 on light)
- accentColor: #ff6a13 if there's orange/warm color in image, else match textColor
- applyBW: true only if the image has very strong/clashing colors that hurt readability — default false
- namePosition: bottom corner opposite from the main subject`;

const PROVIDERS = {
  claude: async (imageBase64, mimeType) => {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: LAYOUT_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: imageBase64 },
            },
            { type: 'text', text: 'Analyze this image for quote overlay placement.' },
          ],
        },
      ],
    });

    const raw  = response.content.find(b => b.type === 'text')?.text || '{}';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(text);
  },

  gemini: async (imageBase64, mimeType) => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model  = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      { text: LAYOUT_PROMPT },
      { inlineData: { mimeType, data: imageBase64 } },
      { text: 'Analyze this image for quote overlay placement.' },
    ]);

    const raw  = result.response.text();
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(text);
  },
};

/**
 * Analyze image and return recommended layout for quote overlay
 * @param {Buffer} imageBuffer
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @param {string} provider - 'claude' (default)
 * @returns {{ quotePosition, namePosition, textColor, accentColor, applyBW, reasoning }}
 */
async function analyzeLayout(imageBuffer, mimeType, provider = 'gemini') {
  const fn = PROVIDERS[provider];
  if (!fn) throw new Error(`Unknown AI provider: ${provider}`);

  const base64 = imageBuffer.toString('base64');

  try {
    const result = await fn(base64, mimeType);
    // Validate & fallback defaults
    return {
      quotePosition: result.quotePosition || 'center-left',
      namePosition:  result.namePosition  || 'bottom-left',
      textColor:     result.textColor     || '#FFFFFF',
      accentColor:   result.accentColor   || '#FFFFFF',
      applyBW:       result.applyBW       ?? false,
      reasoning:     result.reasoning     || '',
    };
  } catch (err) {
    console.error('[aiLayout] parse error, using defaults:', err.message);
    return {
      quotePosition: 'center-left',
      namePosition:  'bottom-left',
      textColor:     '#FFFFFF',
      accentColor:   '#ff6a13',
      applyBW:       false,
      reasoning:     'fallback defaults',
    };
  }
}

module.exports = { analyzeLayout };
