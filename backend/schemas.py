from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "student"

class UserInDB(BaseModel):
    id: str
    username: str
    password_hash: str
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class AssignmentCreate(BaseModel):
    title: str
    description: str
    due_date: datetime

class AssignmentResponse(AssignmentCreate):
    id: str
    created_at: datetime
    teacher_id: str

    class Config:
        from_attributes = True

class SubmissionCreate(BaseModel):
    submission_text: str
    file_path: Optional[str] = None

class SubmissionResponse(SubmissionCreate):
    id: str
    assignment_id: str
    student_id: str
    submitted_at: datetime
    grade: Optional[int] = None

    class Config:
        from_attributes = True

class SubmissionDisplay(BaseModel): # For teacher to view submissions
    id: str
    assignment_id: str
    student_id: str
    student_username: str
    submission_text: str
    submitted_at: datetime
    grade: Optional[int] = None
    file_path: Optional[str] = None

    class Config:
        from_attributes = True
