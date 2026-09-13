import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Foydalanish shartlari',
  description: 'RentUZ xizmatidan foydalanish shartlari.',
  alternates: { canonical: '/terms' },
};

/**
 * §99 / 8_Phase.md §1.8 item 47: static placeholder — the final legal text is
 * owned by the project owner (pre-launch checklist). Covers the MVP reality:
 * no payments on-platform, direct owner-tenant agreements.
 */
export default function TermsPage() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Foydalanish shartlari</h1>
      <p className="mt-2 text-sm text-fg-muted">Oxirgi yangilanish: 2026-09</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-secondary">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">1. Xizmat tabiati</h2>
          <p>
            RentUZ — O’zbekistonda ijara uylar bo’yicha e’lonlar platformasi. Biz e’lon
            joylashtirish, qidirish, ijara so’rovlari va mulk egasi bilan chat imkoniyatini
            beramiz. Platforma to’lov yoki shartnoma tomoni EMAS: ijara shartlari, narx va
            to’lovlar egasi va ijarachi o’rtasida to’g’ridan-to’g’ri kelishiladi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">2. E’lonlar moderasiyasi</h2>
          <p>
            Har bir e’lon moderatsiyadan o’tadi. Yolg’on, firibgarlik yoki nusxa e’lonlar
            rad etiladi yoki o’chiriladi. Qoidabuzarlik takrorlanganda hisob to’xtatilishi
            mumkin.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">3. Foydalanuvchi javobgarligi</h2>
          <p>
            E’lonlarda kiritilgan ma’lumotlar (narx, manzil, rasmlar) to’g’riligi uchun e’lon
            egasi javob beradi. Platformada joylashtirilgan kontent qonunlarga zid bo’lmasligi
            shart.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">4. Bekor qilish</h2>
          <p>
            Xizmat «shunday holatda» (as-is) taqdim etiladi. MVP bosqichida barcha e’lonlar
            bepul; pulli imkoniyatlar joriy etilsa, shartlar yangilanadi.
          </p>
        </section>

        <p className="rounded-[12px] border border-border bg-card p-3 text-xs text-fg-muted">
          Eslatma: bu sahifa strukturaviy namuna — yakuniy matn loyiha egasi tomonidan
          yuridik ko’rib chiqilgandan keyin tasdiqlanadi.
        </p>
      </div>
    </main>
  );
}
