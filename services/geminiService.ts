import { GoogleGenAI } from "@google/genai";

// Helper to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeAudio = async (audioFile: File): Promise<string> => {
  try {
    // Access the API key directly so Vite can replace it with the string literal from .env
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // We trim the file to the first 2MB to ensure quick analysis and avoid timeouts/limits for the demo
    // In a real production app we might handle this differently.
    const slice = audioFile.slice(0, 2 * 1024 * 1024); 
    const base64Data = await blobToBase64(slice);

    const model = "gemini-2.5-flash";
    
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioFile.type || 'audio/mp3',
              data: base64Data
            }
          },
          {
            text: `Aja como um produtor musical experiente da "Minha Banda". Analise este trecho de áudio. 
            Forneça uma análise curta e criativa em Português contendo:
            1. Gênero estimado.
            2. Vibe/Sentimento.
            3. Instrumentos detectados.
            4. Uma sugestão criativa para um nome de banda que tocaria essa música.
            Seja visualmente agradável na formatação (use bullet points).`
          }
        ]
      }
    });

    return response.text || "Não foi possível gerar a análise.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Ocorreu um erro ao conectar com a IA do Minha Banda.";
  }
};