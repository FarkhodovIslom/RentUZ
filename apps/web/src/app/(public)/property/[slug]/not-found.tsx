import { EmptyState } from '@rentuz/ui';

export default function PropertyNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <EmptyState
        title="E’lon topilmadi"
        description="Bu e’lon o‘chirilgan yoki vaqtincha ko‘rinmas bo‘lishi mumkin."
        action={
          <a
            href="/rentals"
            className="inline-flex h-10 items-center rounded-[12px] bg-primary px-4 text-sm font-semibold text-black hover:bg-primary-hover"
          >
            Ijaralarni ko‘rish
          </a>
        }
      />
    </div>
  );
}
