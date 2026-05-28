"""Project management endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_operator
from app.db.session import get_db
from app.models.models import Project, User
from app.schemas.schemas import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _json_or_none(items: list | None) -> str | None:
    if not items:
        return None
    return json.dumps([i.model_dump() for i in items])


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .order_by(Project.name)
    )
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        user_id=current_user.id,
        name=body.name.strip(),
        description=body.description,
        status=body.status,
        client_requestor=body.client_requestor,
        design_link=body.design_link,
        is_priority=body.is_priority,
        designer=body.designer,
        estimated_print_time_seconds=body.estimated_print_time_seconds,
        filament_estimates=_json_or_none(body.filament_estimates),
        plate_data=_json_or_none(body.plate_data),
    )
    db.add(project)
    await db.flush()
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = body.model_dump(exclude_unset=True)
    for field in ('filament_estimates', 'plate_data', 'comments'):
        if field in data and data[field] is not None:
            data[field] = json.dumps(data[field])
    for field, value in data.items():
        setattr(project, field, value)

    await db.flush()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
