import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Maxfiylik siyosati',
  description: 'RentUZ maxfiylik siyosati — qanday ma’lumotlar yig’iladi va qanday himoyalanganadi.',
  alternates: { canonical: '/privacy' },
};

/**
 * §99 / 8_Phase.md §1.8 item 47: static placeholder — the final legal text is
 * owned by the project owner (pre-launch checklist). Structure below covers
 * the points the MVP actually does (no tracking, no third-party analytics,
 * auth cookies only, phone-first accounts).
 */
export default function PrivacyPage() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">Maxfiylik siyosati</h1>
      <p className="mt-2 text-sm text-fg-muted">Oxirgi yangilanish: 2026-09</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-fg-secondary">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">1. Qanday ma’lumotlar yig’amiz</h2>
          <p>
            RentUZ faqat xizmat ko’rsatish uchun zarur ma’lumotlarni yig’adi: telefon raqamingiz
            (kirish va tasdiqlash uchun), ismingiz, ixtiyoriy email, e’lonlaringiz mazmuni va
            platformadagi amallaringiz tarixi (arizalar, xabarlar). Kuzatuv yoki reklamaga
            yo’naltirilgan ma’lumot yig’maymiz — MVP bosqichida tahliliy yoki marketing
            cookie’lar ishlatilmaydi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">2. Cookie’lar</h2>
          <p>
            Faqat zarur cookie’lar ishlatiladi: kirish sessiyasi (httpOnly, brauzerda o’qib
            bo’lmaydi) va xavfsizlik tokeni. Chat rasmlari uchun vaqtinchalik havolalar imzolanadi
            va qat’iy muddatdan keyin o’chiriladi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">3. Ma’lumotlaringiz himoyasi</h2>
          <p>
            Parollar Argon2id algoritmi bilan hashlanadi. Telefon raqamingiz va emailingiz
            faqat sizning ruxsatingiz bilan boshqa foydalanuvchiga ko’rsatiladi — e’lon
            sahifalarida mulk egasining aloqa ma’lumotlari oshkor qilinmaydi, aloqa platforma
            ichidagi chat orqali amalga oshadi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">4. Ma’lumot saqlash muddati</h2>
          <p>
            Hisobingizni o’chirsangiz, shaxsingizni aniqlashga imkon beruvchi ma’lumotlar
            o’chiriladi. Xizmat ko’rsatish tarixi qonuniy talablar doirasida saqlanishi mumkin.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-fg">5. Aloqa</h2>
          <p>
            Maxfiylik bo’yicha savollaringiz uchun: RentUZ texnik qo’llab-quvvatlash jamoasi
            (to’liq aloqa kanali pre-launch bosqichida qo’shiladi).
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
