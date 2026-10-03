import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("relative bg-accent rounded-md overflow-hidden", className)}
      {...props}
    >
      <div className="absolute inset-0 animate-[shimmer-slide_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
    </div>
  )
}

export { Skeleton }
