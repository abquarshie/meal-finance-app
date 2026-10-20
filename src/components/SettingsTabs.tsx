import { PageHead, Tabs } from "./ui";

export function SettingsHead({ current, sub }: { current: string; sub: string }) {
  return (
    <>
      <PageHead title="Settings" />
      <Tabs current={current} tabs={[{ href: "/settings/accounts", label: "Accounts" },
        { href: "/settings/categories", label: "Categories" }, { href: "/settings/people", label: "People" }]} />
      <p className="page-sub -mt-2 mb-4">{sub}</p>
    </>
  );
}
