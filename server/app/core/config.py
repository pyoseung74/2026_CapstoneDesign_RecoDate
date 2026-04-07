from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "RecoDate API"
    app_version: str = "0.1.0"
    region_mode: str = "gangneung-only"
    supported_cities: tuple[str, ...] = ("gangneung-si",)
    district_selection_enabled: bool = False


settings = Settings()
