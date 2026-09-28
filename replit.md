# Learnify (Replit notes)

This project started as a Replit demo and has since been restructured for production.
The authoritative documentation is in the repository:

- `README.md` — setup, commands, configuration
- `docs/ARCHITECTURE.md` — system design, data model, analytics definitions, design system
- `docs/AI_TUTOR.md` — tutor state machine, prompts, safety, cost controls
- `docs/SECURITY.md` — auth, authorization, privacy, student safety
- `docs/DEPLOYMENT.md` — production deployment and migrations

Running on Replit: set secrets `DATABASE_URL` and `OPENAI_API_KEY` (or use Replit AI
Integrations, whose `AI_INTEGRATIONS_OPENAI_*` variables are accepted), run `npm run db:migrate`
once, then `npm run dev`. Replit's Vite dev plugins load automatically only inside a Repl.
