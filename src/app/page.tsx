import { ServiceTabs } from "@/components/ServiceTabs";
import {
  renderFlightSearch,
  type FlightSearchParams,
} from "@/lib/flights/searchPage";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<FlightSearchParams>;
}) {
  const raw = await searchParams;
  return (
    <>
      <ServiceTabs active="flights" />
      {await renderFlightSearch(raw)}
    </>
  );
}
