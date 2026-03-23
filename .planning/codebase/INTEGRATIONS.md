# INTEGRATIONS.md

## External Services & APIs

### LLM Providers
The application supports a multi-provider LLM gateway with the following integrations:
- **Anthropic**: Uses `@anthropic-ai/sdk` for Claude models.
- **OpenAI**: Uses the `openai` SDK for GPT models.
- **Google Gemini**: Integrated via the OpenAI-compatible base URL.
- **Google Vertex AI**: Custom implementation using `fetch` and Google Cloud Application Default Credentials (ADC).

### Database
- **SQLite**: Local persistence using `better-sqlite3`.
- **Drizzle ORM**: Used for schema definition, migrations, and type-safe querying.
- **Storage Location**: The database file is stored locally at `~/.idealworld/idealworld.db`.

### Environment & Configuration
- **Local Config**: Settings, API keys, and provider preferences are managed in `~/.idealworld/config.json`.
- **Authentication**: Vertex AI requires `gcloud` CLI authentication for ADC.

### Real-time Updates
- **Server-Sent Events (SSE)**: Used for streaming simulation updates and telemetry from the server to the web frontend.
