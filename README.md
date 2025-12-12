# Minha Banda - Studio AI

Uma estação de trabalho de áudio moderna que permite remover vocais, alterar tom (pitch), velocidade e analisar músicas utilizando Inteligência Artificial.

## 🚀 Configuração Obrigatória

Para utilizar as funcionalidades de IA (Análise de Música), você precisa configurar sua chave de API do Google Gemini.

1. Crie um arquivo chamado `.env.local` na raiz do projeto.
2. Adicione sua chave de API utilizando o nome de variável **`API_KEY`**:

```env
API_KEY=sua_chave_do_google_ai_studio_aqui
```

> ⚠️ **Atenção:** O sistema espera exatamente o nome `API_KEY`. Não utilize `GEMINI_API_KEY` ou outros nomes, pois o arquivo de configuração do Vite (`vite.config.ts`) está configurado para ler apenas `API_KEY`.

## 🛠️ Instalação e Execução

### Via Node.js

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Execute o projeto:
   ```bash
   npm run dev
   ```

3. Acesse `http://localhost:5173`

### Via Docker

1. Construa e inicie o container:
   ```bash
   docker-compose up --build
   ```

2. Acesse `http://localhost:8000`

## 🎛️ Funcionalidades

- **Remoção de Voz:** Algoritmo de cancelamento de fase (Bass-Preserving OOPS).
- **Pitch Shifter:** Altere o tom da música sem alterar a velocidade.
- **Speed Control:** Altere a velocidade da música mantendo o tom (Time Stretching).
- **Equalizador:** EQ de 3 bandas para ajuste fino de frequências.
- **Análise AI:** Identificação de gênero, instrumentos e vibe utilizando o modelo Gemini.
