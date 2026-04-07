# Server Structure Draft

This directory is reserved for the NestJS backend.

The backend is separated into recommendation-centered modules that map to the product flow:

- recommendation engine
- place search
- course rebuild
- execution context

Shared request and response contracts live under `src/shared`.
