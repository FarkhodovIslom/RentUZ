# RentUZ — To‘liq Texnik Spetsifikatsiya

**Versiya:** 1.0  
**Loyiha turi:** Rental Marketplace  
**Platforma:** Web-first, Responsive  
**Asosiy bozor:** O‘zbekiston  
**Default tema:** Dark Mode  
**Asosiy rollar:** Tenant, Owner, Admin  

---

## Mundarija

**Umumiy**
1. [Loyiha haqida](#1-loyiha-haqida)
2. [Loyiha maqsadlari](#2-loyiha-maqsadlari)
3. [UI/UX Design System](#3-uiux-design-system)
4. [Typography](#4-typography)
5. [Spacing](#5-spacing)
6. [Responsive Design](#6-responsive-design)
7. [Accessibility](#7-accessibility)

**Frontend sahifalar**
8. [Texnologiyalar](#8-texnologiyalar)
9. [System Architecture](#9-system-architecture)
10. [Repository Structure](#10-repository-structure)
11. [User Roles](#11-user-roles)
12. [Public Pages](#12-public-pages)
13. [Tenant Pages](#13-tenant-pages)
14. [Owner Pages](#14-owner-pages)
15. [Admin Pages](#15-admin-pages)
16. [System Pages](#16-system-pages)
17. [Home Page](#17-home-page)
18. [Rentals Page](#18-rentals-page)
19. [Property Card](#19-property-card)
20. [Property Details](#20-property-details)
21. [Map](#21-map)
22. [Favorites](#22-favorites)
23. [Authentication](#23-authentication)
24. [Authentication Architecture](#24-authentication-architecture)
25. [Rental Request](#25-rental-request)
26. [My Rentals](#26-my-rentals)
27. [Chat](#27-chat)
28. [Socket.IO Events](#28-socketio-events)
29. [Notifications](#29-notifications)
30. [Profile](#30-profile)
31. [Owner Dashboard](#31-owner-dashboard)
32. [Add Property Flow](#32-add-property-flow)
33. [Property Status](#33-property-status)
34. [Owner Analytics](#34-owner-analytics)

**Backend / Ma'lumotlar bazasi**
35. [Database Schema (PostgreSQL)](#35-database-schema-postgresql)
36. [User Status](#36-user-status)
37. [Report Status](#37-report-status)
38. [API Standard](#38-api-standard)
39. [Auth API](#39-auth-api)
40. [Users API](#40-users-api)
41. [Properties API](#41-properties-api)
42. [Search API](#42-search-api)
43. [Favorites API](#43-favorites-api)
44. [Rental Request API](#44-rental-request-api)
45. [Chat API](#45-chat-api)
46. [Notifications API](#46-notifications-api)
47. [Reports API](#47-reports-api)
48. [Verification API](#48-verification-api)
49. [Admin API](#49-admin-api)
50. [Analytics API](#50-analytics-api)
51. [Image Upload](#51-image-upload)
52. [Database Indexes (PostgreSQL)](#52-database-indexes-postgresql)
53. [Security](#53-security)

**Biznes qoidalari**
54. [Business Rules](#54-business-rules)
55. [Premium](#55-premium)
56. [Premium Plans](#56-premium-plans)
57. [Admin Dashboard](#57-admin-dashboard)
58. [Admin Users](#58-admin-users)
59. [Admin Properties](#59-admin-properties)
60. [Verification](#60-verification)
61. [Reports / Moderation](#61-reports-moderation)

**Frontend arxitektura**
62. [Frontend Components](#62-frontend-components)
63. [State Management](#63-state-management)
64. [Forms](#64-forms)
65. [Loading States](#65-loading-states)
66. [Empty States](#66-empty-states)
67. [Error States](#67-error-states)
68. [Performance](#68-performance)
69. [SEO](#69-seo)

**Infratuzilma / DevOps**
70. [Background Jobs](#70-background-jobs)
71. [Logging](#71-logging)
72. [Monitoring](#72-monitoring)
73. [Audit Logs](#73-audit-logs)
74. [Environment Variables](#74-environment-variables)
75. [Deployment](#75-deployment)
76. [Docker](#76-docker)
77. [CI/CD](#77-cicd)
78. [Git Workflow](#78-git-workflow)
79. [Testing](#79-testing)

**Roadmap**
80. [MVP](#80-mvp)
81. [Phase 2](#81-phase-2)
82. [AI Future Features](#82-ai-future-features)

**Qo'shimcha**
83. [Internationalization](#83-internationalization)
84. [Notifications Architecture](#84-notifications-architecture)
85. [Property Lifecycle](#85-property-lifecycle)
86. [Rental Request Lifecycle](#86-rental-request-lifecycle)
87. [User Journey](#87-user-journey)
88. [Owner Journey](#88-owner-journey)
89. [Admin Journey](#89-admin-journey)
90. [Data Ownership Rules](#90-data-ownership-rules)

**API va texnik standartlar**
91. [API Error Standard](#91-api-error-standard)
92. [Pagination](#92-pagination)
93. [Search Performance](#93-search-performance)
94. [File Security](#94-file-security)

**Production**
95. [Database Backup](#95-database-backup)
96. [Scalability](#96-scalability)
97. [Caching](#97-caching)
98. [Rate Limits](#98-rate-limits)
99. [Privacy](#99-privacy)
100. [Definition of Done](#100-definition-of-done)
101. [Development Roadmap](#101-development-roadmap)
102. [Final Architecture](#102-final-architecture)
103. [Yakuniy talab](#103-yakuniy-talab)

---

# 1. Loyiha haqida

RentUZ — O‘zbekistonda uy, kvartira va boshqa ko‘chmas mulklarni ijaraga olish va ijaraga berish uchun mo‘ljallangan zamonaviy marketplace platforma.

Platforma uchta asosiy foydalanuvchi turiga ega:

- Tenant — ijarachi
- Owner — uy/mulk egasi
- Admin — platforma administratori

Asosiy foydalanuvchi jarayoni:

Search → Discover → Save → Contact → Request → Rent

Owner jarayoni:

Create → Publish → Manage → Receive Requests → Chat → Rent

Admin jarayoni:

Monitor → Verify → Moderate → Analyze

---

# 2. Loyiha maqsadlari

## 2.1. Tenant uchun

Foydalanuvchi:

- uylarni qidirishi
- hudud bo‘yicha filter qilishi
- narx bo‘yicha filter qilishi
- xonalar sonini tanlashi
- xaritada uylarni ko‘rishi
- e’lonlarni saqlashi
- uy egasi bilan chat qilishi
- ijara so‘rovi yuborishi
- o‘z ijara so‘rovlarini ko‘rishi
- faol ijara ma’lumotlarini ko‘rishi kerak.

## 2.2. Owner uchun

Uy egasi:

- profil yaratishi
- e’lon yaratishi
- rasmlar yuklashi
- e’lonni draft sifatida saqlashi
- e’lonni publish qilishi
- verificationdan o‘tishi
- ijara so‘rovlarini ko‘rishi
- so‘rovni qabul/rad qilishi
- ijarachilar bilan chat qilishi
- e’lon statistikasini ko‘rishi kerak.

## 2.3. Admin uchun

Admin:

- foydalanuvchilarni boshqaradi
- e’lonlarni boshqaradi
- verification qiladi
- reportlarni ko‘rib chiqadi
- foydalanuvchini suspend qiladi
- e’lonni reject/pause qiladi
- platforma statistikasini ko‘radi
- moderation tarixini ko‘radi.

---

# 3. UI/UX Design System

## 3.1. Design philosophy

RentUZ dizayni:

- premium
- minimal
- zamonaviy
- ishonchli
- real-estate focused
- professional
- high-tech
- clutter-free

bo‘lishi kerak.

## 3.2. Theme

Default:

**Dark Mode**

Asosiy ranglar:

| Token | Color | Usage |
|---|---|---|
| Background | #080808 | Main background |
| Secondary | #0D0D0D | Secondary surface |
| Card | #121212 | Cards |
| Elevated | #181818 | Modal / Drawer |
| Input | #151515 | Inputs |
| Border | #242424 | Borders |
| Hover Border | #333333 | Hover |
| Primary Text | #FFFFFF | Main text |
| Secondary Text | #A1A1A1 | Secondary text |
| Muted | #6F6F6F | Placeholder |
| Primary Yellow | #FFA31A | CTA / Accent |
| Hover Yellow | #E88900 | CTA hover |
| Soft Yellow | #FFB84D | Soft accent |
| Success | #22A06B | Success |
| Error | #E5484D | Error |
| Info | #4D9FFF | Information |

Yellow rang umumiy interfeysning taxminan 5% qismida ishlatiladi.

Yellow quyidagilar uchun ishlatiladi:

- Primary CTA
- Active navigation
- Favorite
- Price highlight
- Verification badge
- Important statistics
- Selected state.

Quyidagilardan foydalanilmaydi:

- excessive gradients
- neon
- cyberpunk
- excessive glow
- heavy glassmorphism
- haddan tashqari sariq rang.

---

# 4. Typography

Asosiy font:

- Inter
- Geist
- SF Pro-inspired

Typography hierarchy:

- H1 — katta va kuchli
- H2 — section title
- H3 — card/subsection
- Body — o‘qilishi oson
- Caption — muted
- Price — accent bilan ajratiladi.

---

# 5. Spacing

8px spacing system ishlatiladi.

Misollar:

- 4px
- 8px
- 16px
- 24px
- 32px
- 40px
- 48px
- 64px

Border radius:

- 12px
- 14px
- 16px
- 18px

Interactive elementlar uchun minimum touch target:

**44px**

---

# 6. Responsive Design

## Mobile

320px – 767px

Mobile UI native applicationga o‘xshash bo‘lishi kerak.

Bottom navigation:

1. Bosh sahifa
2. Ijaralar
3. Xarita
4. Saqlangan
5. Profil

## Tablet

768px – 1023px

## Desktop

1024px+

## Large Desktop

1440px+

Desktopda:

- sidebar
- navbar
- grid
- map
- dashboard layout

ishlatiladi.

---

# 7. Accessibility

Platforma WCAG AA talablariga imkon qadar mos bo‘lishi kerak.

Talablar:

- semantic HTML
- keyboard navigation
- visible focus
- yetarli contrast
- accessible labels
- form error messages
- screen-reader friendly elements
- 44px minimum touch targets.

---

# 8. Texnologiyalar

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Zustand
- TanStack Query
- React Hook Form
- Zod yoki class-validator bilan mos schema
- Leaflet / OpenStreetMap yoki Mapbox

## Backend

- NestJS
- TypeScript
- Prisma

## Database

- PostgreSQL (Neon / Supabase)

## Realtime

- Socket.IO

## File storage

- Cloudinary yoki Amazon S3

## Cache / Queue

- Redis
- BullMQ

## Deployment

Frontend:

- Vercel

Backend:

- Render
- Railway
- VPS

Database:

- PostgreSQL (Neon / Supabase)

---

# 9. System Architecture

```text
User
  ↓
Next.js Web App
  ↓
TanStack Query + Zustand
  ↓
NestJS REST API
  ↓
Services / Guards / DTOs
  ├── PostgreSQL (Neon / Supabase)
  ├── Redis
  ├── Cloudinary / S3
  └── Payment Provider

Socket.IO
  ↓
Realtime Chat / Presence

GitHub
  ↓
GitHub Actions
  ↓
CI/CD
  ↓
Vercel + Backend Hosting
````

---

# 10. Repository Structure

```text
rentuz/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── types/
│   ├── ui/
│   └── config/
│
├── docs/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 11. User Roles

## TENANT

Tenant:

* property search
* property details
* favorites
* chat
* rental request
* notifications
* my rentals
* profile.

## OWNER

Owner:

* property CRUD
* image upload
* publish
* pause
* rental request management
* chat
* analytics.

## ADMIN

Admin:

* users
* properties
* verification
* reports
* analytics
* moderation
* settings.

RBAC server-side amalga oshirilishi shart.

Frontenddagi role tekshiruvi security uchun yetarli emas.

---

# 12. Public Pages

Quyidagi sahifalar public:

```text
/
 /rentals
 /map
 /property/[id]
 /login
 /register
```

---

# 13. Tenant Pages

```text
/favorites
/chat
/notifications
/profile
/my-rentals
/rental-requests
```

---

# 14. Owner Pages

```text
/owner
/owner/properties
/owner/properties/create
/owner/properties/[id]/edit
/owner/requests
/owner/messages
/owner/analytics
/owner/profile
```

---

# 15. Admin Pages

```text
/admin
/admin/users
/admin/properties
/admin/verification
/admin/reports
/admin/requests
/admin/analytics
/admin/settings
```

---

# 16. System Pages

```text
/404
/401
/403
/500
/offline
```

Bundan tashqari:

* Loading state
* Empty state
* Error state
* Success state
* Network error
* Session expired

UI holatlari ham mavjud bo‘lishi kerak.

---

# 17. Home Page

Home page quyidagi sectionlardan tashkil topadi:

1. Navbar
2. Hero
3. Search
4. Quick filters
5. Trust indicators
6. Popular cities
7. Featured listings
8. New listings
9. Map discovery
10. How it works
11. Verification/trust section
12. Owner CTA
13. Premium CTA
14. FAQ
15. Final CTA
16. Footer

Hero: **"O‘zingizga mos uyni oson toping."**

Supporting text: *"O‘zbekistondagi ijara uylarini narx, hudud va sharoit bo‘yicha bir joydan izlang."*

Search:

* Qayerdan
* Mulk turi
* Narx
* Xonalar
* Qidirish

Quick chips:

* Toshkent
* Samarqand
* Buxoro
* 1 xonali
* 2 xonali
* 3 xonali
* 3 mln gacha

Trust:

* Tasdiqlangan e’lonlar
* Qulay qidiruv
* Xarita orqali izlash
* To‘g‘ridan-to‘g‘ri aloqa

---

# 18. Rentals Page

Rentals page:

* search
* filters
* sorting
* property grid
* map
* pagination/infinite loading
* empty state
* loading state.

Filterlar:

* City
* District
* Property type
* Price
* Rooms
* Bedrooms
* Bathrooms
* Area
* Floor
* Renovation
* Furnished
* Pets allowed
* Smoking allowed
* Verified only

Sort:

* Eng yangi
* Narxi arzon
* Narxi qimmat
* Eng ko‘p ko‘rilgan

---

# 19. Property Card

Property card:

* main image
* favorite button
* verification badge
* title
* location
* price
* period
* rooms
* area
* short metadata
* owner information.

Example:

```text
2 xonali zamonaviy kvartira

Samarqand, Registon

3 500 000 so‘m / oy

2 xona • 65 m² • 4-qavat
```

---

# 20. Property Details

Property Details sahifasi:

* gallery
* title
* price
* location
* property specifications
* amenities
* description
* map
* owner card
* verification
* favorite
* share
* contact
* rental request
* similar properties.

Desktop:

```text
Gallery / Main Content / Owner Card
```

Mobile:

```text
Gallery
Title
Price
Details
Amenities
Description
Map
Owner
CTA
```

---

# 21. Map

Map:

* property markers
* clustering
* current location
* radius search
* map/list synchronization
* selected marker
* property preview card.

Backend GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
```

PostgreSQL (PostGIS):

```text
GiST index — geography(Point, 4326)
```

Geospatial query:

* `ST_DWithin` — radius bo'yicha qidiruv
* `ST_Within` — hudud/polygon filtri

---

# 22. Favorites

Favorites page:

* saved properties
* grid/list
* filters
* sorting
* active yellow heart.

Empty state: *"Hozircha saqlangan e’lonlar yo‘q."*

Favorite uchun unique constraint: `userId + propertyId`

---

# 23. Authentication

Authentication:

* Register
* Login
* Logout
* Refresh token
* Phone verification
* Forgot password
* Reset password

Keyinchalik:

* Google OAuth
* Apple Sign-In

qo‘shilishi mumkin.

---

# 24. Authentication Architecture

Recommended:

```text
Access Token
+
Refresh Token
```

Refresh token:

* rotation
* secure
* httpOnly cookie.

Password:

* Argon2id yoki bcrypt.

---

# 25. Rental Request

Tenant rental request yuboradi: `Property, Message, Start Date, Duration, Price Snapshot`.

Status: `PENDING → ACCEPTED / REJECTED / CANCELLED → COMPLETED`

Muhim qoida:

Request yaratilganda property narxining snapshot qiymati saqlanadi.

Bu keyinchalik narx o‘zgarganda eski request tarixini buzmaslik uchun kerak.

---

# 26. My Rentals

My Rentals:

* Active
* Pending
* Completed
* Cancelled

Active rental:

* property
* owner
* start date
* end date
* price
* payment history
* contact
* status.

---

# 27. Chat

Chat:

* conversation list
* active conversation
* message
* typing indicator
* online/offline status
* read status
* attachment.

Desktop:

```text
Conversation List | Active Chat
```

Mobile:

```text
Conversation → Full Screen Chat
```

---

# 28. Socket.IO Events

```text
conversation:join

message:send

message:new

message:read

typing:start

typing:stop

presence:update
```

Socket connection authentication bilan himoyalanadi.

Faqat conversation participantlari message yuborishi mumkin.

Message:

1. DBga yoziladi
2. keyin socket orqali emit qilinadi.

---

# 29. Notifications

Notification turlari:

* Rental request accepted
* Rental request rejected
* New message
* Property verified
* Property rejected
* Price changed
* Saved search match
* Premium subscription
* Payment status

Notification group:

```text
Bugun
Kecha
Oldin
```

Unread notification:

* yellow accent
* unread indicator.

---

# 30. Profile

Profile:

* avatar
* name
* phone
* email
* verification
* statistics
* account settings
* activity
* security
* logout.

---

# 31. Owner Dashboard

Sidebar:

```text
Dashboard
E’lonlarim
E’lon berish
Ijara so‘rovlari
Xabarlar
Analitika
Profil
```

KPI:

* Views
* Favorites
* Messages
* Requests
* Conversion

Dashboardda:

* recent requests
* active properties
* quick actions
* recent messages.

---

# 32. Add Property Flow

Property yaratish 7 bosqich:

```text
1. Asosiy ma’lumotlar
2. Manzil
3. Narx
4. Qulayliklar
5. Rasmlar
6. Tavsif
7. Preview
```

Har bosqichda:

* validation
* next
* back
* save draft.

Oxirida:

```text
Publish
```

---

# 33. Property Status

`DRAFT, PENDING_VERIFICATION, ACTIVE, REJECTED, PAUSED, RENTED, DELETED`

Public search faqat `ACTIVE` propertylarni qaytaradi.

---

# 34. Owner Analytics

Metrics:

* Views
* Favorites
* Messages
* Requests
* Conversion rate

Filter:

* 7 days
* 30 days
* 90 days
* Custom range

Analytics:

* line chart
* bar chart
* top properties
* performance insights.

---

# 35. Database Schema (PostgreSQL)

Har bir jadval `id (uuid, PK)` bilan boshlanadi. `FK →` — boshqa jadvalga bog'lanish (relation).

| Jadval | Ustunlar |
|---|---|
| **users** | name, email (unique), phone (unique), passwordHash, avatar, role, isVerified, status, lastSeenAt, createdAt, updatedAt |
| **properties** | ownerId (FK→users), title, description, type, price, currency, period, rooms, bedrooms, bathrooms, area, floor, totalFloors, renovation, furnished, petsAllowed, smokingAllowed, address, location (geography Point), amenities (jsonb), status, isVerified, views, createdAt, updatedAt |
| **property_images** | propertyId (FK→properties), url, order |
| **favorites** | userId (FK→users), propertyId (FK→properties), createdAt — unique(userId, propertyId) |
| **rental_requests** | tenantId (FK→users), ownerId (FK→users), propertyId (FK→properties), message, startDate, duration, priceSnapshot, status, createdAt, updatedAt |
| **conversations** | propertyId (FK→properties, nullable), lastMessageId (FK→messages, nullable), createdAt, updatedAt |
| **conversation_participants** | conversationId (FK→conversations), userId (FK→users) |
| **messages** | conversationId (FK→conversations), senderId (FK→users), text, attachments (jsonb), readBy (jsonb), createdAt |
| **notifications** | userId (FK→users), type, title, body, data (jsonb), readAt, createdAt |
| **reports** | reporterId (FK→users), targetType, targetId, reason, description, priority, status, evidence (jsonb), resolvedBy (FK→users, nullable), resolvedAt, createdAt |
| **property_views** | propertyId (FK→properties), userId (FK→users, nullable), sessionId, createdAt |
| **reviews** | propertyId (FK→properties), authorId (FK→users), ownerId (FK→users), rating, text, status, createdAt |
| **subscriptions** | userId (FK→users), plan, status, provider, startAt, endAt, createdAt, updatedAt |
| **payments** | userId (FK→users), subscriptionId (FK→subscriptions, nullable), amount, currency, provider, transactionId, status, createdAt |

Eslatma: `images[]`, `amenities[]`, `participantIds[]`, `readBy[]` kabi Mongo-style arraylar relational modelga moslashtirildi — ba'zilari alohida jadval (`property_images`, `conversation_participants`), ba'zilari `jsonb` ustun (oddiy, query qilinmaydigan ro'yxatlar uchun).

---

# 36. User Status

`ACTIVE, SUSPENDED, DELETED`

---

# 37. Report Status

`OPEN, REVIEWING, RESOLVED, REJECTED`

---

# 38. API Standard

Base URL:

```text
/api/v1
```

Response:

```json
{
  "success": true,
  "data": {},
  "message": "OK",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

API talablari:

* DTO validation
* consistent errors
* pagination
* filtering
* sorting
* rate limiting
* Swagger/OpenAPI
* authorization
* logging.

---

# 39. Auth API

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/verify-phone
POST /auth/forgot-password
POST /auth/reset-password
```

---

# 40. Users API

```text
GET /users/me
PATCH /users/me
PATCH /users/me/avatar
```

---

# 41. Properties API

```text
GET /properties
POST /properties
GET /properties/:id
PATCH /properties/:id
DELETE /properties/:id

POST /properties/:id/publish
POST /properties/:id/pause
```

---

# 42. Search API

```text
GET /properties?
city=
&type=
&minPrice=
&maxPrice=
&rooms=
&minArea=
&maxArea=
&lat=
&lng=
&radius=
&sort=
&page=
&limit=
```

Search:

* URL query params orqali boshqariladi
* debounce
* server-side filtering
* pagination
* indexed queries.

---

# 43. Favorites API

```text
GET /favorites
POST /favorites/:propertyId
DELETE /favorites/:propertyId
```

---

# 44. Rental Request API

```text
POST /rental-requests
GET /rental-requests/my
GET /owner/rental-requests
PATCH /rental-requests/:id
```

---

# 45. Chat API

```text
GET /conversations
POST /conversations

GET /conversations/:id/messages
POST /conversations/:id/messages
```

---

# 46. Notifications API

```text
GET /notifications
PATCH /notifications/:id/read
POST /notifications/read-all
```

---

# 47. Reports API

```text
POST /reports

GET /admin/reports
PATCH /admin/reports/:id
```

---

# 48. Verification API

```text
GET /admin/verification
GET /admin/verification/:id

POST /admin/verification/:id/approve
POST /admin/verification/:id/reject
```

---

# 49. Admin API

```text
GET /admin/users
PATCH /admin/users/:id/status

GET /admin/properties
PATCH /admin/properties/:id/status
```

---

# 50. Analytics API

```text
GET /owner/analytics
GET /admin/analytics
```

---

# 51. Image Upload

Allowed:

```text
JPEG
PNG
WebP
```

Default:

```text
SVG — disabled
```

Upload flow:

```text
Client
 ↓
Multipart upload
 ↓
Backend validation
 ↓
Image processing
 ↓
Cloudinary/S3
 ↓
URL
 ↓
PostgreSQL
```

Talablar:

* MIME validation
* file size validation
* dimensions validation
* resize
* compression
* WebP
* orphan cleanup.

---

# 52. Database Indexes (PostgreSQL)

* **users** — unique(email), unique(phone)
* **properties** — index(ownerId, status, type, price, rooms, createdAt); GiST index(location) — PostGIS geospatial
* **favorites** — unique(userId, propertyId)
* **rental_requests** — index(tenantId, ownerId, propertyId, status)
* **messages** — composite index(conversationId, createdAt)
* **notifications** — composite index(userId, createdAt), composite index(userId, readAt)
* **reports** — composite index(status, priority, createdAt)

---

# 53. Security

Security talablar:

* Argon2id/bcrypt
* JWT rotation
* httpOnly cookies
* secure cookies
* CORS
* Helmet
* DTO validation
* sanitization
* XSS protection
* CSRF strategy
* rate limiting
* admin audit logs
* secrets management.

Login, register, OTP, password reset va report endpointlari rate-limit qilinadi.

---

# 54. Business Rules

## Property

Owner faqat o‘z propertylarini:

* edit
* delete
* pause
* publish

qila oladi.

## Rental Request

Tenant faqat o‘z requestlarini boshqaradi.

## Chat

Faqat conversation participantlari chatga kira oladi.

## Verification

Verified badge backend verification statusiga asoslanadi.

## Suspended User

Suspended user:

* yangi property publish qila olmaydi
* yangi request yubora olmaydi
* kerakli actionlar bloklanadi.

## Deleted Property

Deleted property public searchda ko‘rinmaydi.

---

# 55. Premium

Premium sahifa:

* benefits
* monthly plan
* yearly plan
* comparison
* FAQ
* trust
* CTA.

Premium architecture:

```text
User
 ↓
Subscription
 ↓
Payment Provider
 ↓
Webhook
 ↓
Backend
 ↓
Subscription Status
```

Muhim:

Payment webhook authoritative source hisoblanadi.

Webhook:

* signature verification
* idempotency

bilan himoyalanadi.

---

# 56. Premium Plans

Masalan: `Monthly, Yearly`. Plan imkoniyatlari feature flag orqali boshqariladi.

Premium status: `ACTIVE, CANCELLED, EXPIRED, PAST_DUE`

---

# 57. Admin Dashboard

Admin dashboard:

* total users
* active users
* total properties
* active properties
* pending verification
* open reports
* rental requests
* revenue
* growth charts.

Sections:

```text
Overview
Recent Users
Recent Properties
Verification Queue
Reports
Analytics
```

---

# 58. Admin Users

Admin Users:

* search
* filter
* role
* status
* registration date
* detail drawer
* suspend
* activate
* bulk actions.

---

# 59. Admin Properties

Admin Properties:

* search
* property type
* status
* verification
* owner
* date
* price
* detail drawer
* pause
* reject
* delete.

---

# 60. Verification

Verification queue: `Pending, Reviewing, Approved, Rejected`

Review screen:

* property images
* owner
* address
* description
* price
* documents if required
* checklist.

Actions: `Approve, Reject, Request Information`

Reject qilishda reason majburiy.

---

# 61. Reports / Moderation

Report sabablari:

* Fake listing
* Wrong price
* Wrong location
* Scam
* Duplicate
* Inappropriate content
* Other.

Priority: `LOW, MEDIUM, HIGH, CRITICAL`

Admin:

* review
* resolve
* reject
* suspend
* remove listing

qila oladi.

---

# 62. Frontend Components

* **Navigatsiya**: `Navbar, Sidebar, BottomNav`
* **Qidiruv**: `SearchBar, FilterDrawer`
* **Property**: `PropertyCard, PropertyGallery, PropertyDetails, MapView, OwnerCard`
* **UI primitives**: `Modal, Drawer, Dropdown, Tabs, Badge, Toast, Tooltip`
* **Holat/feedback**: `Pagination, Skeleton, EmptyState, ErrorState`
* **Forma**: `Input, Select, Checkbox, Radio, DatePicker, Upload`
* **Dashboard**: `KPI Card, Chart, Request Card`
* **Chat**: `ChatList, MessageBubble, TypingIndicator, AttachmentPreview`

---

# 63. State Management

## TanStack Query

Server state uchun:

* properties
* users
* requests
* notifications
* conversations
* analytics.

## Zustand

Client state uchun:

* UI state
* modal
* drawer
* session-related state
* local preferences.

## URL Search Params

Search/filter uchun asosiy source of truth:

```text
URL Query Params
```

Misol:

```text
/rentals?city=samarkand&rooms=2&maxPrice=4000000
```

---

# 64. Forms

React Hook Form ishlatiladi.

Validation:

* required fields
* type
* min/max
* format
* file validation.

Error message har bir inputga yaqin ko‘rsatiladi.

---

# 65. Loading States

Har bir asosiy page:

* initial loading
* skeleton
* button loading
* upload progress
* pagination loading

holatlariga ega bo‘lishi kerak.

---

# 66. Empty States

Misollar:

* *"Hozircha e’lonlar topilmadi."*
* *"Hozircha saqlangan e’lonlar yo‘q."*
* *"Hozircha ijara so‘rovlari mavjud emas."*

Har bir empty state action bilan yakunlanishi kerak.

---

# 67. Error States

Tizim:

* API error
* network error
* 404
* 401
* 403
* 500
* session expired

holatlarini ko‘rsatishi kerak.

Misol: *"Nimadir noto‘g‘ri ketdi. Qayta urinib ko‘ring."* — CTA: **"Qayta urinish"**

---

# 68. Performance

Talablar:

* Server Components default
* Client Components faqat kerak bo‘lganda
* image optimization
* lazy loading
* pagination
* caching
* debounce
* map clustering
* database indexes
* projection
* code splitting
* bundle optimization.

Property images optimallashtirilishi shart.

---

# 69. SEO

Har bir public property page:

* dynamic title
* meta description
* Open Graph
* canonical
* structured data.

Global:

```text
sitemap.xml
robots.txt
```

Property URL:

```text
/property/[id]
```

yoki SEO uchun:

```text
/property/[slug]
```

---

# 70. Background Jobs

Background jobs:

1. Expired subscriptions
2. Notification cleanup
3. Daily analytics aggregation
4. Orphan image cleanup
5. Expired rental requests
6. Price alerts
7. Email/push notification jobs

Recommended: `BullMQ + Redis`

---

# 71. Logging

Backend:

* JSON logs
* request ID
* timestamp
* endpoint
* status
* response time
* user ID where appropriate
* error stack.

---

# 72. Monitoring

Monitoring:

* Sentry
* API latency
* error rate
* database latency
* queue health
* server health
* memory
* CPU.

Endpoints:

```text
GET /health
GET /ready
```

---

# 73. Audit Logs

Admin actions: `USER_SUSPENDED, USER_ACTIVATED, PROPERTY_APPROVED, PROPERTY_REJECTED, PROPERTY_DELETED, REPORT_RESOLVED, REPORT_REJECTED, VERIFICATION_APPROVED, VERIFICATION_REJECTED`

Audit log: `adminId, action, targetType, targetId, metadata, createdAt`

---

# 74. Environment Variables

```text
NODE_ENV=
PORT=

DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

FRONTEND_URL=
CORS_ORIGINS=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

REDIS_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

PAYMENT_PROVIDER_KEY=
PAYMENT_WEBHOOK_SECRET=

SENTRY_DSN=
```

Secretlar Git repositoryga commit qilinmaydi.

---

# 75. Deployment

## Frontend

```text
Next.js
↓
Vercel
```

## Backend

```text
NestJS
↓
Render / Railway / VPS
```

## Database

```text
PostgreSQL (Neon / Supabase)
```

## Storage

```text
Cloudinary / S3
```

## Cache

```text
Redis
```

Productionda:

* HTTPS
* environment secrets
* CORS
* monitoring
* backups

sozlanadi.

---

# 76. Docker

Development uchun `docker-compose.yml` orqali `PostgreSQL, Redis, Backend, Frontend` local environmentda ishga tushirilishi mumkin.

---

# 77. CI/CD

GitHub Actions:

```text
Push
 ↓
Install
 ↓
Lint
 ↓
Typecheck
 ↓
Tests
 ↓
Build
 ↓
Deploy
```

Production deployment faqat CI muvaffaqiyatli bo‘lganda amalga oshiriladi.

---

# 78. Git Workflow

Branchlar:

```text
main
develop
feature/*
fix/*
hotfix/*
```

Workflow:

```text
feature
 ↓
Pull Request
 ↓
Review
 ↓
CI
 ↓
Merge
```

---

# 79. Testing

## Unit Testing

Test qilinadi:

* services
* utils
* validators
* business rules.

## Integration Testing

* PostgreSQL
* NestJS modules
* authentication
* authorization.

## E2E

Asosiy flow:

```text
Register
 ↓
Login
 ↓
Search
 ↓
Property Details
 ↓
Favorite
 ↓
Rental Request
 ↓
Owner Accept
 ↓
Chat
```

## Security Testing

* RBAC bypass
* authentication bypass
* injection
* upload validation
* rate limit
* unauthorized access.

---

# 80. MVP

MVP tarkibi:

* Home
* Ijaralar
* Property Details
* Auth
* RBAC
* Property CRUD
* Image upload
* Search
* Filters
* Map
* Favorites
* Rental Request
* Basic Chat
* Notifications
* Owner Dashboard
* Admin Verification
* Reports
* Responsive UI
* Dark Mode.

---

# 81. Phase 2

Keyingi bosqich:

* Premium
* Payments
* Saved Searches
* Price Alerts
* Reviews
* Advanced Analytics
* Advanced Moderation
* Push Notifications
* Email Notifications
* AI recommendations
* Mobile application.

---

# 82. AI Future Features

Kelajakda:

```text
AI Property Recommendation
AI Search Assistant
AI Price Estimation
AI Description Generator
AI Fraud Detection
AI Personalized Recommendations
```

AI backend service sifatida ajratiladi.

Masalan:

```text
NestJS
 ↓
AI Service
 ↓
Recommendation Engine
```

AI qarorlari critical moderation/payment kabi jarayonlarda backend business rulesni almashtirmaydi.

---

# 83. Internationalization

Kelajakda:

```text
UZ
RU
EN
```

qo‘llab-quvvatlanishi mumkin.

Frontend barcha static textlarni translation key orqali ishlatishga tayyor bo‘lishi kerak.

Misol:

```text
home.hero.title
property.price
property.rooms
auth.login
```

---

# 84. Notifications Architecture

Event-driven notification:

```text
Business Event
 ↓
Notification Service
 ↓
In-App Notification
 ↓
Optional Push / Email
```

Misol:

```text
Rental Request Accepted
 ↓
Notification Service
 ↓
Tenant Notification
```

---

# 85. Property Lifecycle

```text
DRAFT
  ↓
PENDING_VERIFICATION
  ↓
ACTIVE
  ↓
PAUSED
  ↓
ACTIVE
  ↓
RENTED
```

Reject:

```text
PENDING_VERIFICATION
  ↓
REJECTED
```

Delete:

```text
Any valid state
  ↓
DELETED
```

---

# 86. Rental Request Lifecycle

```text
PENDING
  ↓
ACCEPTED
  ↓
COMPLETED
```

Alternative:

```text
PENDING
  ↓
REJECTED
```

or:

```text
PENDING
  ↓
CANCELLED
```

---

# 87. User Journey

```text
Home
 ↓
Search
 ↓
Rentals
 ↓
Property Details
 ↓
Favorite
 ↓
Contact Owner
 ↓
Chat
 ↓
Rental Request
 ↓
Accepted
 ↓
My Rentals
```

---

# 88. Owner Journey

```text
Register
 ↓
Owner Dashboard
 ↓
Create Property
 ↓
Upload Images
 ↓
Preview
 ↓
Publish
 ↓
Verification
 ↓
Active
 ↓
Receive Request
 ↓
Chat
 ↓
Accept Request
```

---

# 89. Admin Journey

```text
Admin Login
 ↓
Dashboard
 ↓
Verification Queue
 ↓
Review Property
 ↓
Approve / Reject
 ↓
Reports
 ↓
Moderation
 ↓
Analytics
```

---

# 90. Data Ownership Rules

* User o‘z profilini boshqaradi.
* Owner o‘z propertylarini boshqaradi.
* Tenant o‘z requestlarini boshqaradi.
* Conversation faqat participantlarga tegishli.
* Admin moderation huquqiga ega.
* Backend barcha ownershipni tekshiradi.

Frontenddagi ID yoki role qiymatiga ishonilmaydi.

---

# 91. API Error Standard

Misol:

```json
{
  "success": false,
  "message": "Property not found",
  "error": {
    "code": "PROPERTY_NOT_FOUND"
  }
}
```

Common codes:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

---

# 92. Pagination

Default: `page=1, limit=20`  •  Maximum: `limit=100`

Backend limitni majburiy nazorat qiladi.

Response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

---

# 93. Search Performance

Search querylar uchun:

* PostgreSQL indexes
* projection
* pagination
* debounce
* cache
* geospatial index

ishlatiladi.

Map endpoint barcha property fieldlarini qaytarmaydi.

Faqat kerakli ma’lumot:

```text
id
title
price
location
mainImage
type
```

---

# 94. File Security

Uploadda:

* MIME tekshirish
* extension tekshirish
* size limit
* dimensions
* filename sanitization
* storage URL
* unauthorized access prevention.

Executable fayllar qabul qilinmaydi.

---

# 95. Database Backup

Production PostgreSQL:

* automated backups
* point-in-time recovery imkoniyati
* monitoring.

Backup strategiyasi alohida production policy sifatida belgilanadi.

---

# 96. Scalability

Boshlang‘ich: `1 Frontend, 1 Backend, 1 PostgreSQL, 1 Redis`

Scale:

```text
Load Balancer
      ↓
Backend Instance 1
Backend Instance 2
Backend Instance 3
      ↓
PostgreSQL
Redis
Storage
```

Socket.IO ko‘paytirilganda Redis adapter ishlatilishi mumkin.

---

# 97. Caching

Cache qilinishi mumkin:

* popular cities
* featured properties
* public configuration
* analytics
* expensive search queries.

User-specific sensitive data default holatda umumiy cache qilinmaydi.

---

# 98. Rate Limits

Misol:

```text
Login
Register
OTP
Password Reset
Reports
Messages
```

uchun alohida rate limit policy.

Aniq limitlar production traffic va security monitoring asosida belgilanadi.

---

# 99. Privacy

Foydalanuvchining:

* telefon
* email
* private profile data
* private messages

ma’lumotlari faqat ruxsat etilgan foydalanuvchilarga ko‘rsatiladi.

Property public data va private user data alohida boshqariladi.

---

# 100. Definition of Done

Feature tayyor hisoblanishi uchun:

* frontend mavjud
* backend mavjud
* API integratsiya qilingan
* authorization ishlaydi
* validation mavjud
* loading state mavjud
* empty state mavjud
* error state mavjud
* success state mavjud
* responsive
* mobile UI
* tests mavjud
* documentation yangilangan
* logs mavjud
* production build muvaffaqiyatli
* secrets source code ichida yo‘q.

---

# 101. Development Roadmap

## Sprint 1 — Foundation

```text
Project Setup
Design System
Next.js
NestJS
PostgreSQL
Auth
RBAC
User
Property CRUD
```

## Sprint 2 — Marketplace

```text
Search
Filters
Map
Property Details
Favorites
Owner Dashboard
Image Upload
```

## Sprint 3 — Rental

```text
Rental Request
My Rentals
Chat
Socket.IO
Notifications
Verification
Reports
```

## Sprint 4 — Admin & Production

```text
Admin Dashboard
Users
Properties
Analytics
SEO
Security
Testing
CI/CD
Deployment
Monitoring
```

## Phase 2

```text
Premium
Payments
Reviews
Saved Searches
Price Alerts
Push
Email
AI
Mobile
```

---

# 102. Final Architecture

```text
                         ┌─────────────────────┐
                         │       User          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      Next.js        │
                         │       Web App       │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
             TanStack Query                    Zustand
                    │
                    ▼
             ┌───────────────┐
             │    NestJS     │
             │    REST API   │
             └───────┬───────┘
                     │
          ┌──────────┼───────────┐
          ▼          ▼           ▼
     PostgreSQL     Redis      Storage
     (PostGIS)                Cloudinary/S3
          │
          ▼
   Business Services
          │
   ┌──────┼────────┬───────────┐
   ▼      ▼        ▼           ▼
 Auth   Search    Chat      Notifications
         │          │           │
         ▼          ▼           ▼
      GeoJSON    Socket.IO   Background Jobs

                 │
                 ▼
          Payment Provider

GitHub
   ↓
GitHub Actions
   ↓
CI/CD
   ↓
Vercel + Backend Hosting
```

---

# 103. Yakuniy talab

RentUZ ishlab chiqilishida asosiy maqsad — oddiy e’lonlar saytini emas, balki O‘zbekiston bozori uchun zamonaviy, scalable, xavfsiz va premium rental marketplace yaratish.

Platforma quyidagi asosiy prinsiplarni saqlashi kerak: `Simple, Fast, Trustworthy, Secure, Responsive, Scalable, Modern`

RentUZ MVP productionga chiqarilgandan keyin Premium, Payments, AI, Push Notifications va Mobile App orqali bosqichma-bosqich kengaytiriladi.

---

# Document Status

**Project:** RentUZ
**Version:** 1.0
**Status:** Technical Specification
**Architecture:** Next.js + NestJS + PostgreSQL
**Default UI:** Dark Mode
**Primary Accent:** Warm Yellow
**Target Market:** Uzbekistan
