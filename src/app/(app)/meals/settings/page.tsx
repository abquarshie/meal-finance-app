import { KitchenHead } from "@/components/kitchen/KitchenTabs";
import { loadKitchen } from "@/lib/kitchen/load";
import { PeopleSettings } from "./PeopleSettings";

export const metadata = { title: "Kitchen settings" };

export default async function KitchenSettings() {
  const k = await loadKitchen();
  return (
    <>
      <KitchenHead current="/meals/settings" title="Kitchen settings" />
      <div style={{ maxWidth: 560 }}><PeopleSettings slots={k.slotPeople} household={k.household} /></div>
    </>
  );
}
