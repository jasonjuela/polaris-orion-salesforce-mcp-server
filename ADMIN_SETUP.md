# Secure Admin Setup

## Option 1: Database Command (Recommended)

Run this SQL command to create your admin account:

```sql
INSERT INTO users (id, username, password_hash) 
VALUES ('admin-001', 'admin', '$2b$10$rOKgNK1cNqW7FLaQpZZb6u1PmCgJf2YxDGz2.k8vS4zNzZzKxzKxK');
```

**Default password:** `admin123`

**IMPORTANT:** Change this password immediately after first login!

## Option 2: Use the Database Tool

In the Replit database panel:
1. Open the database
2. Go to the `users` table  
3. Add a new row:
   - id: `admin-001`
   - username: `admin` 
   - password_hash: `$2b$10$rOKgNK1cNqW7FLaQpZZb6u1PmCgJf2YxDGz2.k8vS4zNzZzKxzKxK`

## After Setup

1. Login with username: `admin`, password: `admin123`
2. Configure your Salesforce OAuth settings
3. **Change the admin password** for security

## Security Notes

- Registration is now disabled in production
- Only pre-created admin accounts can access the system
- This prevents unauthorized account creation