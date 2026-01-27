# Sunday School Portal System Specification

## Overview
The Sunday School Portal is a web-based attendance tracking and reward management system designed for Sunday school programs. The system enables teachers and administrators to track student attendance, manage reward redemption, and generate statistical reports. The application utilizes Google Apps Script as the backend, with a modern web frontend built using HTML, CSS, and JavaScript.

## System Architecture

### Backend Architecture
The backend is implemented using **Google Apps Script** and consists of two main files:

#### 1. `config.gs`
- Contains configuration constants for accessing Google Sheets
- Defines spreadsheet IDs and sheet names for different data sources
- Key configurations:
  - `STUDENT_SPREADSHEET_ID`: Google Sheet containing student lists organized by class
  - `PERMISSION_SPREADSHEET_ID`: Access control spreadsheet with user permissions
  - `ATTENDANCE_SPREADSHEET_ID`: Records of student attendance and reward status

#### 2. `fixed_main.gs`
- Main backend logic implementing REST-like API endpoints
- Handles authentication, data validation, and business logic
- Provides various API functions accessible via HTTP GET/POST requests

### Frontend Architecture
The frontend consists of three main HTML pages with corresponding JavaScript modules:

#### 1. `form.html` - Attendance Registration Page
- **Purpose**: Entry point for recording student attendance
- **JS Module**: `js/main-form.js`
- **Features**: Student selection, date validation, supplement mode for updating existing records

#### 2. `stat.html` - Statistics Dashboard
- **Purpose**: Displays attendance statistics and achievement tracking
- **JS Module**: `js/main-stats.js`
- **Features**: Tabbed interface showing stats summary, achieved students, and unredeemed records

#### 3. `redeem.html` - Redemption Management
- **Purpose**: Bulk management of reward redemption status
- **JS Module**: `js/main-redeem.js`
- **Features**: Filtering, bulk updates, and individual record management

### Authentication & Authorization
- **Firebase Authentication**: Google OAuth integration for secure login
- **Role-Based Access Control**: Two-tier permission system
  - `admin`: Full access to all classes and records
  - `teacher`: Limited to their assigned class only
- **Session Management**: Persistent sessions stored locally

### Data Flow Architecture
```
Frontend (HTML/JS) → API Requests → Google Apps Script → Google Sheets
```

## Functional Components

### 1. User Management
- **Authentication**: Google OAuth login via Firebase
- **Authorization**: Role determination based on permissions spreadsheet
- **Session Handling**: Local storage of user roles and permissions

### 2. Student Management
- **Class Retrieval**: Fetch all available classes from student spreadsheet
- **Student Lookup**: Retrieve students by class with autocomplete functionality
- **Bulk Operations**: Admin capability to view all students across classes

### 3. Attendance Tracking
- **Record Creation**: Add new attendance entries with validation
- **Duplicate Prevention**: Check for existing records on same date
- **Date Validation**: Ensures attendance dates fall on Sundays only
- **Redemption Tracking**: Mark rewards as claimed with redemption dates

### 4. Achievement Calculation
- **Threshold Logic**: Determine when students qualify for rewards
- **Progress Tracking**: Monitor attendance milestones
- **Redemption Status**: Track fulfillment of reward conditions

### 5. Reporting & Statistics
- **Summary Statistics**: Total records, achieved students, redeemed counts
- **Detailed Views**: Per-class attendance breakdowns
- **Achievement Lists**: Students who have met reward criteria
- **Unredeemed Reports**: Outstanding reward claims

## Core Functionality

### Attendance Registration (`form.html`)
**Normal Mode**:
1. Select class from dropdown
2. Search and select student name from autocomplete
3. Enter attendance date (validated as Sunday)
4. Optionally mark as "redeemed" with redemption date
5. Submit record to backend

**Supplement Mode**:
1. Enable "補領登記模式" (Supplement Registration Mode)
2. Automatically sets redemption status to "yes"
3. Updates existing attendance record with redemption information
4. Requires specifying the original attendance date to locate the correct record

### Statistics Dashboard (`stat.html`)
**Three-tab Interface**:
1. **Statistics Summary**: Shows key metrics (total records, achieved students, redeemed count)
2. **Achieved Students**: Lists students who have met reward criteria with redemption status
3. **Unredeemed Records**: Shows students eligible for rewards but not yet claimed

### Redemption Management (`redeem.html`)
**Bulk Operations**:
1. Filter records by class
2. Select multiple records using checkboxes
3. Set redemption date globally or individually
4. Update selected or all records in bulk
5. Individual record updates available

## API Endpoints

### GET Endpoints
- `getUserRoles`: Verify user permissions
- `getAllClasses`: Retrieve all class names
- `getStudentsByClass`: Get students for a specific class
- `getStats`: Get statistical data
- `getAttendanceDetails`: Get detailed attendance records
- `getUnredeemedRecords`: Get records not yet redeemed (admin only)
- `getAchievedStudents`: Get students meeting achievement criteria

### POST Endpoints
- `recordAttendance`: Create new attendance record
- `updateRedeemStatus`: Update redemption status for existing record
- `batchUpdateRedeemStatus`: Update multiple redemption records

## Data Model

### Permissions Spreadsheet
- **Structure**: Contains columns for email, role, and class
- **Roles**: "admin" (full access) or "teacher" (class-specific access)
- **Access Control**: Determines what data users can view/edit

### Student Spreadsheet
- **Structure**: Multiple sheets, one per class
- **Columns**: Name, category (student/staff), etc.
- **Organization**: Each class is a separate worksheet

### Attendance Spreadsheet
- **Structure**: Single sheet containing attendance records
- **Columns**: Class, Student Name, Attendance Date, Redeemed Status, Redemption Date, Email, Timestamp
- **Purpose**: Tracks attendance history and reward fulfillment

## Security Features
- **Role-Based Access Control**: Limits data access based on user permissions
- **Email Validation**: Ensures proper user identification
- **Duplicate Prevention**: Prevents accidental duplicate entries
- **Date Validation**: Ensures attendance is recorded only on Sundays
- **Input Sanitization**: Validates and sanitizes all user inputs

## Technical Implementation Details

### Frontend Technologies
- **HTML5**: Semantic markup and structure
- **CSS**: Tailwind CSS and custom styling
- **JavaScript**: ES6 modules with import/export functionality
- **Firebase SDK**: Authentication and authorization

### Backend Technologies
- **Google Apps Script**: Serverless execution environment
- **Google Sheets API**: Data persistence and retrieval
- **REST API**: HTTP-based communication protocol

### Data Validation
- **Client-Side**: Form validation and user feedback
- **Server-Side**: Comprehensive validation in Apps Script
- **Business Logic**: Attendance date must be Sunday, no duplicates, etc.

## Deployment Configuration
- **Apps Script URL**: Configured in `js/config.js` for API endpoint
- **Firebase Project**: Authentication service configuration
- **Spreadsheet IDs**: Defined in `config.gs` for data sources
- **CORS Settings**: Properly configured for cross-domain requests

## Maintenance Considerations
- **Scalability**: Designed to handle multiple classes and students
- **Performance**: Optimized queries and caching mechanisms
- **Backup**: Google Sheets native backup and versioning
- **Monitoring**: Error logging and exception handling