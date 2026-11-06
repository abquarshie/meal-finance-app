// What's new: shown once on each phone or computer when the app opens after an update (components/WhatsNew.tsx).
// Every pull request that changes something people will notice adds an entry at the TOP of NEWS, with the next id,
// today's date and a few plain sentences. Entries never change id once released.
export type News = { id: number; date: string; title: string; items: string[] };

export const NEWS: News[] = [
  {
    id: 3, date: "2026-11-06", title: "Meal plan in your calendar",
    items: [
      "Subscribe to the meal plan from your phone or Google Calendar: open the Meal plan page and use the calendar card.",
      "Breakfast, lunch and supper show at 7:00, 13:00 and 19:00, and changes reach the calendar on their own.",
      "This What's new card, so you hear about updates when you open the app.",
    ],
  },
  {
    id: 2, date: "2026-11-05", title: "MoMo texts and Month in review",
    items: [
      "Share a MoMo text into the app to add the entry for you.",
      "Month in review sums up where the money went.",
      "The shopping list estimate is compared with the food budget.",
    ],
  },
  {
    id: 1, date: "2026-10-30", title: "Finance and Meal",
    items: [
      "Two home-screen apps, Finance and Meal, on the same account.",
      "The Meal home shows what is coming up, what is running low and what is in the fridge.",
    ],
  },
];
