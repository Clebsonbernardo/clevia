import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Você é a Assistente IA da CLEVIA, um sistema de gestão de manutenção industrial (CMMS) para fábricas brasileiras. Você é especialista em manutenção industrial, mecânica, elétrica, pneumática, hidráulica e NR-12/ISO 55001.

Suas capacidades:
- Diagnosticar problemas de máquinas industriais (vazamentos, ruídos, vibração, superaquecimento, falhas elétricas, etc.)
- Explicar procedimentos de manutenção (preventiva, corretiva, preditiva)
- Orientar sobre uso do sistema CLEVIA (criar OS, preventivas, ver indicadores, finalizar OS, gerenciar estoque)
- Recomendar boas práticas de segurança (EPI, LOTO, NR-12)
- Sugerir peças e insumos para manutenção

Diretrizes de resposta:
- Responda SEMPRE em português brasileiro, de forma clara e profissional
- Seja específico e prático — o usuário é um mecânico ou gestor de manutenção
- Para problemas técnicos: liste possíveis causas, passos de diagnóstico e avisos de segurança
- Para perguntas sobre o sistema: explique passo a passo como usar a funcionalidade
- Se não souber algo específico sobre a máquina, diga e sugira consultar o manual do fabricante
- Mantenha respostas concisas mas completas — use listas quando apropriado
- Nunca invente especificações técnicas — se não souber, diga que precisa do manual

Você está integrada ao sistema CLEVIA. O usuário pode estar em qualquer tela do app. Adapte sua resposta ao contexto fornecido (máquina selecionada, setor, etc.).`;

async function callOpenAI(messages: ChatMessage[], model: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("OpenAI API error:", response.status, errText);
    throw new Error(`Erro na API de IA (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Não foi possível gerar uma resposta.";
}

async function searchWeb(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const ddgResponse = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "CLEVIA/1.0" } },
    );
    if (ddgResponse.ok) {
      const ddgData = await ddgResponse.json();
      if (ddgData.AbstractText) {
        results.push({
          title: ddgData.Heading || query,
          url: ddgData.AbstractURL || "",
          snippet: ddgData.AbstractText,
          source_type: "article",
        });
      }
      if (ddgData.RelatedTopics && Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics.slice(0, 4)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 80),
              url: topic.FirstURL,
              snippet: topic.Text,
              source_type: "article",
            });
          }
        }
      }
    }
  } catch { /* DuckDuckGo may fail */ }

  try {
    const ytResponse = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " manutenção tutorial")}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } },
    );
    if (ytResponse.ok) {
      const ytHtml = await ytResponse.text();
      const videoMatches = [...ytHtml.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
      const titleMatches = [...ytHtml.matchAll(/"title":{"runs":\[{"text":"([^"]+)"/g)];
      const seen = new Set<string>();
      for (let i = 0; i < Math.min(videoMatches.length, 4); i++) {
        const videoId = videoMatches[i][1];
        if (seen.has(videoId)) continue;
        seen.add(videoId);
        const title = titleMatches[i]?.[1] || "Vídeo de manutenção";
        results.push({
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          snippet: `Vídeo no YouTube: ${title}`,
          source_type: "video",
        });
      }
    }
  } catch { /* YouTube scraping may fail */ }

  return results.slice(0, 6);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode = body.mode ?? "search";

    // Build context from machine info
    const machineContext = [
      body.machine_name && `Máquina: ${body.machine_name}`,
      body.machine_model && `Código: ${body.machine_model}`,
      body.machine_manufacturer && `Setor: ${body.machine_manufacturer}`,
    ].filter(Boolean).join(" | ");

    if (mode === "chat") {
      const { message, history } = body;
      if (!message || typeof message !== "string") {
        return new Response(
          JSON.stringify({ error: "message is required for chat" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT + (machineContext ? `\n\nContexto atual: ${machineContext}` : "") },
      ];

      // Include conversation history for context
      if (history && Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          if (h.role === "user" || h.role === "assistant") {
            messages.push({ role: h.role, content: h.content });
          }
        }
      }

      messages.push({ role: "user", content: message });

      const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
      const reply = await callOpenAI(messages, model);

      // Also fetch web results for relevant technical queries
      let searchResults: SearchResult[] = [];
      if (message.length > 10) {
        const searchQuery = [message, body.machine_name].filter(Boolean).join(" ");
        searchResults = await searchWeb(searchQuery);
      }

      // Generate contextual suggestions based on the query
      const suggestions = generateSuggestions(message);

      const chatResult = {
        reply,
        suggestions,
        search_results: searchResults,
      };

      return new Response(
        JSON.stringify(chatResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===== SEARCH MODE (default) =====
    const { query } = body;
    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contextStr = [query, body.machine_name, body.machine_model].filter(Boolean).join(" ");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT + (machineContext ? `\n\nContexto atual: ${machineContext}` : ""),
      },
      {
        role: "user",
        content: `Pesquisa do usuário: "${query}"\n\nForneça um resumo útil e prático sobre este tema para um profissional de manutenção industrial. Inclua dicas de procedimento e segurança quando relevante. Responda em português.`,
      },
    ];

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
    const answer = await callOpenAI(messages, model);

    const results = await searchWeb(contextStr);

    const knowledgeResult = {
      query,
      answer,
      results,
    };

    return new Response(
      JSON.stringify(knowledgeResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ai-assistant failed", err);
    const errMsg = (err as Error).message;
    const isConfigError = errMsg.includes("OPENAI_API_KEY");
    return new Response(
      JSON.stringify({
        error: isConfigError
          ? "A IA ainda não foi ativada. Peça ao administrador para configurar a chave da API OpenAI."
          : "Não foi possível concluir a consulta. Tente novamente.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function generateSuggestions(message: string): string[] {
  const lower = message.toLowerCase();
  if (lower.includes("vaz") || lower.includes("leak")) {
    return ["Como abrir uma OS para esse problema?", "Quais peças posso precisar?", "Ver procedimento de segurança LOTO"];
  }
  if (lower.includes("ruíd") || lower.includes("barulh") || lower.includes("noise")) {
    return ["Pode ser rolamento?", "Como medir vibração?", "Como abrir uma OS?"];
  }
  if (lower.includes("quente") || lower.includes("superaquec") || lower.includes("thermal")) {
    return ["Verificar sistema de refrigeração?", "Como inspecionar rolamentos?", "Abrir OS urgente?"];
  }
  if (lower.includes("os") || lower.includes("ordem") || lower.includes("serviço")) {
    return ["Como ver minhas OS?", "Como finalizar uma OS?", "Como adicionar observações?"];
  }
  if (lower.includes("prevent") || lower.includes("preventiva")) {
    return ["Como criar plano preventivo?", "Quando fazer a próxima?", "Ver preventivas vencendo"];
  }
  return ["Como abrir uma OS?", "Como ver indicadores?", "Falar com especialista técnico"];
}
