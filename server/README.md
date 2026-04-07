# Server Structure Draft

This directory is reserved for the Python FastAPI backend.

## Goal

The backend should focus on recommendation logic, course rebuilding, and execution-time replanning.

## Run Plan

Expected local workflow:

1. create a virtual environment
2. install dependencies from `requirements.txt`
3. run `uvicorn app.main:app --reload`

## Structure

- `app/main.py`: FastAPI entrypoint
- `app/api/`: routers and route registration
- `app/core/`: application-level configuration
- `app/data/`: Gangneung seed data for the MVP
- `app/schemas/`: request and response contracts
- `app/services/`: recommendation, place search, course rebuild, live replanning

## Current Scope

- Gangneung-only MVP
- extendable city and district model later
- recommendation-first backend before external API integration
