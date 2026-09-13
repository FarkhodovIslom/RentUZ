# UI states matrix (§100 / 8_Phase.md §1.7)

Per-page inventory of loading / empty / error / success states. Evidence lives
in the E2E suite (`apps/web/e2e/`) and the components listed; skeleton
primitives come from `@rentuz/ui`.

| Page | Loading | Empty | Error | Success |
|---|---|---|---|---|
| `/` home | Hero search skeleton (Suspense); cards: Skeleton grid | Popular cities hidden when 0; listing sections hidden when 0 | Sections degrade silently (API down → static hero + trust + FAQ still render) | Featured/new listing grids render |
| `/rentals` | Card skeleton grid (Suspense) | EmptyState "Hech narsa topilmadi" + filter-reset CTA | 400 (bad filters) → reset to defaults; API 5xx → error boundary | Grid + pagination (`Pagination`, roving arrows) |
| `/map` | Map canvas placeholder + Skeleton | "Belgini tanlang" prompt (no selection) | Tiles blocked → maplibre AJAXError logged, page shell stays usable | Pin popup with price + "Batafsil"; URL bbox syncs (E2E map-drag) |
| `/property/[slug]` | RSC streams; gallery first | Missing listing → 404 page (EmptyState "E'lon topilmadi") | API down → error page (notFound boundary) | Full details: gallery, specs, amenities, owner card, mini-map, similar; UUID→slug 301 |
| `/login` | Button spinner while submitting | — | Inline field errors (aria-describedby); invalid-credentials toast; locked toast | Redirects to `/` (or ?next=) |
| `/register` | Button spinner | — | Field errors; duplicate-phone error | OTP flow → verify-phone |
| `/verify-phone` | Submitting state | — | "Kod xato yoki muddati tugagan" inline | Success message → redirect |
| `/forgot-password` | Sending state | — | Silent success (no user enumeration) | "Kod yuborildi" notice |
| `/reset-password` | Submitting | — | Invalid-code / weak-password inline errors | Password changed → login |
| `/favorites` (auth) | Skeleton list | EmptyState "Hozircha saqlangan e'lonlar yo'q" + CTA | Session expired → login redirect | Grid of saved cards; un-favorite updates optimistically |
| `/rental-requests` | Skeleton rows | EmptyState | Toast on failures | Status chips per request; cancel with confirm |
| `/my-rentals` | Skeleton tabs | Per-tab empty states | Toast | Active/History tabs with frozen-price rows |
| `/chat` | "Yuklanmoqda..." pane | Conversation list: "Hali suhbatlar yo'q"; pane: "Xabarlar yo'q" | Send failures → toast + retry affordance | Realtime bubbles, read receipts, typing, attachments pill |
| `/notifications` | Skeleton | "Hozircha bildirishnomalar yo'q" | Silent | Bugun/Kecha/Oldin groups; mark-all clears badge |
| `/owner` dashboard | KPI skeletons | "Hali e'lon yo'q" + create CTA | Toast | KPIs, recent lists, 14-day sparkline |
| `/owner/properties` | Rows skeleton | Empty + "Birinchi e'loningizni yarating" | Toast | Status chips, actions (pause/resume/edit) |
| `/owner/properties/create` (wizard) | Step transitions | — | Per-step validation messages | "Yuborildi!" banner → dashboard |
| `/owner/requests` | Rows skeleton | Per-status empty | Toast | Accept/reject with confirm; status flips |
| `/owner/analytics` | Chart skeletons | "Bu davrda yetarli ma'lumot yo'q" | Toast | Live + rollup charts, insights panel |
| `/admin/*` | Table skeletons | Per-table EmptyStates ("Navbat bo'sh", "Foydalanuvchi topilmadi"…) | Forbidden → /forbidden redirect; toasts | Queues, drawers, confirm modals with mandatory reasons |
| `/forbidden` | — | — | — | Static explanation + back-home CTA |
| 404 (any) | — | — | — | EmptyState "Sahifa topilmadi" + back-home |
| Cookie banner | — | — | — | Shows once until dismissed (localStorage; E2E spec) |

Global: `Toaster` (bottom toasts) covers mutation feedback app-wide;
`SkipLink` is the first tab stop on every page (a11y suite).
