const API_BASE_URL = 'https://symmetrical-fiesta-qr6x97pjj94hxxg6-8000.app.github.dev'; // Adjust if your FastAPI runs on a different port/host

// --- Utility Functions ---

function getToken() {
    return localStorage.getItem('accessToken');
}

function getRole() {
    return localStorage.getItem('userRole');
}

function isLoggedIn() {
    return getToken() !== null && getRole() !== null;
}

function redirectToDashboard() {
    if (isLoggedIn()) {
        const role = getRole();
        if (role === 'teacher') {
            window.location.href = 'teacher.html';
        } else if (role === 'student') {
            window.location.href = 'student.html';
        }
    } else {
        window.location.href = 'index.html'; // Go back to login if not logged in
    }
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `message ${type}`;
    setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
    }, 5000);
}

// --- Auth Functions ---

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const loginMessage = document.getElementById('loginMessage');

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const response = await fetch(`${API_BASE_URL}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        });

        if (response.ok) {
            const data = await response.json();
            const payload = JSON.parse(atob(data.access_token.split('.')[1])); // Decode JWT payload
            localStorage.setItem('accessToken', data.access_token);
            localStorage.setItem('userRole', payload.role);
            localStorage.setItem('username', payload.sub); // Store username for display

            showMessage('loginMessage', 'Login successful!', 'success');
            redirectToDashboard();
        } else {
            const errorData = await response.json();
            showMessage('loginMessage', errorData.detail || 'Login failed.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('loginMessage', 'An error occurred during login.', 'error');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const role = document.getElementById('signupRole').value;
    const signupMessage = document.getElementById('signupMessage');

    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password, role }),
        });

        if (response.ok) {
            showMessage('signupMessage', 'Signup successful! You can now log in.', 'success');
            document.getElementById('signupForm').reset();
        } else {
            const errorData = await response.json();
            showMessage('signupMessage', errorData.detail || 'Signup failed.', 'error');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showMessage('signupMessage', 'An error occurred during signup.', 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');
    window.location.href = 'index.html';
}

// --- Teacher Specific Functions ---

async function createAssignment(event) {
    event.preventDefault();
    const title = document.getElementById('assignmentTitle').value;
    const description = document.getElementById('assignmentDescription').value;
    const dueDate = document.getElementById('assignmentDueDate').value; // e.g., "2025-08-01T23:59"
    const createAssignmentMessage = document.getElementById('createAssignmentMessage');

    try {
        const response = await fetch(`${API_BASE_URL}/assignments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                title,
                description,
                due_date: new Date(dueDate).toISOString() // Convert to ISO 8601 string
            }),
        });

        if (response.ok) {
            showMessage('createAssignmentMessage', 'Assignment created successfully!', 'success');
            document.getElementById('createAssignmentForm').reset();
            loadTeacherAssignments(); // Reload assignments list
        } else {
            const errorData = await response.json();
            showMessage('createAssignmentMessage', errorData.detail || 'Failed to create assignment.', 'error');
        }
    } catch (error) {
        console.error('Create assignment error:', error);
        showMessage('createAssignmentMessage', 'An error occurred.', 'error');
    }
}

