from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserOut, LoginResponse
from app.schemas.common import ApiResponse
from app.services.auth_service import register_user, login_user

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=ApiResponse[UserOut])
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """公开注册已关闭。仅 admin 可在 /admin/users/create 创建用户。"""
    from fastapi import HTTPException
    raise HTTPException(
        status_code=403,
        detail="Registration is disabled. Please contact the administrator.",
    )


@router.post("/login", response_model=ApiResponse[LoginResponse])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user, token = await login_user(db, body.username, body.password)
    return ApiResponse(
        data=LoginResponse(
            access_token=token,
            user=UserOut.model_validate(user),
        )
    )


@router.get("/me", response_model=ApiResponse[UserOut])
async def get_me(user: User = Depends(get_current_user)):
    return ApiResponse(data=UserOut.model_validate(user))
