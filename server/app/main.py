from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    summary="RecoDate backend for recommendation, customization, and execution flow.",
)

app.include_router(api_router)
