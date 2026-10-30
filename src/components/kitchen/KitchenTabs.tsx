import { PageHead, Tabs } from "@/components/ui";

const TABS = [
  { href: "/meals", label: "Plan" }, { href: "/shopping", label: "Shopping" }, { href: "/pantry", label: "Pantry" },
  { href: "/meals/fridge", label: "Fridge" }, { href: "/meals/household", label: "Household" }, { href: "/meals/recipes", label: "Recipes" },
  { href: "/meals/settings", label: "Settings" },
];

export function KitchenHead({ current, title, sub }: { current: string; title: string; sub?: string }) {
  return (
    <>
      <PageHead title={title} />
      <Tabs current={current} tabs={TABS} />
      {sub ? <p className="page-sub -mt-2 mb-4">{sub}</p> : null}
    </>
  );
}
