import { Icon } from "@/components/ui/icon";

export function MarketHeader({
  crop,
  location,
  crops,
  locations,
  onCropChange,
  onLocationChange,
}: {
  crop: string;
  location: string;
  crops: string[];
  locations: string[];
  onCropChange: (value: string) => void;
  onLocationChange: (value: string) => void;
}) {
  return (
    <header className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[9px] font-extrabold uppercase tracking-[.15em] text-success sm:text-[10px] sm:tracking-[.18em]">
          Prices · trends · opportunity
        </p>
        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight text-brand-dark min-[380px]:text-3xl sm:text-4xl">
          Market Intelligence
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-5 text-muted sm:text-sm sm:leading-6">
          Compare live AMIS mandi observations before making a selling decision.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1 lg:w-[28rem]">
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Location
          <span className="relative">
            <Icon
              name="farm"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand"
            />
            <select
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-brand/10 bg-white pl-9 pr-7 text-[11px] font-bold normal-case text-foreground shadow-sm sm:pl-10 sm:text-xs"
            >
              {locations.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </span>
        </label>
        <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Crop
          <span className="relative">
            <Icon
              name="field"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand"
            />
            <select
              value={crop}
              onChange={(event) => onCropChange(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-brand/10 bg-white pl-9 pr-7 text-[11px] font-bold normal-case text-foreground shadow-sm sm:pl-10 sm:text-xs"
            >
              {crops.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </span>
        </label>
      </div>
    </header>
  );
}
