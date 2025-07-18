import { GoogleGenerativeAI } from "@google/generative-ai";

window.isChatInputActive = false;

const promptInput = document.getElementById('prompt-input');
const sendButton = document.getElementById('send-button');
const responseContainer = document.getElementById('response-container');

if (promptInput && sendButton && responseContainer) {
  promptInput.addEventListener('focus', () => {
    window.isChatInputActive = true;
  });
  promptInput.addEventListener('blur', () => {
    window.isChatInputActive = false;
  });

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const setLoading = (isLoading) => {
    responseContainer.innerHTML = isLoading
      ? '<div class="loading-spinner"></div>'
      : '';
    sendButton.disabled = isLoading;
    sendButton.textContent = isLoading ? '...' : 'Send';
  };

  const displayError = (message) => {
    responseContainer.innerHTML = `<p class="error-message">${message}</p>`;
  };

  const displayResponse = (text) => {
    responseContainer.innerHTML = `<pre class="response-text"></pre>`;
    responseContainer.querySelector('.response-text').textContent = text;
  };

  const handleSend = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    setLoading(true);
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      displayResponse(text);
    } catch (error) {
      console.error('Gemini API error:', error);
      displayError('API failed, check termial');
    } finally {
      setLoading(false);
      promptInput.value = '';
    }
  };

  sendButton.addEventListener('click', handleSend);
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
} else {
  console.warn('Chat UI not found. Script disabled.');
}