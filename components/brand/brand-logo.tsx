import Image from "next/image";

export function BrandLogo({
  compact = false,
  className = "",
  priority = false,
}: {
  compact?: boolean;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={compact ? "/fasalguard-mark.png" : "/fasalguard-wordmark.png"}
      alt="FasalGuard AI"
      width={compact ? 128 : 640}
      height={compact ? 128 : 220}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
