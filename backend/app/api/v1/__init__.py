from fastapi import APIRouter
from app.api.v1 import auth, projects, requirements, schemas, sql, migrations, agents

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(requirements.router)
api_router.include_router(schemas.router)
api_router.include_router(sql.router)
api_router.include_router(migrations.router)
api_router.include_router(agents.router)
