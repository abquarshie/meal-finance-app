import { Tabs } from "@/components/ui";
import { KitchenHead } from "./KitchenTabs";

export function RecipeHead({ current }: { current: string }) {
  return (
    <>
      <KitchenHead current="/meals/recipes" title="Recipes" sub="Your recipe book and the ingredients it uses" />
      <Tabs current={current} tabs={[{ href: "/meals/recipes", label: "Recipes" },
        { href: "/meals/recipes/ingredients", label: "Ingredients" }]} />
    </>
  );
}
