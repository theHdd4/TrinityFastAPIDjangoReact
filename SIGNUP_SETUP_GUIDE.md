# Landing Page Signup Setup Guide

## 🎯 Overview
This guide explains the new signup functionality that saves user data from the landing page to PostgreSQL.

## 📁 Files Created/Modified

### Backend (Django)
1. **New App Created**: `apps/signups/`
   - `models.py` - SignupList model
   - `serializers.py` - SignupListSerializer
   - `views.py` - SignupListViewSet (API endpoint)
   - `urls.py` - URL routing
   - `admin.py` - Django admin interface
   - `migrations/0001_initial.py` - Database migration

2. **Modified Files**:
   - `config/settings.py` - Added 'apps.signups' to SHARED_APPS
   - `config/urls.py` - Added signup API route

### Frontend (React)
1. **Modified**: `TrinityFrontend/src/pages/Home.tsx`
   - Added form state management
   - Added form validation
   - Added API integration
   - Added success/error messages
   - Added loading states

## 🗄️ Database Schema

**Table Name**: `signup_list` (in `trinity_db` → `public` schema)

| Column               | Type         | Constraints      | Description                    |
|----------------------|--------------|------------------|--------------------------------|
| id                   | BigAutoField | PRIMARY KEY      | Auto-generated ID              |
| first_name           | CharField    | max_length=100   | User's first name              |
| last_name            | CharField    | max_length=100   | User's last name               |
| email                | EmailField   | UNIQUE           | User's work email              |
| institution_company  | CharField    | max_length=200   | Institution/Company name       |
| created_at           | DateTimeField| auto_now_add     | Timestamp of signup            |

## 🚀 Setup Instructions

### Step 1: Stop Running Containers (if any)
```bash
cd TrinityFastAPIDjangoReact
docker-compose down
```

### Step 2: Run Database Migration
```bash
# Start only the database
docker-compose up -d postgres

# Wait for database to be ready (about 10 seconds)

# Run migrations
docker-compose exec web python manage.py migrate

# Or if containers aren't running yet:
docker-compose run --rm web python manage.py migrate
```

### Step 3: Start All Services
```bash
docker-compose up -d
```

### Step 4: Verify the Table
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U trinity_user -d trinity_db

# Check if table exists
\dt public.signup_list

# View table structure
\d public.signup_list

# Exit psql
\q
```

## 📡 API Endpoint

**Endpoint**: `/api/signups/signups/`

### POST - Create Signup (Public - No Auth Required)
```bash
curl -X POST http://localhost:8000/api/signups/signups/ \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "institution_company": "Example Corp"
  }'
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "message": "Thank you for signing up! We will contact you soon.",
  "data": {
    "id": 1,
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "institution_company": "Example Corp",
    "created_at": "2025-10-13T10:30:00Z"
  }
}
```

**Error Response** (400 Bad Request):
```json
{
  "email": ["signup list with this email already exists."]
}
```

### GET - List Signups (Admin Only)
```bash
curl -X GET http://localhost:8000/api/signups/signups/ \
  -H "Authorization: Token YOUR_ADMIN_TOKEN"
```

## 🎨 Frontend Features

### Form Validation
- ✅ All fields required
- ✅ Email format validation
- ✅ Real-time error messages
- ✅ Loading state during submission
- ✅ Success confirmation message
- ✅ Form auto-clears on success

### User Experience
1. User fills out all 4 fields (First Name, Last Name, Work Email, Institution/Company)
2. Clicks "Get early access" button
3. Button shows "Submitting..." and disables all inputs
4. On success:
   - Green success message appears
   - Form clears automatically
   - Message disappears after 8 seconds
5. On error:
   - Red error message appears
   - Form data remains (user can fix errors)
   - Message disappears after 5 seconds

## 🔍 Viewing Signups

### Method 1: Django Admin
1. Navigate to: `http://localhost:8000/admin/`
2. Login with admin credentials
3. Click on "Signups" section
4. View all signups with search/filter options

