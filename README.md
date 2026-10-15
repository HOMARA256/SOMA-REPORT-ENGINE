# SOMA REPORT ENGINE

School management system for secondary schools, including academic results and report cards.

## Architecture

- Frontend: React + TypeScript + HTML5
- Backend: Node.js + TypeScript
- Database: PostgreSQL
- Offline: PWA + IndexedDB
- Reports: HTML to Print/PDF

## Programmes

- O-Level: Senior 1 to Senior 4
- A-Level: Senior 5 to Senior 6

## Development Process

PRD -> Database -> Domain -> API -> UI -> Security -> Tests -> Documentation

## Production deployment

SOMA REPORT ENGINE is prepared for a Linux Cloud VPS with Docker, Nginx, HTTPS,
container health checks, backup verification and host monitoring. Follow the
[Jubilee Linux VPS runbook](docs/deployment/JUBILEE_LINUX_VPS_RUNBOOK.md) on the
deployment host; do not commit the host `.env` file or any provider credentials.
