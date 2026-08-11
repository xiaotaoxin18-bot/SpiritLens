"""Auth schemas."""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserRegister(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    username: Optional[str] = Field(None, min_length=2, max_length=100)
    nickname: Optional[str] = Field(None, min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=128)
    captcha_token: str = Field(..., min_length=1)
    captcha_text: str = Field(..., min_length=1, max_length=10)


class UserLogin(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    username: Optional[str] = None
    password: str = Field(..., min_length=6)


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: Optional[str] = None
    username: Optional[str] = None
    nickname: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Profile update — only provided fields are changed."""
    nickname: Optional[str] = Field(None, min_length=1, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)


class ChangePassword(BaseModel):
    """Change password — requires the current password for verification."""
    old_password: str = Field(..., min_length=6, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)