### Method 2: PostgreSQL Direct Query
```bash
docker-compose exec postgres psql -U trinity_user -d trinity_db -c "SELECT * FROM signup_list ORDER BY created_at DESC;"
```

### Method 3: API (Admin only)
```bash
curl -X GET http://localhost:8000/api/signups/signups/ \
  -H "Authorization: Token YOUR_ADMIN_TOKEN"
```

## 🧪 Testing the Integration

### Test 1: Valid Signup
1. Open: `http://localhost:8080` (or your frontend URL)
2. Scroll to "Reserve your spot" section
3. Fill in all fields with valid data
4. Click "Get early access"
5. Should see green success message
6. Verify in database:
   ```bash
   docker-compose exec postgres psql -U trinity_user -d trinity_db -c "SELECT * FROM signup_list;"
   ```

### Test 2: Duplicate Email
1. Try to signup with the same email again
2. Should see error: "signup list with this email already exists."

### Test 3: Invalid Email
1. Enter invalid email format (e.g., "test@invalid")
2. Should see error: "Please enter a valid email address"

### Test 4: Empty Fields
1. Leave any field empty
2. Should see error: "Please fill in all fields"

## 🔧 Troubleshooting

### Issue: Migration Fails
**Solution**: 
```bash
# Check if postgres is running
docker-compose ps postgres

# View postgres logs
docker-compose logs postgres

# Restart postgres
docker-compose restart postgres
```

### Issue: API Returns 404
**Solution**:
```bash
# Check if Django is running
docker-compose ps web

# View Django logs
docker-compose logs web

# Restart Django
docker-compose restart web
```

### Issue: CORS Error in Frontend
**Solution**: CORS is already configured in settings.py to allow all origins in development. If you still get CORS errors, check that:
1. Frontend is running on port 8080
2. Backend is running on port 8000
3. Check browser console for exact error

### Issue: Table Already Exists
**Solution**:
```bash
# If you need to recreate the table
docker-compose exec postgres psql -U trinity_user -d trinity_db -c "DROP TABLE IF EXISTS signup_list CASCADE;"

# Then run migration again
docker-compose exec web python manage.py migrate signups
```

## 📊 Database Schema Visual

```
┌─────────────────────────────────────┐
│         signup_list                 │
├─────────────────────────────────────┤
│ id (PK)                 bigint      │
│ first_name              varchar(100)│
│ last_name               varchar(100)│
│ email (UNIQUE)          varchar(254)│
│ institution_company     varchar(200)│
│ created_at              timestamp   │
└─────────────────────────────────────┘
```

## 🎉 Success Criteria

✅ Table `signup_list` exists in `trinity_db.public`  
✅ Django admin shows "Signups" section  
✅ API endpoint `/api/signups/signups/` is accessible  
✅ Frontend form submits successfully  
✅ Data appears in PostgreSQL  
✅ Success message displays to user  
✅ Duplicate emails are rejected  
✅ Form validation works  

## 📝 Next Steps (Optional)

1. **Email Notifications**: Set up email sending when new signups arrive
2. **Export Feature**: Add CSV/Excel export for admin users
3. **Analytics Dashboard**: Create a dashboard to visualize signup trends
4. **Email Verification**: Add email verification step
5. **CRM Integration**: Integrate with Salesforce/HubSpot

## 🔐 Security Notes

- ✅ Public endpoint (POST only) - Anyone can sign up
- ✅ Admin-only access (GET/PUT/DELETE) - Only admins can view data
- ✅ Email uniqueness enforced at database level
- ✅ Input validation on both frontend and backend
- ✅ CORS properly configured
- ⚠️ In production, consider adding rate limiting to prevent spam

---

**Created**: October 13, 2025  
**Version**: 1.0  
**Author**: Trinity Development Team