async function loadTeacherAssignments() {
    const teacherAssignmentsList = document.getElementById('teacherAssignmentsList');
    const loadAssignmentsMessage = document.getElementById('loadAssignmentsMessage');
    teacherAssignmentsList.innerHTML = ''; // Clear previous list

    try {
        const response = await fetch(`${API_BASE_URL}/teacher/assignments`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const assignments = await response.json();
            if (assignments.length === 0) {
                teacherAssignmentsList.innerHTML = '<p>No assignments created yet.</p>';
            } else {
                assignments.forEach(assignment => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div>
                            <strong>${assignment.title}</strong><br>
                            <span>Due: ${new Date(assignment.due_date).toLocaleString()}</span><br>
                            <span>Created: ${new Date(assignment.created_at).toLocaleString()}</span>
                        </div>
                        <button onclick="viewSubmissions('${assignment.id}', '${assignment.title}')">View Submissions</button>
                    `;
                    teacherAssignmentsList.appendChild(li);
                });
            }
        } else {
            const errorData = await response.json();
            showMessage('loadAssignmentsMessage', errorData.detail || 'Failed to load assignments.', 'error');
        }
    } catch (error) {
        console.error('Load teacher assignments error:', error);
        showMessage('loadAssignmentsMessage', 'An error occurred while loading assignments.', 'error');
    }
}

async function viewSubmissions(assignmentId, assignmentTitle) {
    const submissionDetailsSection = document.getElementById('submissionDetailsSection');
    const currentAssignmentTitle = document.getElementById('currentAssignmentTitle');
    const submissionList = document.getElementById('submissionList');
    submissionList.innerHTML = ''; // Clear previous list

    currentAssignmentTitle.textContent = assignmentTitle;
    submissionDetailsSection.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}/submissions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const submissions = await response.json();
            if (submissions.length === 0) {
                submissionList.innerHTML = '<p>No submissions for this assignment yet.</p>';
            } else {
                submissions.forEach(submission => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div>
                            <strong>Student: ${submission.student_username}</strong><br>
                            <span>Submitted: ${new Date(submission.submitted_at).toLocaleString()}</span><br>
                            <p>${submission.submission_text}</p>
                            ${submission.file_path ? `<a href="${API_BASE_URL.replace('/api','')}/${submission.file_path}" target="_blank">View File</a>` : ''}
                            ${submission.grade !== null ? `<br><span>Grade: ${submission.grade}</span>` : ''}
                        </div>
                    `;
                    submissionList.appendChild(li);
                });
            }
        } else {
            const errorData = await response.json();
            showMessage('loadAssignmentsMessage', errorData.detail || 'Failed to load submissions.', 'error');
        }
    } catch (error) {
        console.error('Load submissions error:', error);
        showMessage('loadAssignmentsMessage', 'An error occurred while loading submissions.', 'error');
    }
}


// --- Student Specific Functions ---

