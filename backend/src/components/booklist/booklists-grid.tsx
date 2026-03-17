import { type ReactNode } from "react";

interface BooklistsGridProps<T extends { id: number }> {
  items: T[];
  showPodium?: boolean;
  renderCard: (item: T) => ReactNode;
}

export function BooklistsGrid<T extends { id: number }>({
  items,
  showPodium = true,
  renderCard,
}: BooklistsGridProps<T>) {
  if (!showPodium) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        {items.map((item) => (
          <div key={item.id}>{renderCard(item)}</div>
        ))}
      </div>
    );
  }

  const topItems = items.slice(0, 3);
  const restItems = items.slice(3);

  return (
    <>
      {/* Top 3 podium */}
      {topItems.length > 0 && (
        <div className="hidden sm:grid grid-cols-3 gap-5">
          {topItems.map((item) => (
            <div key={item.id}>{renderCard(item)}</div>
          ))}
        </div>
      )}

      {/* Mobile: all in one column */}
      {topItems.length > 0 && (
        <div className="flex flex-col gap-4 sm:hidden">
          {items.map((item) => (
            <div key={item.id}>{renderCard(item)}</div>
          ))}
        </div>
      )}

      {/* Desktop: remaining in 2-col grid */}
      {restItems.length > 0 && (
        <div className="hidden sm:grid gap-5 lg:grid-cols-2">
          {restItems.map((item) => (
            <div key={item.id}>{renderCard(item)}</div>
          ))}
        </div>
      )}
    </>
  );
}
