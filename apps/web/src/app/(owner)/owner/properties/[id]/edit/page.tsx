import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { api } from '@/lib/api';
import { WizardForm } from '@/components/owner/wizard/WizardForm';

type PropertyDetail = {
  id: string;
  title: string;
  description: string;
  type: string;
  price: number;
  currency: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  address: string;
  regionId: string | null;
  districtId: string | null;
  lng: number | null;
  lat: number | null;
  furnished: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  amenities: string[];
  status: string;
};

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  let property: PropertyDetail;
  try {
    property = await api.get<PropertyDetail>(`/properties/${id}`);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{property.title || 'Yangi e\'lon'}</h1>
        <p className="text-sm text-fg-secondary">Status: {property.status}</p>
      </header>
      <WizardForm initial={property} propertyId={id} />
    </div>
  );
}