async function loadStudentAssignments() {
    const availableAssignmentsList = document.getElementById('availableAssignmentsList');
    const loadAssignmentsMessage = document.getElementById('loadAssignmentsMessage');
    availableAssignmentsList.innerHTML = ''; // Clear previous list

    try {
        const response = await fetch(`${API_BASE_URL}/student/assignments`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const assignments = await response.json();
            if (assignments.length === 0) {
                availableAssignmentsList.innerHTML = '<p>No assignments available.</p>';
            } else {
                assignments.forEach(assignment => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div>
                            <strong>${assignment.title}</strong><br>
                            <span>Due: ${new Date(assignment.due_date).toLocaleString()}</span><br>
                            <span>Description: ${assignment.description.substring(0, 100)}...</span>
                        </div>
                        <button onclick="prepareSubmission('${assignment.id}', '${assignment.title}')">Submit</button>
                    `;
                    availableAssignmentsList.appendChild(li);
                });
            }
        } else {
            const errorData = await response.json();
            showMessage('loadAssignmentsMessage', errorData.detail || 'Failed to load assignments.', 'error');
        }
    } catch (error) {
        console.error('Load student assignments error:', error);
        showMessage('loadAssignmentsMessage', 'An error occurred while loading assignments.', 'error');
    }
}

function prepareSubmission(assignmentId, assignmentTitle) {
    const submitAssignmentSection = document.getElementById('submitAssignmentSection');
    const assignmentToSubmitTitle = document.getElementById('assignmentToSubmitTitle');
    const submitBtn = document.querySelector('#submitAssignmentForm button');

    assignmentToSubmitTitle.textContent = assignmentTitle;
    submitBtn.setAttribute('data-assignment-id', assignmentId);
    document.getElementById('submissionText').value = ''; // Clear previous text
    document.getElementById('submissionFile').value = ''; // Clear previous file
    submitAssignmentSection.style.display = 'block';
    submitAssignmentSection.scrollIntoView({ behavior: 'smooth' }); // Scroll to form
}

async function submitAssignment(event) {
    event.preventDefault();
    const assignmentId = event.target.querySelector('button').getAttribute('data-assignment-id');
    const submissionText = document.getElementById('submissionText').value;
    const submissionFile = document.getElementById('submissionFile').files[0];
    const submitAssignmentMessage = document.getElementById('submitAssignmentMessage');

    const formData = new FormData();
    formData.append('submission_text', submissionText);
    if (submissionFile) {
        formData.append('file', submissionFile);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/assignments/${assignmentId}/submit`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData,
        });

        if (response.ok) {
            showMessage('submitAssignmentMessage', 'Assignment submitted successfully!', 'success');
            document.getElementById('submitAssignmentForm').reset();
            document.getElementById('submitAssignmentSection').style.display = 'none'; // Hide form after submission
            loadMySubmissions(); // Reload student's submissions
        } else {
            const errorData = await response.json();
            showMessage('submitAssignmentMessage', errorData.detail || 'Failed to submit assignment.', 'error');
        }
    } catch (error) {
        console.error('Submit assignment error:', error);
        showMessage('submitAssignmentMessage', 'An error occurred during submission.', 'error');
    }
}

async function loadMySubmissions() {
    const mySubmissionsList = document.getElementById('mySubmissionsList');
    const loadMySubmissionsMessage = document.getElementById('loadMySubmissionsMessage');
    mySubmissionsList.innerHTML = ''; // Clear previous list

    try {
        const response = await fetch(`${API_BASE_URL}/student/submissions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (response.ok) {
            const submissions = await response.json();
            if (submissions.length === 0) {
                mySubmissionsList.innerHTML = '<p>You have no submissions yet.</p>';
            } else {
                submissions.forEach(submission => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div>
                            <strong>Submission ID: ${submission.id.substring(0, 8)}...</strong><br>
                            <span>Submitted: ${new Date(submission.submitted_at).toLocaleString()}</span><br>
                            <p>${submission.submission_text.substring(0, 150)}...</p>
                            ${submission.file_path ? `<a href="${API_BASE_URL.replace('/api','')}/${submission.file_path}" target="_blank">View File</a>` : ''}
                            ${submission.grade !== null ? `<br><span>Grade: ${submission.grade}</span>` : '<span>Grade: Not Graded Yet</span>'}
                        </div>
                    `;
                    mySubmissionsList.appendChild(li);
                });
            }
        } else {
            const errorData = await response.json();
            showMessage('loadMySubmissionsMessage', errorData.detail || 'Failed to load your submissions.', 'error');
        }
    } catch (error) {
        console.error('Load my submissions error:', error);
        showMessage('loadMySubmissionsMessage', 'An error occurred while loading your submissions.', 'error');
    }
}


// --- Event Listeners and Initial Load ---

document.addEventListener('DOMContentLoaded', () => {
    // Check current page and attach listeners
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
        document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
        if (isLoggedIn()) {
            redirectToDashboard(); // If already logged in, redirect
        }
    } else if (window.location.pathname.endsWith('teacher.html')) {
        if (getRole() !== 'teacher') {
            redirectToDashboard(); // Redirect if not teacher or not logged in
            return;
        }
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
        document.getElementById('createAssignmentForm')?.addEventListener('submit', createAssignment);
        loadTeacherAssignments();
    } else if (window.location.pathname.endsWith('student.html')) {
        if (getRole() !== 'student') {
            redirectToDashboard(); // Redirect if not student or not logged in
            return;
        }
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
        document.getElementById('submitAssignmentForm')?.addEventListener('submit', submitAssignment);
        loadStudentAssignments();
        loadMySubmissions();
    }
});
