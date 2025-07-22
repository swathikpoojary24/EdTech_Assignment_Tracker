from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
import os
from . import models, schemas, auth
from .database import engine, get_db

# Create database tables if they don't exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EdTech Assignment Tracker API",
    description="API for managing assignments and submissions.",
    version="1.0.0"
)
# frontend_origin = "https://symmetrical-fiesta-qr6x97pjj94hxxg6-8001.app.github.dev"
# CORS configuration (allows frontend to talk to backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory for file uploads
UPLOAD_DIRECTORY = "uploaded_files"
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)

# Serve static files (uploaded files)
app.mount("/uploaded_files", StaticFiles(directory=UPLOAD_DIRECTORY), name="uploaded_files")

@app.post("/api/signup", response_model=schemas.UserInDB, status_code=status.HTTP_201_CREATED)
def signup_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = auth.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(
        username=user.username,
        password_hash=hashed_password,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/token", response_model=schemas.Token)
def login_for_access_token(
    response: Response, # This is correctly placed now
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = auth.get_user_by_username(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = auth.timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )

    # --- START: THIS IS THE BLOCK YOU NEED TO ADD/ENSURE IS PRESENT ---
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,  # Makes the cookie inaccessible to JavaScript
        secure=True,    # Ensures the cookie is only sent over HTTPS
        max_age=int(access_token_expires.total_seconds()), # Set cookie expiry to match token expiry
        samesite="Lax"  # Helps mitigate CSRF attacks
    )
    # --- END: Cookie setting block ---

    return {"access_token": access_token, "token_type": "bearer"}

# --- Teacher Endpoints ---

@app.post("/api/assignments", response_model=schemas.AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment_api(
    assignment: schemas.AssignmentCreate,
    current_teacher: models.User = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    """Allows an authenticated teacher to create a new assignment."""
    db_assignment = models.Assignment(
        title=assignment.title,
        description=assignment.description,
        due_date=assignment.due_date,
        teacher_id=current_teacher.id
    )
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    return db_assignment

@app.get("/api/teacher/assignments", response_model=list[schemas.AssignmentResponse])
def get_teacher_assignments_api(
    current_teacher: models.User = Depends(auth.get_current_teacher),
    db: Session = Depends(get_db)
):
    """Allows an authenticated teacher to view all their created assignments."""
    assignments = db.query(models.Assignment).filter(models.Assignment.teacher_id == current_teacher.id).all()
    return assignments

@app.get("/api/assignments/{assignment_id}/submissions", response_model=list[schemas.SubmissionDisplay])
def view_submissions_for_assignment_api(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_teacher: models.User = Depends(auth.get_current_teacher)
):
    """Allows an authenticated teacher to view all submissions for a specific assignment."""
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized to view submissions for this assignment")

    submissions = db.query(models.Submission).filter(models.Submission.assignment_id == assignment_id).all()
    result = []
    for sub in submissions:
        # Fetch student username
        student = db.query(models.User).filter(models.User.id == sub.student_id).first()
        student_username = student.username if student else "Unknown"
        result.append(schemas.SubmissionDisplay(
            id=sub.id,
            assignment_id=sub.assignment_id,
            student_id=sub.student_id,
            student_username=student_username, # Added student username
            submission_text=sub.submission_text,
            submitted_at=sub.submitted_at,
            grade=sub.grade,
            file_path=sub.file_path
        ))
    return result

# --- Student Endpoints ---

@app.post("/api/assignments/{assignment_id}/submit", response_model=schemas.SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_assignment_api(
    assignment_id: str,
    submission_text: str = Form(...), # Use Form for text fields when handling file uploads
    file: UploadFile = File(None), # Optional file upload
    current_student: models.User = Depends(auth.get_current_student),
    db: Session = Depends(get_db)
):
    """Allows an authenticated student to submit an assignment, with optional file upload."""
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    existing_submission = db.query(models.Submission).filter(
        models.Submission.student_id == current_student.id,
        models.Submission.assignment_id == assignment_id
    ).first()
    if existing_submission:
        raise HTTPException(status_code=400, detail="You have already submitted this assignment.")

    file_path = None
    if file:
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{current_student.id}_{assignment_id}_{auth.datetime.now().strftime('%Y%m%d%H%M%S')}{file_extension}"
        file_path = os.path.join(UPLOAD_DIRECTORY, unique_filename)
        try:
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
        except Exception as e:
            print(f"Error uploading file: {e}")
            raise HTTPException(status_code=500, detail="Could not upload file")

    new_submission = models.Submission(
        assignment_id=assignment_id,
        student_id=current_student.id,
        submission_text=submission_text,
        file_path=file_path
    )
    db.add(new_submission)
    db.commit()
    db.refresh(new_submission)
    return new_submission

@app.get("/api/student/assignments", response_model=list[schemas.AssignmentResponse])
def get_student_assignments_api(
    current_student: models.User = Depends(auth.get_current_student),
    db: Session = Depends(get_db)
):
    """Allows an authenticated student to view all available assignments."""
    # For simplicity, students can see all assignments. In real, filter by course enrollment.
    assignments = db.query(models.Assignment).all()
    return assignments

@app.get("/api/student/submissions", response_model=list[schemas.SubmissionResponse])
def get_student_submissions_api(
    current_student: models.User = Depends(auth.get_current_student),
    db: Session = Depends(get_db)
):
    """Allows an authenticated student to view all their own submissions."""
    submissions = db.query(models.Submission).filter(models.Submission.student_id == current_student.id).all()
    return submissions
