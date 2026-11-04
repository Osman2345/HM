const model = 'openai/gpt-oss-120b';
const placeholder = 'PASTE_YOUR_GROQ_KEY_HERE';

const getAIConfig = () => {
  const groqApiKey = process.env.GROQ_API_KEY || placeholder;
  return {
    groqApiKey,
    isConfigured: Boolean(groqApiKey && !groqApiKey.includes('PASTE_YOUR')),
    model,
  };
};

module.exports = { getAIConfig };
